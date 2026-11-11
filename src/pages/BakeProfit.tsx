// Bake Away: the product list, and the "Profit and reports" page that shows where the money goes
// (ingredient by ingredient) and what each product earns.
import { Banknote, ChartColumn, Cookie, Download, Pencil, Plus, Receipt, Wallet } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useSheets } from '../components/SheetHost';
import { Badge, Bars, Button, Empty, Line, List, PageHead, PeriodPicker, SectionTitle, StatCard, useNotice, usePeriod } from '../components/ui';
import { useData } from '../data/DataContext';
import { giveFile, toCsv } from '../lib/backup';
import { inPeriod, showDate } from '../lib/dates';
import { fmt, money, num, qty } from '../lib/money';
import { customerLabel, itemsText } from '../lib/orders';
import { bakeReport, ingredientSpend, productProfit } from '../lib/reports';
import { SUGGESTED_PRODUCTS } from '../lib/types';

export function Products() {
  const d = useData();
  const sheets = useSheets();
  const notify = useNotice();
  const cur = d.settings.currency;
  const rows = [...d.products].sort((a, b) => a.name.localeCompare(b.name));
  const missing = SUGGESTED_PRODUCTS.filter((n) => !rows.some((p) => p.name.toLowerCase() === n.toLowerCase()));
  const addSuggested = () =>
    d.actions
      .addProducts(SUGGESTED_PRODUCTS)
      .then(() => notify('Added. Tap each one to set its price and cost.'))
      .catch((e: Error) => notify(e.message, 'bad'));

  return (
    <>
      <PageHead
        eyebrow="What you bake and sell again and again"
        title="Products"
        action={
          <Button icon={Plus} onClick={() => sheets.open({ t: 'product' })}>
            New product
          </Button>
        }
      />
      <p className="mb-4 text-[15px] text-muted">
        Give each product its usual price and what it usually costs you to make one. Orders then fill in the price for you, and{' '}
        <Link to="/bake/reports" className="font-semibold text-accent-dark underline">
          Profit and reports
        </Link>{' '}
        shows what each product earns.
      </p>
      {rows.length === 0 ? (
        <Empty
          icon={Cookie}
          title="No products yet"
          body="Start from a list of common bakes and change it to suit you, or add your own one by one."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={addSuggested}>Start with the usual list</Button>
              <Button variant="plain" icon={Plus} onClick={() => sheets.open({ t: 'product' })}>
                Add my own
              </Button>
            </div>
          }
        />
      ) : (
        <>
          <List>
            {rows.map((p) => {
              const left = num(p.price) - num(p.cost);
              return (
                <button key={p.id} type="button" className="row" onClick={() => sheets.open({ t: 'product', id: p.id })}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{p.name}</span>
                    <span className="block truncate text-sm text-muted">{num(p.cost) > 0 ? `Costs about ${money(p.cost, cur)} to make` : 'Cost to make not set yet'}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="num block font-medium">{num(p.price) > 0 ? money(p.price, cur) : 'No price'}</span>
                    {num(p.price) > 0 && num(p.cost) > 0 && <Badge tone={left >= 0 ? 'green' : 'red'}>keeps {fmt(left)}</Badge>}
                  </span>
                  <Pencil size={16} className="shrink-0 text-faint" aria-hidden />
                </button>
              );
            })}
          </List>
          {missing.length > 0 && missing.length < SUGGESTED_PRODUCTS.length && (
            <Button small variant="plain" className="mt-3" onClick={addSuggested}>
              Add the other suggested products
            </Button>
          )}
        </>
      )}
    </>
  );
}

