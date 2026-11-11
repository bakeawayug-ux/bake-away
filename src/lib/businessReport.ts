// The report of ONE business: Bake Away or the Hardware shop, never both together (Evelyn, 11 Nov
// 2026: each business's report must stand alone, so sharing one never shows the other's figures).
// The figures are put together here ONCE, as plain sections and tables; reportHtml.ts (preview and
// print), reportPdf.ts (PDF file) and reportCsv() (Excel) only lay them out, so the three outputs
// always show the same numbers. Every figure comes from the same functions the app's pages use.
import { inPeriod, monthsBetween, showDate, todayYmd } from './dates';
import { fmt, money, num, qty, sum } from './money';
import { customerLabel, groupBy, itemsText, orderTotals, paymentsByRef } from './orders';
import { bakeReport, expensesByCategory, hardwareReport, ingredientSpend, productProfit, type Range } from './reports';
import { purchaseTotals, saleTotals, stockLevels } from './stock';
import type { Customer, Records, Section, Settings } from './types';

export type Align = 'left' | 'right';

export interface ReportTable {
  title: string;
  head: string[];
  rows: string[][];
  align: Align[];
  /** A total line under the rows */
  foot?: string[];
  /** Rows (by index) printed in bold, for subtotals in a two-column summary */
  strong?: number[];
  note?: string;
  /** Shown instead of an empty table */
  empty?: string;
}

export interface ReportCard {
  label: string;
  value: string;
  sub?: string;
  tone?: 'good' | 'bad' | 'plain';
}

export interface ReportSection {
  key: Section;
  title: string;
  intro?: string;
  cards: ReportCard[];
  tables: ReportTable[];
}

export interface ReportDoc {
  title: string;
  owner: string;
  periodLabel: string;
  from: string;
  to: string;
  prepared: string;
  currency: string;
  sections: ReportSection[];
  notes: string[];
  fileStem: string;
}

export interface ReportOptions {
  /** The one business this report is about */
  section: Section;
  /** Month-by-month table */
  months: boolean;
  /** Who owes and whom you owe, as at today */
  owing: boolean;
}

const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : '');
/** A deduction: -UGX 5,000, but plain UGX 0 when there is nothing to take off. */
const less = (n: number, cur: string): string => (Math.round(n) > 0 ? `-${money(n, cur)}` : money(0, cur));
const R: Align = 'right';
const L: Align = 'left';

/** Money in and money out for each month of the period (all time = from the first record). */
export function monthFlow(records: Records, section: Section, range: Range, today = todayYmd()): { key: string; label: string; in: number; out: number }[] {
  const inKinds = section === 'bake' ? ['order'] : ['sale'];
  const outKinds = section === 'bake' ? [] : ['purchase'];
  const dates: string[] = [];
  for (const p of records.payments) if (p.section === section || inKinds.includes(p.kind) || outKinds.includes(p.kind)) dates.push(p.date);
  for (const e of records.expenses) if (e.section === section) dates.push(e.date);
  const valid = dates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  const from = range.from || valid[0] || today;
  const to = range.to && range.to < today ? range.to : today;
  let months = monthsBetween(from, to);
  if (months.length > 36) months = months.slice(-36);
  const rows = months.map((m) => ({ ...m, in: 0, out: 0 }));
  const at = new Map(rows.map((r) => [r.key, r]));
  for (const p of records.payments) {
    if (!inPeriod(p.date, range)) continue;
    const r = at.get(p.date.slice(0, 7));
    if (!r) continue;
    if (inKinds.includes(p.kind)) r.in += num(p.amount);
    else if (outKinds.includes(p.kind)) r.out += num(p.amount);
  }
  for (const e of records.expenses) {
    if (e.section !== section || !inPeriod(e.date, range)) continue;
    const r = at.get(e.date.slice(0, 7));
    if (r) r.out += num(e.amount);
  }
  return rows;
}

function byMethod(records: Records, kinds: string[], range: Range): ReportTable {
  const pays = records.payments.filter((p) => kinds.includes(p.kind) && inPeriod(p.date, range));
  const groups = groupBy(pays, (p) => p.method || 'Other');
  const total = sum(pays, (p) => p.amount);
  const rows = [...groups.entries()]
    .map(([method, list]) => ({ method, count: list.length, amount: sum(list, (p) => p.amount) }))
    .sort((a, b) => b.amount - a.amount);
  return {
    title: 'Money in by how it was paid',
    head: ['How', 'Payments', 'Amount', 'Share'],
    align: [L, R, R, R],
    rows: rows.map((r) => [r.method, String(r.count), fmt(r.amount), pct(r.amount, total)]),
    foot: rows.length ? ['Total', String(pays.length), fmt(total), ''] : undefined,
    empty: 'No money received in this period.',
  };
}

