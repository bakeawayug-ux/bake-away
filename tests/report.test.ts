// The Business report: its figures must match the app's own report functions, and each output
// (preview, PDF, Excel) must come out of the same figures.
import { describe, expect, it } from 'vitest';
import { buildBusinessReport, monthFlow, reportRows } from '../src/lib/businessReport';
import { monthsBetween } from '../src/lib/dates';
import { buildReportHtml } from '../src/lib/reportHtml';
import { buildReportPdf } from '../src/lib/reportPdf';
import { DEFAULT_SETTINGS, EMPTY_RECORDS, type Records } from '../src/lib/types';

const base = { createdAt: 1, updatedAt: 1 };
const TODAY = '2026-11-11';
const NOV = { from: '2026-11-01', to: '2026-11-30', label: 'November 2026' };

const records: Records = {
  ...EMPTY_RECORDS,
  customers: [{ ...base, id: 'c1', section: 'bake', name: 'Sarah <Nakato>' }],
  orders: [
    { ...base, id: 'o1', number: 'BA-0001', customerId: 'c1', customerName: 'Sarah <Nakato>', date: '2026-11-01', dueDate: '2026-11-14', items: [{ what: 'Cake', qty: 1, price: 120000 }], delivery: 'Pick up', stage: 'Booked' },
    { ...base, id: 'o2', number: 'BA-0002', customerName: 'Joan', date: '2026-10-20', dueDate: '2026-10-25', items: [{ what: 'Cupcakes', qty: 2, price: 36000 }], delivery: 'Pick up', stage: 'Delivered' },
  ],
  payments: [
    { ...base, id: 'p1', kind: 'order', refId: 'o1', section: 'bake', amount: 60000, date: '2026-11-02', method: 'Mobile Money' },
    { ...base, id: 'p2', kind: 'order', refId: 'o2', section: 'bake', amount: 72000, date: '2026-10-25', method: 'Cash' },
    { ...base, id: 'p3', kind: 'sale', refId: 's1', section: 'hardware', amount: 100000, date: '2026-11-05', method: 'Cash' },
    { ...base, id: 'p4', kind: 'purchase', refId: 'pu1', section: 'hardware', amount: 200000, date: '2026-11-03', method: 'Bank' },
  ],
  expenses: [
    { ...base, id: 'e1', section: 'bake', date: '2026-11-04', category: 'Ingredients', description: 'Eggs', ingredient: 'Eggs', amount: 15000 },
    { ...base, id: 'e2', section: 'hardware', date: '2026-11-06', category: 'Rent', description: 'Rent', amount: 30000 },
  ],
  items: [{ ...base, id: 'cement', name: 'Cement', category: 'Building', unit: 'bag', sellPrice: 40000, reorderLevel: 5 }],
  purchases: [{ ...base, id: 'pu1', date: '2026-11-03', supplier: 'Hima', lines: [{ itemId: 'cement', qty: 10, price: 30000 }] }],
  sales: [{ ...base, id: 's1', number: 'HW-0001', date: '2026-11-05', customerName: 'Mukasa', lines: [{ itemId: 'cement', qty: 4, price: 40000 }] }],
  capital: [{ ...base, id: 'k1', section: 'hardware', date: '2026-11-01', direction: 'in', amount: 500000 }],
};

