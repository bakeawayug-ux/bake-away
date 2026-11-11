// Hardware pages: Overview, Stock, Sales, Stock in, Money invested, Reports.
import { ArrowDownLeft, ArrowUpRight, Banknote, Boxes, Download, HandCoins, PackagePlus, Plus, ShoppingCart, TriangleAlert, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { MonthChart, SaleRow } from '../components/rows';
import { useSheets } from '../components/SheetHost';
import { Badge, Bars, Button, Choice, Empty, Line, List, PageHead, PeriodPicker, SearchBox, SectionTitle, StatCard, payTone, usePeriod } from '../components/ui';
import { useData } from '../data/DataContext';
import { giveFile, toCsv } from '../lib/backup';
import { inPeriod, longToday, presetPeriod, showDate, showDay } from '../lib/dates';
import { money, num, qty, sum } from '../lib/money';
import { customerLabel } from '../lib/orders';
import { hardwareReport, monthBars } from '../lib/reports';
import { linesText, linesValue, purchaseTotals, saleCost, saleTotals, saleValue } from '../lib/stock';

export function HardwareOverview() {
  const d = useData();
  const sheets = useSheets();
  const cur = d.settings.currency;
  const month = useMemo(() => presetPeriod('thisMonth', d.today), [d.today]);
  const report = useMemo(() => hardwareReport(d, month), [d, month]);
  const bars = useMemo(() => monthBars(d, 'hardware', 6, d.today), [d]);
  const low = d.items.filter((i) => !i.archived && d.levels.get(i.id)?.low).sort((a, b) => a.name.localeCompare(b.name));
  const recent = [...d.sales].sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1)).slice(0, 5);
  const empty = d.ready && d.items.length === 0;

  return (
    <>
      <PageHead eyebrow={longToday()} title="Overview" />
      {empty && (
        <div className="mb-5">
          <Empty
            icon={Boxes}
            title="Start with what is in the shop"
            body="Add each item you sell, with how many you have now and what each cost you. After that, record Stock in when you buy and a Sale when you sell: the app keeps the count."
            action={
              <Button icon={Plus} onClick={() => sheets.open({ t: 'item' })}>
                Add the first item
              </Button>
            }
          />
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Sales" value={money(report.sales, cur)} sub={`${month.label} · ${report.salesCount} sale${report.salesCount === 1 ? '' : 's'}`} icon={ShoppingCart} tone="good" />
        <StatCard label="Profit" value={money(report.netProfit, cur)} sub="After cost of goods and expenses" icon={Wallet} tone={report.netProfit >= 0 ? 'good' : 'warn'} />
        <StatCard label="Stock value" value={money(report.stockValue, cur)} sub="What is in the shop, at cost" icon={Boxes} />
        <StatCard label="Owed to you" value={money(report.owedToYou, cur)} sub="Credit sales not yet paid" icon={HandCoins} tone={report.owedToYou > 0 ? 'warn' : 'plain'} />
      </div>
      {(report.youOwe > 0 || report.capitalNet !== 0) && (
        <div className="card mt-3 px-4 py-2 text-[15px]">
          {report.youOwe > 0 && <Line label="You owe suppliers" value={money(report.youOwe, cur)} tone="bad" />}
          {report.capitalNet !== 0 && <Line label="Your own money in the shop" value={money(report.capitalNet, cur)} />}
        </div>
      )}

      {low.length > 0 && (
        <>
          <SectionTitle
            action={
              <Link to="/hardware/stock" className="text-sm font-semibold text-accent-dark">
                All stock
              </Link>
            }
          >
            Running low
          </SectionTitle>
          <List>
            {low.map((i) => {
              const l = d.levels.get(i.id);
              return (
                <button key={i.id} type="button" className="row" onClick={() => sheets.open({ t: 'itemView', id: i.id })}>
                  <TriangleAlert size={20} className="shrink-0 text-amber" aria-hidden />
                  <span className="min-w-0 flex-1 truncate font-medium">{i.name}</span>
                  <span className="num shrink-0 font-semibold text-amber">
                    {qty(l?.onHand)} {i.unit} left
                  </span>
                </button>
              );
            })}
          </List>
        </>
      )}

      <SectionTitle
        action={
          <Link to="/hardware/sales" className="text-sm font-semibold text-accent-dark">
            All sales
          </Link>
        }
      >
        Latest sales
      </SectionTitle>
      {recent.length === 0 ? (
        <p className="card px-4 py-4 text-sm text-muted">No sales yet.</p>
      ) : (
        <List>
          {recent.map((s) => (
            <SaleRow key={s.id} sale={s} />
          ))}
        </List>
      )}

      <SectionTitle>Last six months</SectionTitle>
      <MonthChart bars={bars} inLabel="Received from sales" outLabel="Paid out (stock and expenses)" />
    </>
  );
}

export function Stock() {
  const d = useData();
  const sheets = useSheets();
  const cur = d.settings.currency;
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState('');
  const [archived, setArchived] = useState(false);
  const active = d.items.filter((i) => !i.archived);
  const groups = [...new Set(active.map((i) => i.category || 'Other'))].sort();
  const lowCount = active.filter((i) => d.levels.get(i.id)?.low).length;
  const q = search.trim().toLowerCase();
  const rows = d.items
    .filter((i) => (archived ? i.archived : !i.archived))
    .filter((i) => (group === 'low' ? d.levels.get(i.id)?.low : !group || (i.category || 'Other') === group))
    .filter((i) => !q || i.name.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name));
  const value = sum(active, (i) => d.levels.get(i.id)?.value);
  const archivedCount = d.items.length - active.length;

  return (
    <>
      <PageHead
        eyebrow={`${active.length} item${active.length === 1 ? '' : 's'}`}
        title="Stock"
        action={
          <Button icon={Plus} onClick={() => sheets.open({ t: 'item' })}>
            New item
          </Button>
        }
      />
      <div className="mb-3 grid grid-cols-2 gap-3">
        <StatCard label="Stock value" value={money(value, cur)} sub="At what it cost you" icon={Boxes} />
        <StatCard label="Running low" value={String(lowCount)} sub={lowCount ? 'Tap to see them' : 'Nothing low'} icon={TriangleAlert} tone={lowCount ? 'warn' : 'plain'} onClick={lowCount ? () => setGroup('low') : undefined} />
      </div>
      <div className="space-y-3">
        <SearchBox value={search} onChange={setSearch} placeholder="Search items" />
        {(groups.length > 1 || lowCount > 0) && (
          <Choice scroll value={group} onChange={setGroup} options={[{ value: '', label: 'All' }, ...(lowCount ? [{ value: 'low', label: 'Running low', count: lowCount }] : []), ...groups.map((g) => ({ value: g, label: g }))]} />
        )}
      </div>
      <div className="mt-4">
        {rows.length === 0 ? (
          <Empty icon={Boxes} title={q || group ? 'Nothing matches' : archived ? 'No archived items' : 'No items yet'} body={q || group || archived ? undefined : 'Add each item you sell. The count goes up with Stock in and down with each Sale.'} />
        ) : (
          <List>
            {rows.map((i) => {
              const l = d.levels.get(i.id);
              return (
                <button key={i.id} type="button" className="row" onClick={() => sheets.open({ t: 'itemView', id: i.id })}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{i.name}</span>
                    <span className="block truncate text-sm text-muted">
                      {i.category} · sells at {money(i.sellPrice, cur)}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="num block font-semibold">
                      {qty(l?.onHand)} <span className="text-sm font-normal text-muted">{i.unit}</span>
                    </span>
                    {(l?.onHand ?? 0) < 0 ? <Badge tone="red">Check count</Badge> : l?.low ? <Badge tone="amber">Low</Badge> : <span className="num text-xs text-muted">{money(l?.value, cur)}</span>}
                  </span>
                </button>
              );
            })}
          </List>
        )}
      </div>
      {archivedCount > 0 && (
        <Button small variant="plain" className="mt-4" onClick={() => setArchived(!archived)}>
          {archived ? 'Back to current items' : `Show archived items (${archivedCount})`}
        </Button>
      )}
    </>
  );
}

