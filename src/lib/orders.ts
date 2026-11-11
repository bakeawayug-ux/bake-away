// Bake Away figures. Every screen takes its order and customer figures from here, so one order
// can never show two different balances on two pages.
import { num, sum } from './money';
import type { Customer, Expense, Order, Payment } from './types';

export function groupBy<T>(rows: readonly T[], key: (row: T) => string | undefined): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    if (!k) continue;
    const list = map.get(k);
    if (list) list.push(r);
    else map.set(k, [r]);
  }
  return map;
}

/** Payments grouped by the order / sale / purchase they belong to. */
export function paymentsByRef(payments: readonly Payment[]): Map<string, Payment[]> {
  return groupBy(payments, (p) => p.refId);
}

/** What the order is worth: items, plus delivery, less discount. Never below zero. */
export function orderValue(o: Pick<Order, 'items' | 'deliveryFee' | 'discount'>): number {
  const items = sum(o.items ?? [], (i) => num(i.qty) * num(i.price));
  return Math.max(0, Math.round(items + num(o.deliveryFee) - num(o.discount)));
}

export type PayStatus = 'Not paid' | 'Part paid' | 'Paid';

export interface OrderTotals {
  value: number;
  paid: number;
  /** Still to be paid. A cancelled order owes nothing; an overpaid order owes 0, not a negative. */
  balance: number;
  overpaid: number;
  payStatus: PayStatus;
  /** Needed date has passed and the order is not delivered or cancelled */
  late: boolean;
  /** Still to be baked or handed over */
  open: boolean;
}

export function orderTotals(o: Order, pays: readonly Payment[] | undefined, today: string): OrderTotals {
  const value = orderValue(o);
  const paid = sum(pays ?? [], (p) => p.amount);
  const cancelled = o.stage === 'Cancelled';
  const balance = cancelled ? 0 : Math.max(0, value - paid);
  const open = o.stage === 'Booked' || o.stage === 'Ready';
  return {
    value,
    paid,
    balance,
    overpaid: cancelled ? 0 : Math.max(0, paid - value),
    payStatus: balance === 0 && (paid > 0 || value === 0) ? 'Paid' : paid > 0 ? 'Part paid' : 'Not paid',
    late: open && !!o.dueDate && o.dueDate < today,
    open,
  };
}

export function itemsText(o: Pick<Order, 'items'>): string {
  return (o.items ?? [])
    .filter((i) => i.what)
    .map((i) => (num(i.qty) === 1 ? i.what : `${num(i.qty)} × ${i.what}`))
    .join(', ');
}

/** The name to show: the customer record's name when the order is linked to one (so a rename shows everywhere). */
export function customerLabel(row: { customerId?: string; customerName?: string }, byId: Map<string, Customer>): string {
  return (row.customerId && byId.get(row.customerId)?.name) || row.customerName || 'Walk-in customer';
}

export const sameName = (a: string | undefined, b: string | undefined) =>
  (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();

/** Next running number: BA-0007 after BA-0006. Numbers of deleted records are not reused while a higher one exists. */
export function nextNumber(prefix: string, existing: readonly (string | undefined)[]): string {
  let max = 0;
  for (const n of existing) {
    const m = n?.match(/(\d+)\s*$/);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}-${String(max + 1).padStart(4, '0')}`;
}

/** What was spent on one order (expenses linked to it) and what is left of its value. */
export function orderProfit(o: Order, expenses: readonly Expense[]): { costs: number; profit: number } {
  const costs = sum(expenses.filter((e) => e.orderId === o.id), (e) => e.amount);
  return { costs, profit: orderValue(o) - costs };
}

export interface CustomerSummary {
  orders: number;
  value: number;
  paid: number;
  /** The sum of each order's own balance: an overpayment on one order does not hide a debt on another. */
  owed: number;
  lastDate: string;
}

export function customerSummary(
  customerId: string,
  rows: readonly { id: string; customerId?: string; date: string }[],
  totalsOf: (id: string) => { value: number; paid: number; balance: number; counts: boolean },
): CustomerSummary {
  const out: CustomerSummary = { orders: 0, value: 0, paid: 0, owed: 0, lastDate: '' };
  for (const r of rows) {
    if (r.customerId !== customerId) continue;
    const t = totalsOf(r.id);
    out.paid += t.paid;
    if (!t.counts) continue;
    out.orders += 1;
    out.value += t.value;
    out.owed += t.balance;
    if (r.date > out.lastDate) out.lastDate = r.date;
  }
  return out;
}
