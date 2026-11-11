// Hardware figures. The quantity in stock is never stored: it is always
//   bought (stock in) - sold + / - count corrections
// worked out from the records, so it cannot drift away from them.
//
// Cost rule (one rule, used everywhere): an item's cost is the AVERAGE of everything ever bought
// (total paid for it / total quantity bought). Stock value = quantity in stock x that average.
// Cost of goods sold = quantity sold x that average.
import { num, sum } from './money';
import type { Adjustment, Item, Payment, Purchase, Sale } from './types';

export interface StockLevel {
  bought: number;
  boughtCost: number;
  sold: number;
  soldValue: number;
  adjusted: number;
  onHand: number;
  avgCost: number;
  value: number;
  low: boolean;
  moves: number;
}

const blank = (): StockLevel => ({ bought: 0, boughtCost: 0, sold: 0, soldValue: 0, adjusted: 0, onHand: 0, avgCost: 0, value: 0, low: false, moves: 0 });

export function stockLevels(
  items: readonly Item[],
  purchases: readonly Purchase[],
  sales: readonly Sale[],
  adjustments: readonly Adjustment[],
): Map<string, StockLevel> {
  const map = new Map<string, StockLevel>();
  const get = (id: string) => {
    let s = map.get(id);
    if (!s) map.set(id, (s = blank()));
    return s;
  };
  for (const it of items) get(it.id);
  for (const p of purchases)
    for (const l of p.lines ?? []) {
      const s = get(l.itemId);
      s.bought += num(l.qty);
      s.boughtCost += num(l.qty) * num(l.price);
      s.moves++;
    }
  for (const sale of sales)
    for (const l of sale.lines ?? []) {
      const s = get(l.itemId);
      s.sold += num(l.qty);
      s.soldValue += num(l.qty) * num(l.price);
      s.moves++;
    }
  for (const a of adjustments) {
    const s = get(a.itemId);
    s.adjusted += num(a.qty);
    s.moves++;
  }
  const reorder = new Map(items.map((i) => [i.id, num(i.reorderLevel)]));
  for (const [id, s] of map) {
    s.onHand = Math.round((s.bought - s.sold + s.adjusted) * 1000) / 1000;
    s.avgCost = s.bought > 0 ? s.boughtCost / s.bought : 0;
    s.value = Math.round(Math.max(0, s.onHand) * s.avgCost);
    const level = reorder.get(id) ?? 0;
    s.low = s.onHand <= level && (level > 0 || s.onHand <= 0) && s.moves > 0;
  }
  return map;
}

export function linesValue(lines: readonly { qty: number; price: number }[] | undefined): number {
  return Math.round(sum(lines ?? [], (l) => num(l.qty) * num(l.price)));
}

export function saleValue(s: Pick<Sale, 'lines' | 'discount'>): number {
  return Math.max(0, linesValue(s.lines) - Math.round(num(s.discount)));
}

/** What the goods in a sale cost to buy (average cost). */
export function saleCost(s: Pick<Sale, 'lines'>, levels: Map<string, StockLevel>): number {
  return Math.round(sum(s.lines ?? [], (l) => num(l.qty) * (levels.get(l.itemId)?.avgCost ?? 0)));
}

export interface PaidTotals {
  value: number;
  paid: number;
  balance: number;
  status: 'Not paid' | 'Part paid' | 'Paid';
}

function paidTotals(value: number, pays: readonly Payment[] | undefined): PaidTotals {
  const paid = sum(pays ?? [], (p) => p.amount);
  const balance = Math.max(0, value - paid);
  return { value, paid, balance, status: balance === 0 ? 'Paid' : paid > 0 ? 'Part paid' : 'Not paid' };
}

export function saleTotals(s: Sale, pays: readonly Payment[] | undefined): PaidTotals {
  return paidTotals(saleValue(s), pays);
}

/** Opening stock was already in the shop: it has a cost but nothing is owed for it. */
export function purchaseTotals(p: Purchase, pays: readonly Payment[] | undefined): PaidTotals {
  const value = linesValue(p.lines);
  if (p.opening) return { value, paid: value, balance: 0, status: 'Paid' };
  return paidTotals(value, pays);
}

export function linesText(lines: readonly { itemId: string; qty: number }[] | undefined, itemName: (id: string) => string): string {
  return (lines ?? []).map((l) => `${num(l.qty)} × ${itemName(l.itemId)}`).join(', ');
}

export interface Move {
  date: string;
  kind: 'Stock in' | 'Sold' | 'Correction' | 'Opening stock';
  qty: number; // + in, - out
  price: number;
  who: string;
  refId: string;
  createdAt: number;
}

/** Everything that happened to one item, newest first. */
export function itemMoves(itemId: string, purchases: readonly Purchase[], sales: readonly Sale[], adjustments: readonly Adjustment[]): Move[] {
  const out: Move[] = [];
  for (const p of purchases)
    for (const l of p.lines ?? [])
      if (l.itemId === itemId)
        out.push({ date: p.date, kind: p.opening ? 'Opening stock' : 'Stock in', qty: num(l.qty), price: num(l.price), who: p.supplier, refId: p.id, createdAt: p.createdAt });
  for (const s of sales)
    for (const l of s.lines ?? [])
      if (l.itemId === itemId) out.push({ date: s.date, kind: 'Sold', qty: -num(l.qty), price: num(l.price), who: s.customerName, refId: s.id, createdAt: s.createdAt });
  for (const a of adjustments)
    if (a.itemId === itemId) out.push({ date: a.date, kind: 'Correction', qty: num(a.qty), price: 0, who: a.reason, refId: a.id, createdAt: a.createdAt });
  return out.sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1));
}