export function BakeReports() {
  const d = useData();
  const cur = d.settings.currency;
  const period = usePeriod('thisMonth');
  const range = period.period;
  const report = useMemo(() => bakeReport(d, range, d.today, (o) => customerLabel(o, d.customersById)), [d, range]);
  const ingredients = useMemo(() => ingredientSpend(d.expenses, range, report.moneyIn), [d.expenses, range, report.moneyIn]);
  const products = useMemo(() => productProfit(d.orders, d.products, range), [d.orders, d.products, range]);
  const percent = (n: number) => `${Math.round(n * 100)}%`;
  const keepRate = report.moneyIn > 0 ? report.leftOver / report.moneyIn : 0;
  const stamp = range.label.replace(/[^\w]+/g, '-').toLowerCase();

  const downloadOrders = () =>
    giveFile(
      `bake-away-orders-${stamp}.csv`,
      toCsv(
        ['Number', 'Customer', 'Taken on', 'Needed on', 'Items', 'Delivery', 'Stage', 'Total', 'Paid', 'Balance', 'Notes'],
        d.orders
          .filter((o) => inPeriod(o.dueDate, range))
          .sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1))
          .map((o) => {
            const t = d.orderTotalsById.get(o.id);
            return [o.number, customerLabel(o, d.customersById), showDate(o.date), showDate(o.dueDate), itemsText(o), o.delivery, o.stage, t?.value ?? 0, t?.paid ?? 0, t?.balance ?? 0, o.notes ?? ''];
          }),
      ),
      'text/csv',
    );
  const downloadExpenses = () =>
    giveFile(
      `bake-away-expenses-${stamp}.csv`,
      toCsv(
        ['Date', 'Kind', 'Ingredient', 'How much', 'What for', 'Paid to', 'Amount', 'Note'],
        d.expenses
          .filter((e) => e.section === 'bake' && inPeriod(e.date, range))
          .sort((a, b) => (a.date < b.date ? -1 : 1))
          .map((e) => [showDate(e.date), e.category, e.ingredient ?? '', e.qtyNote ?? '', e.description, e.paidTo ?? '', num(e.amount), e.note ?? '']),
      ),
      'text/csv',
    );
  const downloadPayments = () => {
    const orderById = new Map(d.orders.map((o) => [o.id, o]));
    return giveFile(
      `bake-away-payments-${stamp}.csv`,
      toCsv(
        ['Date', 'Order', 'Customer', 'How', 'Amount', 'Note'],
        d.payments
          .filter((p) => p.kind === 'order' && inPeriod(p.date, range))
          .sort((a, b) => (a.date < b.date ? -1 : 1))
          .map((p) => {
            const o = orderById.get(p.refId);
            return [showDate(p.date), o?.number ?? '', o ? customerLabel(o, d.customersById) : '', p.method, num(p.amount), p.note ?? ''];
          }),
      ),
      'text/csv',
    );
  };

  return (
    <>
      <PageHead
        eyebrow={range.label}
        title="Profit and reports"
        action={
          <Link to="/bake/report" className="btn btn-soft btn-sm">
            PDF report
          </Link>
        }
      />
      <PeriodPicker state={period} />

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard label="Money in" value={money(report.moneyIn, cur)} sub="Payments received" icon={Banknote} tone="good" />
        <StatCard label="Spent" value={money(report.spent, cur)} sub="All expenses" icon={Receipt} />
        <div className="col-span-2 md:col-span-1">
          <StatCard label="Profit" value={money(report.leftOver, cur)} sub={report.moneyIn > 0 ? `You kept ${Math.round(keepRate * 100)} of every 100 shillings` : 'Money in less spent'} icon={Wallet} tone={report.leftOver >= 0 ? 'good' : 'warn'} />
        </div>
      </div>

      <SectionTitle>Where the money went</SectionTitle>
      {report.categories.length === 0 ? (
        <p className="card px-4 py-3 text-sm text-muted">No expenses in this period.</p>
      ) : (
        <div className="card p-4">
          <Bars currency={cur} rows={report.categories.map((r) => ({ label: r.category, amount: r.amount, share: r.share }))} />
        </div>
      )}

      <SectionTitle
        action={
          <Link to="/settings" className="text-sm font-semibold text-accent-dark">
            Edit the list
          </Link>
        }
      >
        Ingredients, one by one
      </SectionTitle>
      {ingredients.rows.length === 0 ? (
        <p className="card px-4 py-3 text-sm text-muted">Nothing yet. When you add an expense of the kind Ingredients, choose which ingredient it was; each one then shows here with what it took out of your sales.</p>
      ) : (
        <div className="card p-4">
          <Bars
            currency={cur}
            rows={ingredients.rows.map((r) => ({ label: r.ingredient, amount: r.amount, share: r.share, note: report.moneyIn > 0 ? `${percent(r.ofMoneyIn)} of money in` : undefined }))}
          />
          <div className="mt-3 border-t border-line pt-2 text-[15px]">
            <Line label="All ingredients" value={money(ingredients.total, cur)} strong />
            {report.moneyIn > 0 && <Line label="Out of every 100 shillings received" value={`${Math.round((ingredients.total / report.moneyIn) * 100)} went on ingredients`} />}
          </div>
        </div>
      )}
      <p className="mt-2 text-xs text-muted">The percentage on the right of each bar is that ingredient's share of all ingredient spending.</p>

      <SectionTitle
        action={
          <Link to="/bake/products" className="text-sm font-semibold text-accent-dark">
            Products
          </Link>
        }
      >
        What each product earned
      </SectionTitle>
      {products.rows.length === 0 && products.other.sales === 0 ? (
        <p className="card px-4 py-3 text-sm text-muted">No orders were needed in this period.</p>
      ) : (
        <>
          <div className="card divide-y divide-line">
            {products.rows.map((r) => (
              <div key={r.name} className="px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate font-semibold">{r.name}</span>
                  <span className="num shrink-0 font-semibold">{money(r.sales, cur)}</span>
                </div>
                <div className="mt-0.5 flex items-baseline justify-between gap-3 text-sm text-muted">
                  <span>{qty(r.qty)} sold</span>
                  {r.costKnown ? (
                    <span className="num">
                      cost {money(r.cost, cur)} · <span className={r.profit >= 0 ? 'font-semibold text-leaf' : 'font-semibold text-cherry'}>profit {money(r.profit, cur)}</span>
                    </span>
                  ) : (
                    <Link to="/bake/products" className="font-medium text-accent-dark underline">
                      Set its cost to see the profit
                    </Link>
                  )}
                </div>
              </div>
            ))}
            {products.other.sales > 0 && (
              <div className="px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-semibold">Other items</span>
                  <span className="num font-semibold">{money(products.other.sales, cur)}</span>
                </div>
                <p className="mt-0.5 text-sm text-muted">Items typed by hand that are not on the product list.</p>
              </div>
            )}
          </div>
          {products.cost > 0 && (
            <div className="card mt-3 px-4 py-2 text-[15px]">
              <Line label="Sales of products with a cost" value={money(products.sales, cur)} />
              <Line label="Their usual cost to make" value={money(products.cost, cur)} />
              <Line label="Estimated profit" value={money(products.profit, cur)} strong tone={products.profit >= 0 ? 'good' : 'bad'} />
              <div className="mt-1 border-t border-line pt-1">
                <Line label="Really spent on ingredients" value={money(ingredients.total, cur)} />
              </div>
              <p className="py-1 text-xs text-muted">
                The estimate uses each product's "usual cost to make one". If you really spend much more on ingredients than the usual costs add up to, the usual costs are too low, or ingredients are being wasted or bought ahead.
              </p>
            </div>
          )}
        </>
      )}

      <SectionTitle>Orders in this period</SectionTitle>
      <div className="card px-4 py-2 text-[15px]">
        <Line label="Orders needed" value={String(report.ordersCount)} />
        <Line label="Their value" value={money(report.ordersValue, cur)} />
        <Line label="Delivered" value={String(report.delivered)} />
        {report.cancelled > 0 && <Line label="Cancelled" value={String(report.cancelled)} />}
        <Line label="Owed to you today (all orders)" value={money(report.owedNow, cur)} strong tone={report.owedNow > 0 ? 'bad' : undefined} />
      </div>

      {report.topCustomers.length > 0 && (
        <>
          <SectionTitle>Best customers</SectionTitle>
          <List>
            {report.topCustomers.map((c) => (
              <div key={c.name} className="flex items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{c.name}</span>
                  <span className="block text-sm text-muted">
                    {c.orders} order{c.orders === 1 ? '' : 's'}
                  </span>
                </span>
                <span className="num shrink-0 font-semibold">{money(c.value, cur)}</span>
              </div>
            ))}
          </List>
        </>
      )}

      <SectionTitle>Take the figures with you</SectionTitle>
      <div className="flex flex-wrap gap-2">
        <Button small variant="plain" icon={Download} onClick={downloadOrders}>
          Orders
        </Button>
        <Button small variant="plain" icon={Download} onClick={downloadPayments}>
          Payments
        </Button>
        <Button small variant="plain" icon={Download} onClick={downloadExpenses}>
          Expenses
        </Button>
      </div>
      <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
        <ChartColumn size={14} aria-hidden /> Each file opens in Excel or Google Sheets and covers {range.label}.
      </p>
    </>
  );
}
