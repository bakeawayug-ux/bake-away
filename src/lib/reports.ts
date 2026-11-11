// Period figures for both sections. Rules:
// - "Money in" is money actually received, by the date of each payment.
// - "Spent" is expenses by their own date.
// - Hardware profit = sales (by sale date) - what those goods cost (average cost) - stock lost - expenses.
import { inPeriod, lastMonths } from './dates';
import { num, sum } from './money';
import { groupBy, orderTotals, paymentsByRef } from './orders';
import { saleCost, saleTotals, saleValue, stockLevels, purchaseTotals, linesValue } from './stock';
import { sameName } from './orders';
import type { Expense, Order, Product, Records, Section } from './types';

export interface Range {
  from: string;
  to: string;
}

export interface CategoryRow {
  category: string;
  amount: number;
  count: number;
  share: number; // 0..1 of the total
}

export function expensesByCategory(records: Pick<Records, 'expenses'>, section: Section, range: Range): { total: number; rows: CategoryRow[] } {
  const rows = records.expenses.filter((e) => e.section === section && inPeriod(e.date, range));
  const total = sum(rows, (e) => e.amount);
  const groups = groupBy(rows, (e) => e.category || 'Other');
  const out: CategoryRow[] = [...groups.entries()].map(([category, list]) => {
    const amount = sum(list, (e) => e.amount);
    return { category, amount, count: list.length, share: total > 0 ? amount / total : 0 };
  });
  out.sort((a, b) => b.amount - a.amount);
  return { total, rows: out };
}

export interface BakeReport {
  moneyIn: number;
  spent: number;
  leftOver: number;
  ordersCount: number;
  ordersValue: number;
  delivered: number;
  cancelled: number;
  /** Owed on all orders today (not limited to the period) */
  owedNow: number;
  categories: CategoryRow[];
  topCustomers: { name: string; value: number; orders: number }[];
}

