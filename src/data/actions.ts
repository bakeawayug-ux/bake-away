// Every save in the app goes through this file, so each rule lives in one place:
// - a new record is written whole; an edit changes only the fields of its form (nothing else is wiped);
// - things that belong together are saved together (an order with its deposit, a delete with its payments);
// - amounts are cleaned once here (whole shillings, above zero).
// A refused action throws an Error whose message is plain words for the screen.
import { todayYmd } from '../lib/dates';
import { cleanAmount, cleanQty, money, num } from '../lib/money';
import { nextNumber, orderTotals, orderValue, sameName } from '../lib/orders';
import { purchaseTotals, saleTotals, saleValue, linesValue } from '../lib/stock';
import type {
  Adjustment,
  Capital,
  Customer,
  Expense,
  Item,
  Line,
  Note,
  Order,
  OrderItem,
  OrderStage,
  PaymentKind,
  Product,
  Purchase,
  Records,
  Sale,
  Section,
  Settings,
} from '../lib/types';
import { newId, type Op, type Store } from './store';

type Input<T> = Omit<T, 'id' | 'createdAt' | 'updatedAt'>;
export type CustomerInput = Input<Customer>;
export type OrderInput = Omit<Input<Order>, 'number' | 'customerId'>;
export type ExpenseInput = Input<Expense>;
export type NoteInput = Input<Note>;
export type ProductInput = Input<Product>;
export type ItemInput = Input<Item>;
export type PurchaseInput = Input<Purchase>;
export type SaleInput = Omit<Input<Sale>, 'number' | 'customerId'>;
export type CapitalInput = Input<Capital>;
export interface PaidNow {
  amount: number;
  method: string;
}

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const need = (ok: unknown, message: string) => {
  if (!ok) throw new Error(message);
};