export function Sales() {
  const d = useData();
  const sheets = useSheets();
  const cur = d.settings.currency;
  const period = usePeriod('thisMonth');
  const [unpaid, setUnpaid] = useState<'all' | 'unpaid'>('all');
  const inRange = useMemo(() => d.sales.filter((s) => inPeriod(s.date, period.period)), [d.sales, period.period]);
  const totals = useMemo(() => {
    const t = inRange.map((s) => saleTotals(s, d.byRef.get(s.id)));
    return { value: sum(t, (x) => x.value), paid: sum(t, (x) => x.paid), balance: sum(t, (x) => x.balance) };
  }, [inRange, d.byRef]);
  const rows = inRange.filter((s) => unpaid === 'all' || saleTotals(s, d.byRef.get(s.id)).balance > 0).sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1));

  return (
    <>
      <PageHead
        eyebrow={period.period.label}
        title="Sales"
        action={
          <Button icon={Plus} onClick={() => sheets.open({ t: 'sale' })}>
            New sale
          </Button>
        }
      />
      <PeriodPicker state={period} />
      <div className="mt-4 grid grid-cols-2 gap-3">
        <StatCard label="Sold" value={money(totals.value, cur)} sub={`${inRange.length} sale${inRange.length === 1 ? '' : 's'}`} icon={ShoppingCart} tone="good" />
        <StatCard label="Still owed" value={money(totals.balance, cur)} sub="On these sales" icon={HandCoins} tone={totals.balance > 0 ? 'warn' : 'plain'} />
      </div>
      {totals.balance > 0 && (
        <div className="mt-3">
          <Choice
            value={unpaid}
            onChange={setUnpaid}
            options={[
              { value: 'all', label: 'All sales' },
              { value: 'unpaid', label: 'Not fully paid' },
            ]}
          />
        </div>
      )}
      <div className="mt-4">
        {rows.length === 0 ? (
          <Empty icon={ShoppingCart} title="No sales in this period" body="Tap the + button to record a sale." />
        ) : (
          <List>
            {rows.map((s) => (
              <SaleRow key={s.id} sale={s} />
            ))}
          </List>
        )}
      </div>
    </>
  );
}

