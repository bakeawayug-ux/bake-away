// The money rules, checked with small worked examples. Run with: npm test
import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, inPeriod, presetPeriod, showDate, ymd } from '../src/lib/dates';
import { cleanAmount, cleanQty, money, num, shortMoney } from '../src/lib/money';
import { customerSummary, nextNumber, orderTotals, orderValue } from '../src/lib/orders';
import { bakeReport, hardwareReport, ingredientSpend, monthBars, productProfit } from '../src/lib/reports';
import { purchaseTotals, saleCost, saleTotals, stockLevels } from '../src/lib/stock';
import { EMPTY_RECORDS, type Adjustment, type Expense, type Item, type Order, type Payment, type Product, type Purchase, type Records, type Sale } from '../src/lib/types';

const base = { createdAt: 1, updatedAt: 1 };
const order = (o: Partial<Order>): Order => ({ ...base, id: 'o1', number: 'BA-0001', customerName: 'Sarah', date: '2026-11-01', dueDate: '2026-11-12', items: [{ what: 'Cake', qty: 1, price: 100000 }], delivery: 'Pick up', stage: 'Booked', ...o });
const pay = (p: Partial<Payment>): Payment => ({ ...base, id: 'p' + Math.random(), kind: 'order', refId: 'o1', section: 'bake', amount: 0, date: '2026-11-05', method: 'Cash', ...p });
const TODAY = '2026-11-11';

describe('money', () => {
  it('reads stored amounts safely', () => {
    expect(num('1,200,000')).toBe(1200000);
    expect(num(undefined)).toBe(0);
    expect(num('abc')).toBe(0);
    expect(num(NaN)).toBe(0);
  });
  it('cleans typed amounts to whole shillings above zero', () => {
    expect(cleanAmount('')).toBe(0);
    expect(cleanAmount(-5000)).toBe(0);
    expect(cleanAmount('12,500.6')).toBe(12501);
    expect(cleanAmount('UGX 30,000')).toBe(30000);
    expect(cleanQty('2.5')).toBe(2.5);
    expect(cleanQty(-1)).toBe(0);
  });
  it('shows money without cents', () => {
    expect(money(1200000)).toBe('UGX 1,200,000');
    expect(money(-5000)).toBe('-UGX 5,000');
    expect(money(undefined)).toBe('UGX 0');
    expect(shortMoney(1250000)).toBe('1.3m');
    expect(shortMoney(350000)).toBe('350k');
  });
});

describe('dates', () => {
  it('uses the local day, not the UTC day', () => {
    // 00:30 on 1 July in Kampala is still 30 June in UTC; the app must say 1 July.
    expect(ymd(new Date(2026, 6, 1, 0, 30))).toBe('2026-07-01');
  });
  it('works out months and ranges', () => {
    expect(presetPeriod('thisMonth', TODAY)).toMatchObject({ from: '2026-11-01', to: '2026-11-30' });
    expect(presetPeriod('lastMonth', '2026-01-15')).toMatchObject({ from: '2025-12-01', to: '2025-12-31' });
    expect(presetPeriod('thisMonth', '2028-02-10').to).toBe('2028-02-29');
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(daysBetween('2026-11-11', '2026-11-14')).toBe(3);
    expect(showDate('2026-11-14')).toBe('14/11/2026');
  });
  it('includes both ends of a period', () => {
    const p = { from: '2026-11-01', to: '2026-11-30' };
    expect(inPeriod('2026-11-01', p)).toBe(true);
    expect(inPeriod('2026-11-30', p)).toBe(true);
    expect(inPeriod('2026-12-01', p)).toBe(false);
    expect(inPeriod(undefined, p)).toBe(false);
    expect(inPeriod('2020-01-01', { from: '', to: '' })).toBe(true);
  });
});