export function bakeReport(records: Records, range: Range, today: string, nameOf: (o: { customerId?: string; customerName?: string }) => string): BakeReport {
  const byRef = paymentsByRef(records.payments);
  const moneyIn = sum(records.payments.filter((p) => p.kind === 'order' && inPeriod(p.date, range)), (p) => p.amount);
  const cats = expensesByCategory(records, 'bake', range);
  const inRange = records.orders.filter((o) => inPeriod(o.dueDate, range));
  const live = inRange.filter((o) => o.stage !== 'Cancelled');
  const totals = new Map(records.orders.map((o) => [o.id, orderTotals(o, byRef.get(o.id), today)]));
  const byCustomer = groupBy(live, (o) => nameOf(o));
  const topCustomers = [...byCustomer.entries()]
    .map(([name, list]) => ({ name, orders: list.length, value: sum(list, (o) => totals.get(o.id)?.value) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);
  return {
    moneyIn,
    spent: cats.total,
    leftOver: moneyIn - cats.total,
    ordersCount: live.length,
    ordersValue: sum(live, (o) => totals.get(o.id)?.value),
    delivered: live.filter((o) => o.stage === 'Delivered').length,
    cancelled: inRange.length - live.length,
    owedNow: sum(records.orders, (o) => totals.get(o.id)?.balance),
    categories: cats.rows,
    topCustomers,
  };
}

export interface HardwareReport {
  sales: number;
  salesCount: number;
  costOfGoods: number;
  grossProfit: number;
  stockLost: number;
  expenses: number;
  netProfit: number;
  categories: CategoryRow[];
  // cash side
  received: number;
  paidSuppliers: number;
  stockBought: number;
  capitalIn: number;
  capitalOut: number;
  cashMovement: number;
  // as at today
  stockValue: number;
  owedToYou: number;
  youOwe: number;
  capitalNet: number;
  bestSellers: { itemId: string; qty: number; value: number }[];
}

export function hardwareReport(records: Records, range: Range): HardwareReport {
  const levels = stockLevels(records.items, records.purchases, records.sales, records.adjustments);
  const byRef = paymentsByRef(records.payments);
  const sales = records.sales.filter((s) => inPeriod(s.date, range));
  const salesValue = sum(sales, (s) => saleValue(s));
  const costOfGoods = sum(sales, (s) => saleCost(s, levels));
  const stockLost = Math.round(
    sum(records.adjustments.filter((a) => num(a.qty) < 0 && inPeriod(a.date, range)), (a) => -num(a.qty) * (levels.get(a.itemId)?.avgCost ?? 0)),
  );
  const cats = expensesByCategory(records, 'hardware', range);
  const received = sum(records.payments.filter((p) => p.kind === 'sale' && inPeriod(p.date, range)), (p) => p.amount);
  const paidSuppliers = sum(records.payments.filter((p) => p.kind === 'purchase' && inPeriod(p.date, range)), (p) => p.amount);
  const cap = records.capital.filter((c) => c.section === 'hardware');
  const capIn = sum(cap.filter((c) => c.direction === 'in' && inPeriod(c.date, range)), (c) => c.amount);
  const capOut = sum(cap.filter((c) => c.direction === 'out' && inPeriod(c.date, range)), (c) => c.amount);

  const sold = new Map<string, { qty: number; value: number }>();
  for (const s of sales)
    for (const l of s.lines ?? []) {
      const row = sold.get(l.itemId) ?? { qty: 0, value: 0 };
      row.qty += num(l.qty);
      row.value += num(l.qty) * num(l.price);
      sold.set(l.itemId, row);
    }

  const grossProfit = salesValue - costOfGoods;
  return {
    sales: salesValue,
    salesCount: sales.length,
    costOfGoods,
    grossProfit,
    stockLost,
    expenses: cats.total,
    netProfit: grossProfit - stockLost - cats.total,
    categories: cats.rows,
    received,
    paidSuppliers,
    stockBought: sum(records.purchases.filter((p) => !p.opening && inPeriod(p.date, range)), (p) => linesValue(p.lines)),
    capitalIn: capIn,
    capitalOut: capOut,
    cashMovement: received + capIn - paidSuppliers - cats.total - capOut,
    stockValue: sum([...levels.values()], (l) => l.value),
    owedToYou: sum(records.sales, (s) => saleTotals(s, byRef.get(s.id)).balance),
    youOwe: sum(records.purchases, (p) => purchaseTotals(p, byRef.get(p.id)).balance),
    capitalNet: sum(cap, (c) => (c.direction === 'in' ? num(c.amount) : -num(c.amount))),
    bestSellers: [...sold.entries()].map(([itemId, v]) => ({ itemId, ...v })).sort((a, b) => b.value - a.value).slice(0, 5),
  };
}

export interface MonthBar {
  key: string;
  label: string;
  in: number;
  out: number;
}

/** Money in and money out for each of the last n months. */
export function monthBars(records: Records, section: Section, n: number, today: string): MonthBar[] {
  const months = lastMonths(n, today).map((m) => ({ ...m, in: 0, out: 0 }));
  const at = new Map(months.map((m) => [m.key, m]));
  const inKind = section === 'bake' ? 'order' : 'sale';
  for (const p of records.payments) {
    const m = at.get((p.date ?? '').slice(0, 7));
    if (!m) continue;
    if (p.kind === inKind) m.in += num(p.amount);
    else if (section === 'hardware' && p.kind === 'purchase') m.out += num(p.amount);
  }
  for (const e of records.expenses) {
    if (e.section !== section) continue;
    const m = at.get((e.date ?? '').slice(0, 7));
    if (m) m.out += num(e.amount);
  }
  return months;
}

// ---------- Bake Away: ingredients and products ----------

/** An expense counts as an ingredient purchase when it names an ingredient or sits in an ingredients category. */
export const isIngredientCategory = (category: string | undefined) => /ingredient|material/i.test(category ?? '');

export interface IngredientRow {
  ingredient: string;
  amount: number;
  count: number;
  /** Share of all ingredient spending in the period, 0..1 */
  share: number;
  /** Out of every shilling received in the period, how much went on this ingredient, 0..1 */
  ofMoneyIn: number;
}

export function ingredientSpend(expenses: readonly Expense[], range: Range, moneyIn: number): { total: number; rows: IngredientRow[] } {
  const rows = expenses.filter((e) => e.section === 'bake' && inPeriod(e.date, range) && (e.ingredient || isIngredientCategory(e.category)));
  const total = sum(rows, (e) => e.amount);
  const groups = groupBy(rows, (e) => e.ingredient || 'Not specified');
  const out: IngredientRow[] = [...groups.entries()].map(([ingredient, list]) => {
    const amount = sum(list, (e) => e.amount);
    return { ingredient, amount, count: list.length, share: total > 0 ? amount / total : 0, ofMoneyIn: moneyIn > 0 ? amount / moneyIn : 0 };
  });
  out.sort((a, b) => b.amount - a.amount);
  return { total, rows: out };
}

export interface ProductRow {
  name: string;
  qty: number;
  sales: number;
  /** Usual cost to make x quantity sold; 0 when the product has no usual cost yet */
  cost: number;
  profit: number;
  costKnown: boolean;
}

/**
 * What each product earned in the period: orders by the day they were needed, cancelled ones left out,
 * before discounts and delivery charges. The cost is the product's "usual cost to make one", so the
 * profit is an estimate; the page compares it with what was really spent.
 */
export function productProfit(
  orders: readonly Order[],
  products: readonly Product[],
  range: Range,
): { rows: ProductRow[]; other: { qty: number; sales: number }; sales: number; cost: number; profit: number } {
  const byId = new Map(products.map((p) => [p.id, p]));
  const map = new Map<string, ProductRow>();
  const other = { qty: 0, sales: 0 };
  for (const o of orders) {
    if (o.stage === 'Cancelled' || !inPeriod(o.dueDate, range)) continue;
    for (const i of o.items ?? []) {
      const p = (i.productId && byId.get(i.productId)) || products.find((x) => sameName(x.name, i.what));
      const value = num(i.qty) * num(i.price);
      if (!p) {
        other.qty += num(i.qty);
        other.sales += value;
        continue;
      }
      const row = map.get(p.id) ?? { name: p.name, qty: 0, sales: 0, cost: 0, profit: 0, costKnown: num(p.cost) > 0 };
      row.qty += num(i.qty);
      row.sales += value;
      row.cost += num(i.qty) * num(p.cost);
      map.set(p.id, row);
    }
  }
  const rows = [...map.values()];
  for (const r of rows) r.profit = r.sales - r.cost;
  rows.sort((a, b) => b.sales - a.sales);
  const known = rows.filter((r) => r.costKnown);
  return { rows, other, sales: sum(known, (r) => r.sales), cost: sum(known, (r) => r.cost), profit: sum(known, (r) => r.profit) };
}