export function StockIn() {
  const d = useData();
  const sheets = useSheets();
  const cur = d.settings.currency;
  const period = usePeriod('thisMonth');
  const rows = useMemo(() => d.purchases.filter((p) => inPeriod(p.date, period.period)).sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1)), [d.purchases, period.period]);
  const bought = sum(rows.filter((p) => !p.opening), (p) => linesValue(p.lines));
  const owe = sum(d.purchases, (p) => purchaseTotals(p, d.byRef.get(p.id)).balance);

  return (
    <>
      <PageHead
        eyebrow={period.period.label}
        title="Stock in"
        action={
          <Button icon={Plus} onClick={() => sheets.open({ t: 'purchase' })}>
            Stock in
          </Button>
        }
      />
      <PeriodPicker state={period} />
      <div className="mt-4 grid grid-cols-2 gap-3">
        <StatCard label="Stock bought" value={money(bought, cur)} sub={period.period.label} icon={PackagePlus} />
        <StatCard label="You owe suppliers" value={money(owe, cur)} sub="On all stock bought" icon={HandCoins} tone={owe > 0 ? 'warn' : 'plain'} />
      </div>
      <div className="mt-4">
        {rows.length === 0 ? (
          <Empty icon={PackagePlus} title="No stock came in during this period" body="Tap the + button and choose Stock in when you buy items for the shop." />
        ) : (
          <List>
            {rows.map((p) => {
              const t = purchaseTotals(p, d.byRef.get(p.id));
              return (
                <button key={p.id} type="button" className="row" onClick={() => sheets.open({ t: 'purchaseView', id: p.id })}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{linesText(p.lines, (id) => d.itemsById.get(id)?.name ?? 'Item')}</span>
                    <span className="block truncate text-sm text-muted">
                      {showDay(p.date)} · {p.supplier}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="num block font-semibold">{money(t.value, cur)}</span>
                    {p.opening ? <Badge tone="brown">Opening</Badge> : <Badge tone={payTone(t.status)}>{t.status}</Badge>}
                  </span>
                </button>
              );
            })}
          </List>
        )}
      </div>
    </>
  );
}