describe('orders', () => {
  it('values an order: items plus delivery less discount', () => {
    expect(orderValue(order({ items: [{ what: 'Cake', qty: 2, price: 80000 }, { what: 'Cupcakes', qty: 12, price: 2500 }], deliveryFee: 10000, discount: 5000 }))).toBe(195000);
    expect(orderValue(order({ items: [{ what: 'Cake', qty: 1, price: 1000 }], discount: 5000 }))).toBe(0);
  });
  it('no payment: not paid, full balance', () => {
    const t = orderTotals(order({}), [], TODAY);
    expect(t).toMatchObject({ value: 100000, paid: 0, balance: 100000, payStatus: 'Not paid', late: false, open: true });
  });
  it('a deposit: part paid', () => {
    const t = orderTotals(order({}), [pay({ amount: 40000 })], TODAY);
    expect(t).toMatchObject({ paid: 40000, balance: 60000, payStatus: 'Part paid' });
  });
  it('needed yesterday and not delivered is late; needed today is not', () => {
    expect(orderTotals(order({ dueDate: '2026-11-10' }), [], TODAY).late).toBe(true);
    expect(orderTotals(order({ dueDate: TODAY }), [], TODAY).late).toBe(false);
    expect(orderTotals(order({ dueDate: '2026-11-10', stage: 'Delivered' }), [], TODAY).late).toBe(false);
  });
  it('overpaid: balance 0, never negative', () => {
    const t = orderTotals(order({}), [pay({ amount: 70000 }), pay({ amount: 50000 })], TODAY);
    expect(t).toMatchObject({ balance: 0, overpaid: 20000, payStatus: 'Paid' });
  });
  it('a cancelled order owes nothing but keeps its payments', () => {
    const t = orderTotals(order({ stage: 'Cancelled' }), [pay({ amount: 30000 })], TODAY);
    expect(t).toMatchObject({ balance: 0, paid: 30000, late: false, open: false });
  });
  it('amounts stored as text or missing lists give no blanks', () => {
    const odd = order({ items: [{ what: 'Cake', qty: '2' as unknown as number, price: '50,000' as unknown as number }] });
    expect(orderTotals(odd, undefined, TODAY).value).toBe(100000);
    expect(orderTotals(order({ items: undefined as unknown as [] }), undefined, TODAY).value).toBe(0);
  });
  it('numbers run on from the highest', () => {
    expect(nextNumber('BA', [])).toBe('BA-0001');
    expect(nextNumber('BA', ['BA-0001', 'BA-0007', undefined, 'BA-0003'])).toBe('BA-0008');
  });
  it("a customer's debt is the sum of each order's balance", () => {
    // Order A overpaid by 100,000, order B unpaid 400,000: the customer owes 400,000, not 300,000.
    const rows = [
      { id: 'a', customerId: 'c', date: '2026-11-01' },
      { id: 'b', customerId: 'c', date: '2026-11-05' },
      { id: 'x', customerId: 'other', date: '2026-11-05' },
    ];
    const totals: Record<string, { value: number; paid: number; balance: number; counts: boolean }> = {
      a: { value: 500000, paid: 600000, balance: 0, counts: true },
      b: { value: 400000, paid: 0, balance: 400000, counts: true },
      x: { value: 1, paid: 0, balance: 1, counts: true },
    };
    expect(customerSummary('c', rows, (id) => totals[id])).toMatchObject({ orders: 2, value: 900000, paid: 600000, owed: 400000, lastDate: '2026-11-05' });
  });
});

const item = (i: Partial<Item>): Item => ({ ...base, id: 'cement', name: 'Cement', category: 'Building', unit: 'bag', sellPrice: 40000, reorderLevel: 5, ...i });
const purchase = (p: Partial<Purchase>): Purchase => ({ ...base, id: 'pu1', date: '2026-11-01', supplier: 'Hima', lines: [], ...p });
const sale = (s: Partial<Sale>): Sale => ({ ...base, id: 's1', number: 'HW-0001', date: '2026-11-03', customerName: '', lines: [], ...s });

describe('stock', () => {
  const items = [item({}), item({ id: 'nails', name: 'Nails', unit: 'kg', sellPrice: 6000, reorderLevel: 0 })];
  const purchases = [
    purchase({ lines: [{ itemId: 'cement', qty: 10, price: 30000 }] }),
    purchase({ id: 'pu2', date: '2026-11-05', lines: [{ itemId: 'cement', qty: 10, price: 34000 }] }),
  ];
  const sales = [sale({ lines: [{ itemId: 'cement', qty: 14, price: 40000 }] })];
  const adjustments: Adjustment[] = [{ ...base, id: 'a1', date: '2026-11-06', itemId: 'cement', qty: -2, reason: 'Damaged' }];

  it('counts stock from the records and averages the cost', () => {
    const l = stockLevels(items, purchases, sales, adjustments).get('cement')!;
    expect(l.bought).toBe(20);
    expect(l.sold).toBe(14);
    expect(l.onHand).toBe(4); // 20 - 14 - 2
    expect(l.avgCost).toBe(32000); // (300,000 + 340,000) / 20
    expect(l.value).toBe(128000);
    expect(l.low).toBe(true); // 4 left, warn at 5
  });
  it('an item never bought is not flagged low', () => {
    expect(stockLevels(items, purchases, sales, adjustments).get('nails')).toMatchObject({ onHand: 0, low: false, value: 0 });
  });
  it('works out what a sale cost and what is owed on it', () => {
    const levels = stockLevels(items, purchases, sales, adjustments);
    expect(saleCost(sales[0], levels)).toBe(448000);
    expect(saleTotals(sale({ lines: [{ itemId: 'cement', qty: 2, price: 40000 }], discount: 5000 }), [pay({ kind: 'sale', amount: 50000 })])).toMatchObject({ value: 75000, paid: 50000, balance: 25000, status: 'Part paid' });
  });
  it('opening stock has a cost but nothing is owed for it', () => {
    expect(purchaseTotals(purchase({ opening: true, lines: [{ itemId: 'cement', qty: 5, price: 30000 }] }), [])).toMatchObject({ value: 150000, balance: 0, status: 'Paid' });
    expect(purchaseTotals(purchases[0], [])).toMatchObject({ value: 300000, balance: 300000, status: 'Not paid' });
  });
});

