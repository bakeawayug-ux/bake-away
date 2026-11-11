// The saving rules, run against the real device store with a pretend browser storage.
import { beforeEach, describe, expect, it } from 'vitest';
import { makeActions, type Actions } from '../src/data/actions';
import { makeLocalStore, readDeviceRecords } from '../src/data/localStore';
import type { Row, Store } from '../src/data/store';
import { deleteAllOps, makeBackup, readBackup, restoreOps, toCsv } from '../src/lib/backup';
import { orderTotals } from '../src/lib/orders';
import { stockLevels } from '../src/lib/stock';
import { COLLECTIONS, EMPTY_RECORDS, type Records } from '../src/lib/types';

function fakeStorage() {
  const map = new Map<string, string>();
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), map };
}

let storage: ReturnType<typeof fakeStorage>;
let store: Store;
let records: Records & { settings?: Row[] };
let actions: Actions;

/** Lets the store's notifications (sent on a microtask) arrive. */
const settle = () => new Promise((r) => setTimeout(r, 0));

function connect() {
  store = makeLocalStore(storage);
  records = { ...EMPTY_RECORDS };
  for (const col of COLLECTIONS) store.subscribe(col, (rows) => ((records as unknown as Record<string, Row[]>)[col] = rows), () => {});
  actions = makeActions(store, () => records);
}

beforeEach(async () => {
  storage = fakeStorage();
  connect();
  await settle();
});

const newOrder = (over: Record<string, unknown> = {}) => ({
  customerName: 'Sarah N',
  phone: '0772000111',
  date: '2026-11-10',
  dueDate: '2026-11-14',
  items: [{ what: 'Birthday cake 2 kg', qty: 1, price: 120000 }],
  delivery: 'Pick up' as const,
  stage: 'Booked' as const,
  ...over,
});