function expenseTable(records: Records, section: Section, range: Range, title: string): ReportTable {
  const e = expensesByCategory(records, section, range);
  return {
    title,
    head: ['Kind', 'Entries', 'Amount', 'Share'],
    align: [L, R, R, R],
    rows: e.rows.map((r) => [r.category, String(r.count), fmt(r.amount), pct(r.amount, e.total)]),
    foot: e.rows.length ? ['Total', String(sum(e.rows, (r) => r.count)), fmt(e.total), ''] : undefined,
    empty: 'No expenses in this period.',
  };
}

function monthTable(title: string, rows: { label: string; in: number; out: number }[], inLabel: string, outLabel: string): ReportTable {
  const tIn = sum(rows, (r) => r.in);
  const tOut = sum(rows, (r) => r.out);
  return {
    title,
    head: ['Month', inLabel, outLabel, 'Left over'],
    align: [L, R, R, R],
    rows: rows.map((r) => [r.label, fmt(r.in), fmt(r.out), fmt(r.in - r.out)]),
    foot: rows.length ? ['Total', fmt(tIn), fmt(tOut), fmt(tIn - tOut)] : undefined,
    empty: 'No months in this period.',
  };
}

export function buildBusinessReport(
  records: Records,
  settings: Settings,
  range: Range & { label: string },
  opts: ReportOptions,
  today = todayYmd(),
): ReportDoc {
  const cur = settings.currency;
  const customersById = new Map<string, Customer>(records.customers.map((c) => [c.id, c]));
  const nameOf = (r: { customerId?: string; customerName?: string }) => customerLabel(r, customersById);
  const byRef = paymentsByRef(records.payments);
  const levels = stockLevels(records.items, records.purchases, records.sales, records.adjustments);
  const itemName = (id: string) => records.items.find((i) => i.id === id)?.name ?? 'Item';

  const bake = bakeReport(records, range, today, nameOf);
  const hw = hardwareReport(records, range);
  const hwOut = hw.paidSuppliers + hw.expenses;
  const sections: ReportSection[] = [];

  // ---------- Bake Away ----------
  if (opts.section === 'bake') {
    const ing = ingredientSpend(records.expenses, range, bake.moneyIn);
    const prod = productProfit(records.orders, records.products, range);
    const tables: ReportTable[] = [
      byMethod(records, ['order'], range),
      expenseTable(records, 'bake', range, 'Money out by kind'),
      {
        title: 'Ingredients, one by one',
        head: ['Ingredient', 'Bought', 'Amount', 'Of money in'],
        align: [L, R, R, R],
        rows: ing.rows.map((r) => [r.ingredient, String(r.count), fmt(r.amount), pct(r.amount, bake.moneyIn)]),
        foot: ing.rows.length ? ['All ingredients', String(sum(ing.rows, (r) => r.count)), fmt(ing.total), pct(ing.total, bake.moneyIn)] : undefined,
        empty: 'No ingredient purchases in this period.',
        note: '"Of money in": out of every 100 shillings received, how many went on that ingredient.',
      },
      {
        title: 'What each product earned',
        head: ['Product', 'Sold', 'Sales', 'Usual cost', 'Profit'],
        align: [L, R, R, R, R],
        rows: [
          ...prod.rows.map((r) => [r.name, qty(r.qty), fmt(r.sales), r.costKnown ? fmt(r.cost) : 'not set', r.costKnown ? fmt(r.profit) : '']),
          ...(prod.other.sales > 0 ? [['Other items (not on the product list)', qty(prod.other.qty), fmt(prod.other.sales), '', '']] : []),
        ],
        foot: prod.cost > 0 ? ['Products with a cost', '', fmt(prod.sales), fmt(prod.cost), fmt(prod.profit)] : undefined,
        empty: 'No orders were needed in this period.',
        note: 'Orders by the day they were needed, cancelled ones left out. Profit uses each product\'s usual cost to make one, so it is an estimate.',
      },
      {
        title: 'Orders',
        head: ['', ''],
        align: [L, R],
        rows: [
          ['Orders needed in the period', String(bake.ordersCount)],
          ['Their value', money(bake.ordersValue, cur)],
          ['Delivered', String(bake.delivered)],
          ['Cancelled', String(bake.cancelled)],
          ['Owed to you today (all orders)', money(bake.owedNow, cur)],
        ],
        strong: [4],
      },
      {
        title: 'Best customers',
        head: ['Customer', 'Orders', 'Value'],
        align: [L, R, R],
        rows: bake.topCustomers.map((c) => [c.name, String(c.orders), fmt(c.value)]),
        empty: 'No orders in this period.',
      },
    ];
    if (opts.owing) {
      const owing = records.orders
        .map((o) => ({ o, t: orderTotals(o, byRef.get(o.id), today) }))
        .filter((x) => x.t.balance > 0)
        .sort((a, b) => (a.o.dueDate < b.o.dueDate ? -1 : 1));
      tables.push({
        title: 'Orders not fully paid (today)',
        head: ['Customer', 'Order', 'Needed', 'Total', 'Balance'],
        align: [L, L, L, R, R],
        rows: owing.slice(0, 60).map(({ o, t }) => [nameOf(o), `${o.number} · ${itemsText(o)}`, showDate(o.dueDate), fmt(t.value), fmt(t.balance)]),
        foot: owing.length ? ['Total owed', '', '', '', fmt(sum(owing, (x) => x.t.balance))] : undefined,
        empty: 'Nobody owes you on an order.',
      });
    }
    if (opts.months) tables.push(monthTable('Month by month', monthFlow(records, 'bake', range, today), 'Money in', 'Spent'));
    sections.push({
      key: 'bake',
      title: settings.bakeName,
      intro: 'Money in is payments received from customers; money out is expenses, both by their own dates.',
      cards: [
        { label: 'Money in', value: money(bake.moneyIn, cur), tone: 'good' },
        { label: 'Spent', value: money(bake.spent, cur) },
        { label: 'Profit', value: money(bake.leftOver, cur), sub: bake.moneyIn > 0 ? `Kept ${Math.round((bake.leftOver / bake.moneyIn) * 100)} of every 100 shillings` : 'Money in less spent', tone: bake.leftOver >= 0 ? 'good' : 'bad' },
        { label: 'Owed to you', value: money(bake.owedNow, cur), sub: 'Today, all orders', tone: bake.owedNow > 0 ? 'bad' : 'plain' },
      ],
      tables,
    });
  }

  // ---------- Hardware ----------
  if (opts.section === 'hardware') {
    const low = records.items.filter((i) => !i.archived && levels.get(i.id)?.low).sort((a, b) => a.name.localeCompare(b.name));
    const tables: ReportTable[] = [
      {
        title: 'Profit',
        head: ['', ''],
        align: [L, R],
        rows: [
          [`Sales (${hw.salesCount})`, money(hw.sales, cur)],
          ['What those goods cost you', less(hw.costOfGoods, cur)],
          ['Profit on goods', money(hw.grossProfit, cur)],
          ['Stock lost, damaged or used', less(hw.stockLost, cur)],
          ['Expenses', less(hw.expenses, cur)],
          ['Profit', money(hw.netProfit, cur)],
        ],
        strong: [2, 5],
      },
      {
        title: 'Cash in and out',
        head: ['', ''],
        align: [L, R],
        rows: [
          ['Received from customers', money(hw.received, cur)],
          ['Paid to suppliers for stock', less(hw.paidSuppliers, cur)],
          ['Expenses', less(hw.expenses, cur)],
          ['Left over from the shop', money(hw.received - hwOut, cur)],
          ['Your own money put in', money(hw.capitalIn, cur)],
          ['Your own money taken out', less(hw.capitalOut, cur)],
          ['Cash went up or down by', money(hw.cashMovement, cur)],
        ],
        strong: [3, 6],
      },
      byMethod(records, ['sale'], range),
      expenseTable(records, 'hardware', range, 'Expenses by kind'),
      {
        title: 'Best sellers',
        head: ['Item', 'Sold', 'Sales'],
        align: [L, R, R],
        rows: hw.bestSellers.map((b) => [itemName(b.itemId), `${qty(b.qty)} ${records.items.find((i) => i.id === b.itemId)?.unit ?? ''}`.trim(), fmt(b.value)]),
        empty: 'No sales in this period.',
      },
      {
        title: 'Where the shop stands today',
        head: ['', ''],
        align: [L, R],
        rows: [
          ['Stock in the shop, at cost', money(hw.stockValue, cur)],
          ['Customers owe you', money(hw.owedToYou, cur)],
          ['You owe suppliers', money(hw.youOwe, cur)],
          ['Your own money still in the shop', money(hw.capitalNet, cur)],
        ],
      },
      {
        title: 'Stock running low',
        head: ['Item', 'In stock', 'Warn at'],
        align: [L, R, R],
        rows: low.map((i) => [i.name, `${qty(levels.get(i.id)?.onHand)} ${i.unit}`, qty(i.reorderLevel)]),
        empty: 'Nothing is running low.',
      },
    ];
    if (opts.owing) {
      const customerDebts = records.sales
        .map((s) => ({ s, t: saleTotals(s, byRef.get(s.id)) }))
        .filter((x) => x.t.balance > 0)
        .sort((a, b) => (a.s.date < b.s.date ? -1 : 1));
      tables.push({
        title: 'Customers who owe (today)',
        head: ['Customer', 'Sale', 'Date', 'Total', 'Balance'],
        align: [L, L, L, R, R],
        rows: customerDebts.slice(0, 60).map(({ s, t }) => [nameOf(s), s.number, showDate(s.date), fmt(t.value), fmt(t.balance)]),
        foot: customerDebts.length ? ['Total owed to you', '', '', '', fmt(sum(customerDebts, (x) => x.t.balance))] : undefined,
        empty: 'No customer owes the shop.',
      });
      const supplierDebts = records.purchases
        .map((p) => ({ p, t: purchaseTotals(p, byRef.get(p.id)) }))
        .filter((x) => x.t.balance > 0)
        .sort((a, b) => (a.p.date < b.p.date ? -1 : 1));
      tables.push({
        title: 'Suppliers you owe (today)',
        head: ['Supplier', 'Date', 'Total', 'Balance'],
        align: [L, L, R, R],
        rows: supplierDebts.slice(0, 60).map(({ p, t }) => [p.supplier, showDate(p.date), fmt(t.value), fmt(t.balance)]),
        foot: supplierDebts.length ? ['Total you owe', '', '', fmt(sum(supplierDebts, (x) => x.t.balance))] : undefined,
        empty: 'You owe no supplier.',
      });
    }
    if (opts.months) tables.push(monthTable('Month by month', monthFlow(records, 'hardware', range, today), 'Money in', 'Money out'));
    sections.push({
      key: 'hardware',
      title: settings.hardwareName,
      intro: 'Money in is what customers paid; money out is what was paid to suppliers plus expenses. Your own money put in or taken out is shown apart.',
      cards: [
        { label: 'Money in', value: money(hw.received, cur), tone: 'good' },
        { label: 'Money out', value: money(hwOut, cur), sub: 'Suppliers and expenses' },
        { label: 'Profit', value: money(hw.netProfit, cur), sub: 'After all costs', tone: hw.netProfit >= 0 ? 'good' : 'bad' },
        { label: 'Stock value', value: money(hw.stockValue, cur), sub: 'Today, at cost' },
      ],
      tables,
    });
  }

  const notes = [
    `Amounts are in ${cur}. Money in and money out are cash that actually moved in the period, by the date of each payment or expense.`,
    ...(opts.section === 'bake' ? ['Profit is money in less money spent.'] : []),
    ...(opts.section === 'hardware'
      ? [`Profit counts goods at what they cost when they were sold (the average of everything bought), so it differs from the cash left over when stock is bought ahead or sold on credit. Money you put into or took out of the shop is not counted as money in or out.`]
      : []),
    'Figures marked "today" are as at the day the report was made, whatever the period.',
  ];

  const name = opts.section === 'bake' ? settings.bakeName : settings.hardwareName;
  return {
    title: `${name} report`,
    owner: [name, settings.ownerName].filter(Boolean).join(' · '),
    periodLabel: range.label,
    from: range.from,
    to: range.to,
    prepared: showDate(today),
    currency: cur,
    sections,
    notes,
    fileStem: `${name}-report-${range.label}`.replace(/[^\w]+/g, '-').toLowerCase().replace(/-+$/, ''),
  };
}

/** The whole report as one Excel-friendly file: each table under its section and title. */
export function reportRows(doc: ReportDoc): string[][] {
  const out: string[][] = [[doc.title], [doc.owner], [`Period: ${doc.periodLabel}`], [`Made on ${doc.prepared}`], []];
  for (const s of doc.sections) {
    out.push([s.title.toUpperCase()]);
    for (const c of s.cards) out.push([c.label, c.value, c.sub ?? '']);
    out.push([]);
    for (const t of s.tables) {
      out.push([t.title]);
      if (t.head.some(Boolean)) out.push(t.head);
      if (!t.rows.length && t.empty) out.push([t.empty]);
      for (const r of t.rows) out.push(r);
      if (t.foot) out.push(t.foot);
      out.push([]);
    }
  }
  out.push(['Notes']);
  for (const n of doc.notes) out.push([n]);
  return out;
}