describe('reports', () => {
  const nov = { from: '2026-11-01', to: '2026-11-30' };
  const expense = (e: Partial<Expense>): Expense => ({ ...base, id: 'e' + Math.random(), section: 'bake', date: '2026-11-04', category: 'Ingredients', description: 'x', amount: 0, ...e });

  it('hardware profit: sales less cost of goods, stock lost and expenses', () => {
    const records: Records = {
      ...EMPTY_RECORDS,
      items: [item({})],
      purchases: [purchase({ lines: [{ itemId: 'cement', qty: 10, price: 30000 }] })],
      sales: [sale({ lines: [{ itemId: 'cement', qty: 4, price: 40000 }] })],
      adjustments: [{ ...base, id: 'a', date: '2026-11-06', itemId: 'cement', qty: -1, reason: 'Damaged' }],
      expenses: [expense({ section: 'hardware', category: 'Rent', amount: 20000 })],
      payments: [pay({ kind: 'sale', refId: 's1', section: 'hardware', amount: 100000 }), pay({ kind: 'purchase', refId: 'pu1', section: 'hardware', amount: 300000 })],
      capital: [{ ...base, id: 'c', section: 'hardware', date: '2026-11-01', direction: 'in', amount: 500000 }],
    };
    const r = hardwareReport(records, nov);
    expect(r.sales).toBe(160000);
    expect(r.costOfGoods).toBe(120000);
    expect(r.grossProfit).toBe(40000);
    expect(r.stockLost).toBe(30000);
    expect(r.netProfit).toBe(-10000); // 40,000 - 30,000 - 20,000
    expect(r.owedToYou).toBe(60000);
    expect(r.youOwe).toBe(0);
    expect(r.stockValue).toBe(150000); // 5 left x 30,000
    expect(r.cashMovement).toBe(100000 + 500000 - 300000 - 20000);
  });

  it('bake report: money in by payment date, orders by needed date', () => {
    const records: Records = {
      ...EMPTY_RECORDS,
      orders: [order({}), order({ id: 'o2', dueDate: '2026-12-02', customerName: 'Joan' }), order({ id: 'o3', stage: 'Cancelled' })],
      payments: [pay({ amount: 60000 }), pay({ refId: 'o2', amount: 100000, date: '2026-11-20' }), pay({ amount: 10000, date: '2026-10-30' })],
      expenses: [expense({ amount: 25000, ingredient: 'Eggs' }), expense({ amount: 5000, category: 'Transport' }), expense({ amount: 99999, date: '2026-10-01' })],
    };
    const r = bakeReport(records, nov, TODAY, (o) => o.customerName ?? '');
    expect(r.moneyIn).toBe(160000);
    expect(r.spent).toBe(30000);
    expect(r.leftOver).toBe(130000);
    expect(r.ordersCount).toBe(1); // o2 is needed in December, o3 is cancelled
    expect(r.cancelled).toBe(1);
    expect(r.owedNow).toBe(30000); // o1: 100,000 - 60,000 - 10,000; o2 fully paid
    expect(monthBars(records, 'bake', 2, TODAY)).toMatchObject([{ key: '2026-10', in: 10000, out: 99999 }, { key: '2026-11', in: 160000, out: 30000 }]);
  });

  it('spending by ingredient, with its share of the money received', () => {
    const expenses = [expense({ amount: 30000, ingredient: 'Eggs' }), expense({ amount: 10000, ingredient: 'Eggs' }), expense({ amount: 60000, ingredient: 'Wheat flour' }), expense({ amount: 20000 }), expense({ amount: 7000, category: 'Transport' })];
    const r = ingredientSpend(expenses, nov, 400000);
    expect(r.total).toBe(120000);
    expect(r.rows.map((x) => x.ingredient)).toEqual(['Wheat flour', 'Eggs', 'Not specified']);
    expect(r.rows[1]).toMatchObject({ amount: 40000, count: 2, ofMoneyIn: 0.1 });
  });

  it('profit by product, matched by id even after a rename', () => {
    const products: Product[] = [
      { ...base, id: 'p1', name: 'Birthday cake (renamed)', price: 100000, cost: 55000 },
      { ...base, id: 'p2', name: 'Cupcakes', price: 2500, cost: 0 },
    ];
    const orders = [
      order({ items: [{ what: 'Birthday cake 2 kg', qty: 2, price: 100000, productId: 'p1' }, { what: 'cupcakes', qty: 12, price: 2500 }, { what: 'Special topper', qty: 1, price: 15000 }] }),
      order({ id: 'o2', stage: 'Cancelled', items: [{ what: 'x', qty: 1, price: 999, productId: 'p1' }] }),
    ];
    const r = productProfit(orders, products, nov);
    expect(r.rows[0]).toMatchObject({ name: 'Birthday cake (renamed)', qty: 2, sales: 200000, cost: 110000, profit: 90000, costKnown: true });
    expect(r.rows[1]).toMatchObject({ name: 'Cupcakes', qty: 12, sales: 30000, costKnown: false });
    expect(r.other).toEqual({ qty: 1, sales: 15000 });
    expect(r.profit).toBe(90000); // only products with a known cost count in the estimate
  });
});