describe('orders and payments', () => {
  it('saves the order, its customer and its deposit together', async () => {
    const id = await actions.saveOrder(newOrder(), undefined, { amount: 50000, method: 'Mobile Money' });
    expect(records.orders).toHaveLength(1);
    expect(records.orders[0]).toMatchObject({ id, number: 'BA-0001', customerName: 'Sarah N' });
    expect(records.customers).toHaveLength(1);
    expect(records.orders[0].customerId).toBe(records.customers[0].id);
    expect(records.payments).toMatchObject([{ kind: 'order', refId: id, amount: 50000, method: 'Mobile Money', note: 'Deposit' }]);
    expect(orderTotals(records.orders[0], records.payments, '2026-11-11')).toMatchObject({ balance: 70000, payStatus: 'Part paid' });
  });

  it('reuses a customer whatever the capitals, and numbers orders in turn', async () => {
    await actions.saveOrder(newOrder());
    await actions.saveOrder(newOrder({ customerName: '  sarah n ' }));
    expect(records.customers).toHaveLength(1);
    expect(records.orders.map((o) => o.number).sort()).toEqual(['BA-0001', 'BA-0002']);
  });

  it('refuses an order with no item or no date, and a deposit above the total', async () => {
    await expect(actions.saveOrder(newOrder({ items: [{ what: ' ', qty: 1, price: 5 }] }))).rejects.toThrow(/at least one item/);
    await expect(actions.saveOrder(newOrder({ dueDate: '' }))).rejects.toThrow(/day the order is needed/);
    await expect(actions.saveOrder(newOrder(), undefined, { amount: 500000, method: 'Cash' })).rejects.toThrow(/more than the order/);
    expect(records.orders).toHaveLength(0); // nothing half-saved
    expect(records.customers).toHaveLength(0);
  });

  it('refuses a blank, zero or too-large payment', async () => {
    const id = await actions.saveOrder(newOrder());
    await expect(actions.addPayment('order', id, { amount: 0, date: '2026-11-11', method: 'Cash' })).rejects.toThrow(/above zero/);
    await expect(actions.addPayment('order', id, { amount: NaN, date: '2026-11-11', method: 'Cash' })).rejects.toThrow(/above zero/);
    await expect(actions.addPayment('order', id, { amount: 130000, date: '2026-11-11', method: 'Cash' })).rejects.toThrow(/more than the balance/);
    await actions.addPayment('order', id, { amount: 120000, date: '2026-11-11', method: 'Cash' });
    await expect(actions.addPayment('order', id, { amount: 1, date: '2026-11-11', method: 'Cash' })).rejects.toThrow(/already fully paid/);
    expect(records.payments).toHaveLength(1);
  });

  it('editing an order changes only the form fields (number and other fields stay)', async () => {
    const id = await actions.saveOrder(newOrder());
    await store.commit([{ op: 'patch', col: 'orders', id, data: { somethingNew: 'kept' } }]);
    await actions.saveOrder(newOrder({ notes: 'Pink roses' }), id);
    expect(records.orders[0]).toMatchObject({ number: 'BA-0001', notes: 'Pink roses', somethingNew: 'kept' });
  });

  it('deleting an order removes its payments and unlinks its costs', async () => {
    const id = await actions.saveOrder(newOrder(), undefined, { amount: 50000, method: 'Cash' });
    await actions.saveExpense({ section: 'bake', date: '2026-11-11', category: 'Ingredients', description: '', ingredient: 'Eggs', amount: 15000, orderId: id });
    expect(records.expenses[0]).toMatchObject({ description: 'Eggs', ingredient: 'Eggs', orderId: id });
    await actions.deleteOrder(id);
    expect(records.orders).toHaveLength(0);
    expect(records.payments).toHaveLength(0);
    expect(records.expenses).toMatchObject([{ amount: 15000, orderId: '' }]);
  });

  it('keeps a customer who has orders', async () => {
    await actions.saveOrder(newOrder());
    await expect(actions.deleteCustomer(records.customers[0].id)).rejects.toThrow(/Archive/);
    expect(records.customers).toHaveLength(1);
  });

  it('links order items to the product list', async () => {
    const pid = await actions.saveProduct({ name: 'Birthday cake 2 kg', price: 120000, cost: 60000 });
    await actions.saveOrder(newOrder({ items: [{ what: 'birthday cake 2 KG', qty: 1, price: 120000 }, { what: 'Topper', qty: 1, price: 5000 }] }));
    expect(records.orders[0].items.map((i) => i.productId)).toEqual([pid, '']);
    await expect(actions.saveProduct({ name: 'BIRTHDAY CAKE 2 KG', price: 1, cost: 1 })).rejects.toThrow(/already a product/);
  });
});

describe('hardware', () => {
  it('opening stock, stock in, a credit sale and its payment', async () => {
    const cement = await actions.saveItem({ name: 'Cement 50 kg', category: 'Building', unit: 'bag', sellPrice: 40000, reorderLevel: 5 }, undefined, { qty: 10, cost: 30000 });
    await actions.savePurchase({ date: '2026-11-05', supplier: 'Hima', lines: [{ itemId: cement, qty: 10, price: 34000 }] }, undefined, { amount: 100000, method: 'Cash' });
    const sid = await actions.saveSale({ date: '2026-11-06', customerName: 'Mukasa', lines: [{ itemId: cement, qty: 14, price: 40000 }] }, undefined, { amount: 200000, method: 'Cash' });
    const level = () => stockLevels(records.items, records.purchases, records.sales, records.adjustments).get(cement)!;
    expect(level()).toMatchObject({ onHand: 6, avgCost: 32000 });
    expect(records.sales[0]).toMatchObject({ number: 'HW-0001', customerName: 'Mukasa' });
    expect(records.customers).toMatchObject([{ section: 'hardware', name: 'Mukasa' }]);
    expect(records.payments).toHaveLength(2);
    await expect(actions.addPayment('sale', sid, { amount: 400000, date: '2026-11-07', method: 'Cash' })).rejects.toThrow(/more than the balance/);
    await actions.addPayment('sale', sid, { amount: 360000, date: '2026-11-07', method: 'Cash' });

    await actions.saveAdjustment({ itemId: cement, date: '2026-11-08', qty: -1, reason: 'Damaged' });
    expect(level().onHand).toBe(5);
    await expect(actions.deleteItem(cement)).rejects.toThrow(/Archive/);

    await actions.deleteSale(sid);
    expect(records.sales).toHaveLength(0);
    expect(records.payments.filter((p) => p.kind === 'sale')).toHaveLength(0);
    expect(level().onHand).toBe(19);
  });

  it('refuses a sale with no lines or a payment above its total', async () => {
    const nails = await actions.saveItem({ name: 'Nails', category: 'Other', unit: 'kg', sellPrice: 6000, reorderLevel: 0 });
    await expect(actions.saveSale({ date: '2026-11-06', customerName: '', lines: [{ itemId: nails, qty: 0, price: 6000 }] })).rejects.toThrow(/at least one item/);
    await expect(actions.saveSale({ date: '2026-11-06', customerName: '', lines: [{ itemId: nails, qty: 2, price: 6000 }] }, undefined, { amount: 50000, method: 'Cash' })).rejects.toThrow(/more than the total/);
    expect(records.sales).toHaveLength(0);
  });
});