export function makeActions(store: Store, cur: () => Records) {
  const created = () => ({ createdAt: Date.now(), updatedAt: Date.now() });
  const touched = () => ({ updatedAt: Date.now() });

  /** Finds the customer with that name in the section, or adds one. Returns '' for a blank name (walk-in). */
  function resolveCustomer(ops: Op[], section: Section, name: string, phone?: string): string {
    const n = text(name);
    if (!n) return '';
    const found = cur().customers.find((c) => c.section === section && sameName(c.name, n));
    if (found) {
      if (text(phone) && !text(found.phone)) ops.push({ op: 'patch', col: 'customers', id: found.id, data: { phone: text(phone), ...touched() } });
      if (found.archived) ops.push({ op: 'patch', col: 'customers', id: found.id, data: { archived: false, ...touched() } });
      return found.id;
    }
    const id = newId();
    ops.push({ op: 'set', col: 'customers', id, data: { section, name: n, phone: text(phone), place: '', notes: '', archived: false, ...created() } });
    return id;
  }

  function cleanItems(items: OrderItem[]): OrderItem[] {
    const products = cur().products;
    return items
      .map((i) => {
        const what = text(i.what);
        // Link the item to the product list: by the id it was picked with, or by its name.
        const product = products.find((p) => p.id === i.productId && sameName(p.name, what)) ?? products.find((p) => sameName(p.name, what));
        return { what, qty: cleanQty(i.qty) || 1, price: cleanAmount(i.price), productId: product?.id ?? '' };
      })
      .filter((i) => i.what);
  }

  function cleanLines(lines: Line[]): Line[] {
    return lines.map((l) => ({ itemId: l.itemId, qty: cleanQty(l.qty), price: cleanAmount(l.price) })).filter((l) => l.itemId && l.qty > 0);
  }

  function paymentOp(kind: PaymentKind, refId: string, section: Section, amount: number, date: string, method: string, note = ''): Op {
    return { op: 'set', col: 'payments', id: newId(), data: { kind, refId, section, amount, date, method: method || 'Cash', note, ...created() } };
  }

  const paymentsOf = (refId: string) => cur().payments.filter((p) => p.refId === refId);

  return {
    // ---------- customers ----------
    async saveCustomer(input: CustomerInput, id?: string): Promise<string> {
      const name = text(input.name);
      need(name, 'Type the customer\'s name.');
      const clash = cur().customers.find((c) => c.section === input.section && c.id !== id && sameName(c.name, name));
      need(!clash, `There is already a customer called ${clash?.name}.`);
      const data = {
        section: input.section,
        name,
        phone: text(input.phone),
        place: text(input.place),
        specialDay: text(input.specialDay),
        specialDayNote: text(input.specialDayNote),
        notes: text(input.notes),
      };
      const rid = id ?? newId();
      await store.commit([id ? { op: 'patch', col: 'customers', id: rid, data: { ...data, ...touched() } } : { op: 'set', col: 'customers', id: rid, data: { ...data, archived: false, ...created() } }]);
      return rid;
    },
    async archiveCustomer(id: string, archived: boolean) {
      await store.commit([{ op: 'patch', col: 'customers', id, data: { archived, ...touched() } }]);
    },
    async deleteCustomer(id: string) {
      const used = cur().orders.some((o) => o.customerId === id) || cur().sales.some((s) => s.customerId === id);
      need(!used, 'This customer has orders or sales, so the record is kept. Use Archive to hide it instead.');
      await store.commit([{ op: 'delete', col: 'customers', id }]);
    },

    // ---------- orders (Bake Away) ----------
    async saveOrder(input: OrderInput, id?: string, deposit?: PaidNow): Promise<string> {
      const items = cleanItems(input.items);
      need(items.length, 'Add at least one item: what was ordered and its price.');
      need(input.dueDate, 'Choose the day the order is needed.');
      const ops: Op[] = [];
      const customerId = resolveCustomer(ops, 'bake', input.customerName, input.phone);
      const data = {
        customerId,
        customerName: text(input.customerName),
        phone: text(input.phone),
        date: input.date || todayYmd(),
        dueDate: input.dueDate,
        dueTime: text(input.dueTime),
        items,
        delivery: input.delivery,
        place: text(input.place),
        deliveryFee: cleanAmount(input.deliveryFee),
        discount: cleanAmount(input.discount),
        stage: input.stage,
        notes: text(input.notes),
      };
      const rid = id ?? newId();
      if (id) ops.push({ op: 'patch', col: 'orders', id: rid, data: { ...data, ...touched() } });
      else {
        const number = nextNumber('BA', cur().orders.map((o) => o.number));
        ops.push({ op: 'set', col: 'orders', id: rid, data: { ...data, number, ...created() } });
        const paid = cleanAmount(deposit?.amount);
        if (paid > 0) {
          need(paid <= orderValue(data), `The deposit is more than the order's total of ${money(orderValue(data))}.`);
          ops.push(paymentOp('order', rid, 'bake', paid, data.date, deposit?.method ?? 'Cash', 'Deposit'));
        }
      }
      await store.commit(ops);
      return rid;
    },
    async setOrderStage(id: string, stage: OrderStage) {
      await store.commit([{ op: 'patch', col: 'orders', id, data: { stage, ...touched() } }]);
    },
    /** Deletes the order together with its payments; costs recorded for it stay as ordinary expenses. */
    async deleteOrder(id: string) {
      const ops: Op[] = [{ op: 'delete', col: 'orders', id }];
      for (const p of paymentsOf(id)) ops.push({ op: 'delete', col: 'payments', id: p.id });
      for (const e of cur().expenses) if (e.orderId === id) ops.push({ op: 'patch', col: 'expenses', id: e.id, data: { orderId: '', ...touched() } });
      await store.commit(ops);
    },

    // ---------- payments (orders, sales, stock purchases) ----------
    async addPayment(kind: PaymentKind, refId: string, input: { amount: number; date: string; method: string; note?: string }) {
      const amount = cleanAmount(input.amount);
      need(amount > 0, 'Type an amount above zero.');
      need(input.date, 'Choose the date of the payment.');
      const r = cur();
      const pays = paymentsOf(refId);
      let balance = 0;
      let section: Section = 'hardware';
      if (kind === 'order') {
        const o = r.orders.find((x) => x.id === refId);
        need(o, 'That order no longer exists.');
        need(o!.stage !== 'Cancelled', 'This order is cancelled, so it cannot take a payment.');
        balance = orderTotals(o!, pays, todayYmd()).balance;
        section = 'bake';
      } else if (kind === 'sale') {
        const s = r.sales.find((x) => x.id === refId);
        need(s, 'That sale no longer exists.');
        balance = saleTotals(s!, pays).balance;
      } else {
        const p = r.purchases.find((x) => x.id === refId);
        need(p, 'That stock purchase no longer exists.');
        balance = purchaseTotals(p!, pays).balance;
      }
      need(balance > 0, 'This is already fully paid.');
      need(amount <= balance, `That is more than the balance of ${money(balance)}.`);
      await store.commit([paymentOp(kind, refId, section, amount, input.date, input.method, text(input.note))]);
    },
    async deletePayment(id: string) {
      await store.commit([{ op: 'delete', col: 'payments', id }]);
    },

    // ---------- expenses ----------
    async saveExpense(input: ExpenseInput, id?: string): Promise<string> {
      const amount = cleanAmount(input.amount);
      need(amount > 0, 'Type the amount spent.');
      need(input.date, 'Choose the date.');
      const data = {
        section: input.section,
        date: input.date,
        category: text(input.category) || 'Other',
        description: text(input.description) || (input.section === 'bake' ? text(input.ingredient) : '') || text(input.category) || 'Expense',
        amount,
        paidTo: text(input.paidTo),
        orderId: input.section === 'bake' ? text(input.orderId) : '',
        ingredient: input.section === 'bake' ? text(input.ingredient) : '',
        qtyNote: input.section === 'bake' ? text(input.qtyNote) : '',
        note: text(input.note),
      };
      const rid = id ?? newId();
      await store.commit([id ? { op: 'patch', col: 'expenses', id: rid, data: { ...data, ...touched() } } : { op: 'set', col: 'expenses', id: rid, data: { ...data, ...created() } }]);
      return rid;
    },
    async deleteExpense(id: string) {
      await store.commit([{ op: 'delete', col: 'expenses', id }]);
    },

    // ---------- products (Bake Away) ----------
    async saveProduct(input: ProductInput, id?: string): Promise<string> {
      const name = text(input.name);
      need(name, "Type the product's name.");
      const clash = cur().products.find((p) => p.id !== id && sameName(p.name, name));
      need(!clash, `There is already a product called ${clash?.name}.`);
      const data = { name, price: cleanAmount(input.price), cost: cleanAmount(input.cost) };
      const rid = id ?? newId();
      await store.commit([id ? { op: 'patch', col: 'products', id: rid, data: { ...data, ...touched() } } : { op: 'set', col: 'products', id: rid, data: { ...data, archived: false, ...created() } }]);
      return rid;
    },
    /** Adds the suggested products that are not in the list yet (only when the person asks for it). */
    async addProducts(names: string[]) {
      const have = cur().products;
      const ops: Op[] = names
        .filter((n) => !have.some((p) => sameName(p.name, n)))
        .map((name, i) => ({ op: 'set' as const, col: 'products' as const, id: newId(), data: { name, price: 0, cost: 0, archived: false, createdAt: Date.now() + i, updatedAt: Date.now() } }));
      if (ops.length) await store.commit(ops);
    },
    /** Orders keep the item's name and price, so deleting a product never changes an order. */
    async deleteProduct(id: string) {
      await store.commit([{ op: 'delete', col: 'products', id }]);
    },

    // ---------- notes ----------
    async saveNote(input: NoteInput, id?: string): Promise<string> {
      const title = text(input.title) || text(input.body).split('\n')[0].slice(0, 60);
      need(title, 'Type something for the note.');
      const data = { section: input.section, title, body: text(input.body), date: text(input.date), pinned: !!input.pinned, done: !!input.done };
      const rid = id ?? newId();
      await store.commit([id ? { op: 'patch', col: 'notes', id: rid, data: { ...data, ...touched() } } : { op: 'set', col: 'notes', id: rid, data: { ...data, ...created() } }]);
      return rid;
    },
    async patchNote(id: string, fields: Partial<Pick<Note, 'pinned' | 'done'>>) {
      await store.commit([{ op: 'patch', col: 'notes', id, data: { ...fields, ...touched() } }]);
    },
    async deleteNote(id: string) {
      await store.commit([{ op: 'delete', col: 'notes', id }]);
    },

    // ---------- hardware: items ----------
    async saveItem(input: ItemInput, id?: string, opening?: { qty: number; cost: number }): Promise<string> {
      const name = text(input.name);
      need(name, 'Type the item\'s name.');
      const clash = cur().items.find((i) => i.id !== id && sameName(i.name, name));
      need(!clash, `There is already an item called ${clash?.name}.`);
      const data = {
        name,
        category: text(input.category) || 'Other',
        unit: text(input.unit) || 'pc',
        sellPrice: cleanAmount(input.sellPrice),
        reorderLevel: cleanQty(input.reorderLevel),
      };
      const rid = id ?? newId();
      const ops: Op[] = [id ? { op: 'patch', col: 'items', id: rid, data: { ...data, ...touched() } } : { op: 'set', col: 'items', id: rid, data: { ...data, archived: false, ...created() } }];
      const q = cleanQty(opening?.qty);
      if (!id && q > 0)
        ops.push({
          op: 'set',
          col: 'purchases',
          id: newId(),
          data: { date: todayYmd(), supplier: 'Opening stock', lines: [{ itemId: rid, qty: q, price: cleanAmount(opening?.cost) }], opening: true, note: '', ...created() },
        });
      await store.commit(ops);
      return rid;
    },
    async archiveItem(id: string, archived: boolean) {
      await store.commit([{ op: 'patch', col: 'items', id, data: { archived, ...touched() } }]);
    },
    async deleteItem(id: string) {
      const r = cur();
      const used = r.purchases.some((p) => p.lines?.some((l) => l.itemId === id)) || r.sales.some((s) => s.lines?.some((l) => l.itemId === id)) || r.adjustments.some((a) => a.itemId === id);
      need(!used, 'This item has stock records, so it is kept. Use Archive to hide it instead.');
      await store.commit([{ op: 'delete', col: 'items', id }]);
    },

    // ---------- hardware: stock in ----------
    async savePurchase(input: PurchaseInput, id?: string, paidNow?: PaidNow): Promise<string> {
      const lines = cleanLines(input.lines);
      need(lines.length, 'Add at least one item with a quantity.');
      need(input.date, 'Choose the date.');
      const data = { date: input.date, supplier: text(input.supplier) || 'Supplier', lines, note: text(input.note) };
      const rid = id ?? newId();
      const ops: Op[] = [id ? { op: 'patch', col: 'purchases', id: rid, data: { ...data, ...touched() } } : { op: 'set', col: 'purchases', id: rid, data: { ...data, opening: false, ...created() } }];
      const paid = cleanAmount(paidNow?.amount);
      if (!id && paid > 0) {
        need(paid <= linesValue(lines), `The amount paid is more than the total of ${money(linesValue(lines))}.`);
        ops.push(paymentOp('purchase', rid, 'hardware', paid, data.date, paidNow?.method ?? 'Cash'));
      }
      await store.commit(ops);
      return rid;
    },
    async deletePurchase(id: string) {
      const ops: Op[] = [{ op: 'delete', col: 'purchases', id }];
      for (const p of paymentsOf(id)) ops.push({ op: 'delete', col: 'payments', id: p.id });
      await store.commit(ops);
    },

    // ---------- hardware: sales ----------
    async saveSale(input: SaleInput, id?: string, paidNow?: PaidNow): Promise<string> {
      const lines = cleanLines(input.lines);
      need(lines.length, 'Add at least one item with a quantity.');
      need(input.date, 'Choose the date.');
      const ops: Op[] = [];
      const customerId = resolveCustomer(ops, 'hardware', input.customerName);
      const data = { date: input.date, customerId, customerName: text(input.customerName), lines, discount: cleanAmount(input.discount), note: text(input.note) };
      need(num(data.discount) <= linesValue(lines), 'The discount is more than the total.');
      const rid = id ?? newId();
      if (id) ops.push({ op: 'patch', col: 'sales', id: rid, data: { ...data, ...touched() } });
      else {
        ops.push({ op: 'set', col: 'sales', id: rid, data: { ...data, number: nextNumber('HW', cur().sales.map((s) => s.number)), ...created() } });
        const paid = cleanAmount(paidNow?.amount);
        if (paid > 0) {
          need(paid <= saleValue(data), `The amount paid is more than the total of ${money(saleValue(data))}.`);
          ops.push(paymentOp('sale', rid, 'hardware', paid, data.date, paidNow?.method ?? 'Cash'));
        }
      }
      await store.commit(ops);
      return rid;
    },
    async deleteSale(id: string) {
      const ops: Op[] = [{ op: 'delete', col: 'sales', id }];
      for (const p of paymentsOf(id)) ops.push({ op: 'delete', col: 'payments', id: p.id });
      await store.commit(ops);
    },

    // ---------- hardware: count corrections ----------
    async saveAdjustment(input: Input<Adjustment>) {
      need(input.itemId, 'Choose the item.');
      need(num(input.qty) !== 0, 'The count is the same as the records, so there is nothing to correct.');
      await store.commit([{ op: 'set', col: 'adjustments', id: newId(), data: { date: input.date || todayYmd(), itemId: input.itemId, qty: Math.round(num(input.qty) * 1000) / 1000, reason: text(input.reason) || 'Count', ...created() } }]);
    },
    async deleteAdjustment(id: string) {
      await store.commit([{ op: 'delete', col: 'adjustments', id }]);
    },

    // ---------- money put in / taken out ----------
    async saveCapital(input: CapitalInput, id?: string): Promise<string> {
      const amount = cleanAmount(input.amount);
      need(amount > 0, 'Type an amount above zero.');
      need(input.date, 'Choose the date.');
      const data = { section: input.section, date: input.date, direction: input.direction, amount, note: text(input.note) };
      const rid = id ?? newId();
      await store.commit([id ? { op: 'patch', col: 'capital', id: rid, data: { ...data, ...touched() } } : { op: 'set', col: 'capital', id: rid, data: { ...data, ...created() } }]);
      return rid;
    },
    async deleteCapital(id: string) {
      await store.commit([{ op: 'delete', col: 'capital', id }]);
    },

    // ---------- settings: only the fields that changed are written ----------
    async saveSettings(fields: Partial<Settings>) {
      await store.commit([{ op: 'patch', col: 'settings', id: 'main', data: { ...fields, ...touched() } }]);
    },

    /** For restore and "delete all records". */
    async commitRaw(ops: Op[]) {
      if (ops.length) await store.commit(ops);
    },
  };
}

export type Actions = ReturnType<typeof makeActions>;