export function MoneyInvested() {
  const d = useData();
  const sheets = useSheets();
  const cur = d.settings.currency;
  const rows = d.capital.filter((c) => c.section === 'hardware').sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1));
  const put = sum(rows.filter((c) => c.direction === 'in'), (c) => c.amount);
  const took = sum(rows.filter((c) => c.direction === 'out'), (c) => c.amount);
  const report = useMemo(() => hardwareReport(d, { from: '', to: '' }), [d]);

  return (
    <>
      <PageHead
        eyebrow="Your own money in the shop"
        title="Money invested"
        action={
          <Button icon={Plus} onClick={() => sheets.open({ t: 'capital' })}>
            Add
          </Button>
        }
      />
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="You put in" value={money(put, cur)} icon={ArrowDownLeft} tone="good" />
        <StatCard label="You took out" value={money(took, cur)} icon={ArrowUpRight} />
      </div>
      <div className="card mt-3 px-4 py-2 text-[15px]">
        <Line label="Still invested (put in less taken out)" value={money(put - took, cur)} strong />
        <div className="mt-1 border-t border-line pt-1">
          <Line label="Stock in the shop, at cost" value={money(report.stockValue, cur)} />
          <Line label="Customers owe you" value={money(report.owedToYou, cur)} />
          <Line label="You owe suppliers" value={money(report.youOwe, cur)} />
          <Line label="Profit made so far" value={money(report.netProfit, cur)} tone={report.netProfit >= 0 ? 'good' : 'bad'} />
        </div>
        <p className="py-1 text-xs text-muted">Compare what you still have invested with what the shop holds today: stock, plus what customers owe, less what you owe suppliers, plus the cash in the till or on the phone.</p>
      </div>

      <SectionTitle>Entries</SectionTitle>
      {rows.length === 0 ? (
        <Empty
          icon={Wallet}
          title="Nothing recorded yet"
          body="Record the money you used to start or grow the shop, and any money you take out for yourself. It is kept apart from sales and expenses."
          action={
            <Button icon={Plus} onClick={() => sheets.open({ t: 'capital' })}>
              Add
            </Button>
          }
        />
      ) : (
        <List>
          {rows.map((c) => (
            <button key={c.id} type="button" className="row" onClick={() => sheets.open({ t: 'capital', id: c.id })}>
              {c.direction === 'in' ? <ArrowDownLeft size={20} className="shrink-0 text-leaf" aria-hidden /> : <ArrowUpRight size={20} className="shrink-0 text-cherry" aria-hidden />}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{c.note || (c.direction === 'in' ? 'Money put in' : 'Money taken out')}</span>
                <span className="block text-sm text-muted">
                  {showDate(c.date)} · {c.direction === 'in' ? 'put in' : 'taken out'}
                </span>
              </span>
              <span className={`num shrink-0 font-semibold ${c.direction === 'in' ? 'text-leaf' : 'text-cherry'}`}>
                {c.direction === 'in' ? '+' : '-'}
                {money(c.amount, cur)}
              </span>
            </button>
          ))}
        </List>
      )}
    </>
  );
}