describe('Business report', () => {
  const bake = buildBusinessReport(records, DEFAULT_SETTINGS, NOV, { section: 'bake', months: true, owing: true }, TODAY);
  const hw = buildBusinessReport(records, DEFAULT_SETTINGS, NOV, { section: 'hardware', months: true, owing: true }, TODAY);
  const doc = hw;

  it('each report covers its own business only', () => {
    expect(bake.sections.map((s) => s.key)).toEqual(['bake']);
    expect(hw.sections.map((s) => s.key)).toEqual(['hardware']);
    expect(bake.title).toBe('Bake Away report');
    expect(hw.title).toBe('Hardware report');
    const bakeText = JSON.stringify(bake);
    expect(bakeText).not.toContain('Hardware');
    expect(bakeText).not.toContain('Mukasa');
    const hwText = JSON.stringify(hw);
    expect(hwText).not.toContain('Bake Away');
    expect(hwText).not.toContain('Sarah');
    expect(bake.fileStem).toBe('bake-away-report-november-2026');
    expect(hw.fileStem).toBe('hardware-report-november-2026');
  });

  it('Bake Away: money in, spent, profit and owed', () => {
    // 60,000 received in November (October's payment is outside the period), 15,000 spent.
    expect(bake.sections[0].cards.map((c) => c.value)).toEqual(['UGX 60,000', 'UGX 15,000', 'UGX 45,000', 'UGX 60,000']);
    const months = bake.sections[0].tables.find((t) => t.title === 'Month by month')!;
    expect(months.foot).toEqual(['Total', '60,000', '15,000', '45,000']);
  });

  it('Hardware: money in and out, profit, and the owner\'s own money kept apart', () => {
    // in 100,000; out = 200,000 to the supplier + 30,000 rent; profit = 160,000 - 120,000 - 30,000.
    expect(hw.sections[0].cards.map((c) => c.value)).toEqual(['UGX 100,000', 'UGX 230,000', 'UGX 10,000', 'UGX 180,000']);
    const cash = hw.sections[0].tables.find((t) => t.title === 'Cash in and out')!;
    expect(cash.rows.find((r) => r[0] === 'Your own money put in')?.[1]).toBe('UGX 500,000');
    expect(cash.rows.find((r) => r[0] === 'Your own money taken out')?.[1]).toBe('UGX 0');
    expect(cash.rows.find((r) => r[0] === 'Left over from the shop')?.[1]).toBe('-UGX 130,000');
  });

  it('lists who owes, as at today', () => {
    const bakeOwing = bake.sections[0].tables.find((t) => t.title.startsWith('Orders not fully paid'))!;
    expect(bakeOwing.rows).toHaveLength(1);
    expect(bakeOwing.foot?.[4]).toBe('60,000');
    const hwOwing = hw.sections[0].tables.find((t) => t.title.startsWith('Customers who owe'))!;
    expect(hwOwing.foot?.[4]).toBe('60,000');
    const suppliers = hw.sections[0].tables.find((t) => t.title.startsWith('Suppliers you owe'))!;
    expect(suppliers.foot?.[3]).toBe('100,000');
  });

  it('leaves parts out when asked', () => {
    const lean = buildBusinessReport(records, DEFAULT_SETTINGS, NOV, { section: 'bake', months: false, owing: false }, TODAY);
    expect(lean.sections[0].tables.some((t) => t.title.startsWith('Orders not fully paid'))).toBe(false);
    expect(lean.sections[0].tables.some((t) => t.title === 'Month by month')).toBe(false);
  });

  it('works out months, including all time from the first record', () => {
    expect(monthsBetween('2026-10-15', '2027-01-02').map((m) => m.label)).toEqual(['Oct 2026', 'Nov 2026', 'Dec 2026', 'Jan 2027']);
    const rows = monthFlow(records, 'bake', { from: '', to: '' }, TODAY);
    expect(rows.map((r) => [r.key, r.in, r.out])).toEqual([
      ['2026-10', 72000, 0],
      ['2026-11', 60000, 15000],
    ]);
  });

  it('shows names safely in the preview and keeps every table in the Excel rows', () => {
    const html = buildReportHtml(bake, 'https://example.test/logo.jpg');
    expect(html).toContain('Sarah &lt;Nakato&gt;');
    expect(html).not.toContain('Sarah <Nakato>');
    const rows = reportRows(bake);
    const titles = bake.sections.flatMap((s) => s.tables.map((t) => t.title));
    for (const t of titles) expect(rows.some((r) => r[0] === t)).toBe(true);
  });

  it('makes a real PDF file', async () => {
    const blob = await buildReportPdf(doc, 'https://example.test/missing-logo.jpg');
    const head = new TextDecoder().decode((await blob.arrayBuffer()).slice(0, 5));
    expect(head).toBe('%PDF-');
    expect(blob.size).toBeGreaterThan(3000);
  });
});