describe('settings, backup and restore', () => {
  it('saves only the settings fields that changed', async () => {
    await actions.saveSettings({ ownerName: 'Evelyn K' });
    await actions.saveSettings({ ingredients: ['Flour', 'Ghee'] });
    const row = records.settings?.find((r) => r.id === 'main');
    expect(row).toMatchObject({ ownerName: 'Evelyn K', ingredients: ['Flour', 'Ghee'] });
    expect(row).not.toHaveProperty('bakeName'); // defaults are never written back
  });

  it('a backup holds every record type and restores them all', async () => {
    const oid = await actions.saveOrder(newOrder(), undefined, { amount: 50000, method: 'Cash' });
    await actions.saveExpense({ section: 'bake', date: '2026-11-11', category: 'Transport', description: 'Boda', amount: 7000 });
    await actions.saveNote({ section: 'bake', title: 'Wedding enquiry', date: '2026-12-01' });
    await actions.saveProduct({ name: 'Cupcakes', price: 2500, cost: 1200 });
    const item = await actions.saveItem({ name: 'Paint', category: 'Paint', unit: 'tin', sellPrice: 50000, reorderLevel: 1 }, undefined, { qty: 3, cost: 35000 });
    await actions.saveSale({ date: '2026-11-11', customerName: '', lines: [{ itemId: item, qty: 1, price: 50000 }] }, undefined, { amount: 50000, method: 'Cash' });
    await actions.saveAdjustment({ itemId: item, date: '2026-11-11', qty: -1, reason: 'Damaged' });
    await actions.saveCapital({ section: 'hardware', date: '2026-11-01', direction: 'in', amount: 1000000 });
    await actions.saveSettings({ ownerName: 'Evelyn K' });

    const backup = makeBackup(records, { ownerName: 'Evelyn K' });
    for (const col of COLLECTIONS) if (col !== 'settings') expect(backup.counts[col], col).toBeGreaterThan(0);
    const text = JSON.stringify(backup);

    await actions.commitRaw(deleteAllOps(records));
    for (const col of COLLECTIONS) if (col !== 'settings') expect((records as unknown as Record<string, Row[]>)[col], col).toHaveLength(0);

    await actions.commitRaw(restoreOps(readBackup(text).data));
    expect(records.orders).toMatchObject([{ id: oid, number: 'BA-0001' }]);
    expect(makeBackup(records, null).counts).toEqual(backup.counts);
    expect(() => readBackup('{"app":"something else"}')).toThrow(/not a Bake Away backup/);
    expect(() => readBackup('not json')).toThrow(/could not be read/);
  });

  it('records survive closing and reopening the app', async () => {
    await actions.saveOrder(newOrder());
    connect(); // a fresh store over the same storage
    await settle();
    expect(records.orders).toHaveLength(1);
    expect(readDeviceRecords(storage).orders).toHaveLength(1);
  });

  it('CSV cells cannot be read as formulas', () => {
    const csv = toCsv(['Name', 'Amount'], [['=SUM(A1)', 5000], ['Sarah, "Sal"', -200]]);
    expect(csv).toContain("'=SUM(A1),5000");
    expect(csv).toContain('"Sarah, ""Sal""",-200');
  });
});