export function HardwareReports() {
  const d = useData();
  const cur = d.settings.currency;
  const period = usePeriod('thisMonth');
  const range = period.period;
  const r = useMemo(() => hardwareReport(d, range), [d, range]);
  const stamp = range.label.replace(/[^\w]+/g, '-').toLowerCase();
  const name = (id: string) => d.itemsById.get(id)?.name ?? 'Item';

  const downloadSales = () =>
    giveFile(
      `hardware-sales-${stamp}.csv`,
      toCsv(
        ['Number', 'Date', 'Customer', 'Items', 'Total', 'Paid', 'Balance', 'Cost of goods', 'Profit', 'Note'],
        d.sales
          .filter((s) => inPeriod(s.date, range))
          .sort((a, b) => (a.date < b.date ? -1 : 1))
          .map((s) => {
            const t = saleTotals(s, d.byRef.get(s.id));
            const cost = saleCost(s, d.levels);
            return [s.number, showDate(s.date), customerLabel(s, d.customersById), linesText(s.lines, name), t.value, t.paid, t.balance, cost, saleValue(s) - cost, s.note ?? ''];
          }),
      ),
      'text/csv',
    );
  const downloadStock = () =>
    giveFile(
      `hardware-stock-${d.today}.csv`,
      toCsv(
        ['Item', 'Group', 'Unit', 'In stock', 'Average cost', 'Stock value', 'Selling price', 'Bought so far', 'Sold so far', 'Archived'],
        [...d.items]
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((i) => {
            const l = d.levels.get(i.id);
            return [i.name, i.category, i.unit, l?.onHand ?? 0, Math.round(l?.avgCost ?? 0), l?.value ?? 0, num(i.sellPrice), l?.bought ?? 0, l?.sold ?? 0, i.archived ? 'yes' : ''];
          }),
      ),
      'text/csv',
    );
  const downloadStockIn = () =>
    giveFile(
      `hardware-stock-in-${stamp}.csv`,
      toCsv(
        ['Date', 'Supplier', 'Item', 'Quantity', 'Cost each', 'Line total', 'Opening stock'],
        d.purchases
          .filter((p) => inPeriod(p.date, range))
          .sort((a, b) => (a.date < b.date ? -1 : 1))
          .flatMap((p) => p.lines.map((l) => [showDate(p.date), p.supplier, name(l.itemId), num(l.qty), num(l.price), num(l.qty) * num(l.price), p.opening ? 'yes' : ''])),
      ),
      'text/csv',
    );
  const downloadExpenses = () =>
    giveFile(
      `hardware-expenses-${stamp}.csv`,
      toCsv(
        ['Date', 'Kind', 'What for', 'Paid to', 'Amount', 'Note'],
        d.expenses
          .filter((e) => e.section === 'hardware' && inPeriod(e.date, range))
          .sort((a, b) => (a.date < b.date ? -1 : 1))
          .map((e) => [showDate(e.date), e.category, e.description, e.paidTo ?? '', num(e.amount), e.note ?? '']),
      ),
      'text/csv',
    );

  return (
    <>
      <PageHead
        eyebrow={range.label}
        title="Reports"
        action={
          <Link to="/hardware/report" className="btn btn-soft btn-sm">
            PDF report
          </Link>
        }
      />
      <PeriodPicker state={period} />

      <SectionTitle>Profit</SectionTitle>
      <div className="card px-4 py-2 text-[15px]">
        <Line label={`Sales (${r.salesCount})`} value={money(r.sales, cur)} />
        <Line label="What those goods cost you" value={`-${money(r.costOfGoods, cur)}`} />
        <Line label="Profit on goods" value={money(r.grossProfit, cur)} strong />
        {r.stockLost > 0 && <Line label="Stock lost, damaged or used" value={`-${money(r.stockLost, cur)}`} />}
        <Line label="Expenses" value={`-${money(r.expenses, cur)}`} />
        <div className="mt-1 border-t border-line pt-1">
          <Line label="Profit" value={money(r.netProfit, cur)} strong tone={r.netProfit >= 0 ? 'good' : 'bad'} />
        </div>
      </div>

      <SectionTitle>Cash in and out</SectionTitle>
      <div className="card px-4 py-2 text-[15px]">
        <Line label="Received from customers" value={money(r.received, cur)} tone="good" />
        <Line label="You put in" value={money(r.capitalIn, cur)} />
        <Line label="Paid to suppliers for stock" value={`-${money(r.paidSuppliers, cur)}`} />
        <Line label="Expenses" value={`-${money(r.expenses, cur)}`} />
        <Line label="You took out" value={`-${money(r.capitalOut, cur)}`} />
        <div className="mt-1 border-t border-line pt-1">
          <Line label="Cash went up or down by" value={money(r.cashMovement, cur)} strong tone={r.cashMovement >= 0 ? 'good' : 'bad'} />
        </div>
      </div>

      <SectionTitle>Where the shop stands today</SectionTitle>
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Stock value" value={money(r.stockValue, cur)} icon={Boxes} />
        <StatCard label="Owed to you" value={money(r.owedToYou, cur)} icon={HandCoins} tone={r.owedToYou > 0 ? 'warn' : 'plain'} />
        <StatCard label="You owe suppliers" value={money(r.youOwe, cur)} icon={Banknote} tone={r.youOwe > 0 ? 'warn' : 'plain'} />
        <StatCard label="Your money invested" value={money(r.capitalNet, cur)} icon={Wallet} />
      </div>

      {r.bestSellers.length > 0 && (
        <>
          <SectionTitle>Best sellers</SectionTitle>
          <List>
            {r.bestSellers.map((b) => (
              <div key={b.itemId} className="flex items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{name(b.itemId)}</span>
                  <span className="block text-sm text-muted">
                    {qty(b.qty)} {d.itemsById.get(b.itemId)?.unit ?? ''} sold
                  </span>
                </span>
                <span className="num shrink-0 font-semibold">{money(b.value, cur)}</span>
              </div>
            ))}
          </List>
        </>
      )}

      {r.categories.length > 0 && (
        <>
          <SectionTitle>Expenses by kind</SectionTitle>
          <div className="card p-4">
            <Bars currency={cur} rows={r.categories.map((c) => ({ label: c.category, amount: c.amount, share: c.share }))} />
          </div>
        </>
      )}

      <SectionTitle>Take the figures with you</SectionTitle>
      <div className="flex flex-wrap gap-2">
        <Button small variant="plain" icon={Download} onClick={downloadSales}>
          Sales
        </Button>
        <Button small variant="plain" icon={Download} onClick={downloadStockIn}>
          Stock in
        </Button>
        <Button small variant="plain" icon={Download} onClick={downloadStock}>
          Stock list
        </Button>
        <Button small variant="plain" icon={Download} onClick={downloadExpenses}>
          Expenses
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted">Cost of goods uses each item's average cost. Stock list is as at today; the others cover {range.label}.</p>
    </>
  );
}
