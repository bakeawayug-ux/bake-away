// Bake Away pages: Overview and Orders.
import { Banknote, CakeSlice, CircleCheck, Clock, Gift, HandCoins, Plus, Receipt, StickyNote, TriangleAlert, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { MonthChart, OrderRow } from '../components/rows';
import { useSheets } from '../components/SheetHost';
import { Button, Choice, Empty, List, PageHead, SearchBox, SectionTitle, StatCard } from '../components/ui';
import { useData } from '../data/DataContext';
import { addDays, daysBetween, longToday, presetPeriod, showDay } from '../lib/dates';
import { money } from '../lib/money';
import { customerLabel, itemsText } from '../lib/orders';
import { bakeReport, monthBars } from '../lib/reports';
import { specialDayText } from '../sheets/shared';

/** Days until the next time this MM-DD comes round (0 = today). */
function daysToSpecial(mmdd: string, today: string): number {
  const year = Number(today.slice(0, 4));
  let next = `${year}-${mmdd}`;
  if (next < today) next = `${year + 1}-${mmdd}`;
  return daysBetween(today, next);
}

export function BakeOverview() {
  const d = useData();
  const sheets = useSheets();
  const cur = d.settings.currency;
  const month = useMemo(() => presetPeriod('thisMonth', d.today), [d.today]);
  const report = useMemo(() => bakeReport(d, month, d.today, (o) => customerLabel(o, d.customersById)), [d, month]);
  const bars = useMemo(() => monthBars(d, 'bake', 6, d.today), [d]);

  const open = useMemo(() => d.orders.filter((o) => d.orderTotalsById.get(o.id)?.open).sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1)), [d.orders, d.orderTotalsById]);
  const late = open.filter((o) => d.orderTotalsById.get(o.id)?.late);
  const coming = open.filter((o) => !d.orderTotalsById.get(o.id)?.late);
  const unpaidDelivered = d.orders.filter((o) => o.stage === 'Delivered' && (d.orderTotalsById.get(o.id)?.balance ?? 0) > 0);
  const soon = addDays(d.today, 3);
  const dueNotes = d.notes.filter((n) => n.section === 'bake' && !n.done && n.date && n.date <= soon).sort((a, b) => (a.date! < b.date! ? -1 : 1));
  const specials = d.customers
    .filter((c) => c.section === 'bake' && !c.archived && c.specialDay)
    .map((c) => ({ c, days: daysToSpecial(c.specialDay!, d.today) }))
    .filter((x) => x.days <= 14)
    .sort((a, b) => a.days - b.days);
  const attention = late.length + unpaidDelivered.length + dueNotes.length + specials.length;
  const empty = d.ready && d.orders.length === 0 && d.expenses.filter((e) => e.section === 'bake').length === 0;

  return (
    <>
      <PageHead eyebrow={longToday()} title="Overview" />
      {empty && (
        <div className="mb-5">
          <Empty
            icon={CakeSlice}
            title={`Welcome, ${d.settings.ownerName}`}
            body="Start by saving your first order. Everything else (payments, costs, what you are owed) builds from the orders and expenses you record."
            action={
              <Button icon={Plus} onClick={() => sheets.open({ t: 'order' })}>
                New order
              </Button>
            }
          />
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Money in" value={money(report.moneyIn, cur)} sub={month.label} icon={Banknote} tone="good" />
        <StatCard label="Spent" value={money(report.spent, cur)} sub={month.label} icon={Receipt} />
        <StatCard label="Left over" value={money(report.leftOver, cur)} sub="Money in less spent" icon={Wallet} tone={report.leftOver >= 0 ? 'good' : 'warn'} />
        <StatCard label="Owed to you" value={money(report.owedNow, cur)} sub="On all orders" icon={HandCoins} tone={report.owedNow > 0 ? 'warn' : 'plain'} />
      </div>

      {attention > 0 && (
        <>
          <SectionTitle>Needs your attention</SectionTitle>
          <List>
            {late.map((o) => (
              <button key={o.id} type="button" className="row" onClick={() => sheets.open({ t: 'orderView', id: o.id })}>
                <TriangleAlert size={20} className="shrink-0 text-cherry" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {customerLabel(o, d.customersById)}: {itemsText(o)}
                  </span>
                  <span className="block text-sm text-cherry">
                    Was needed {showDay(o.dueDate)} and is still marked {o.stage.toLowerCase()}
                  </span>
                </span>
              </button>
            ))}
            {unpaidDelivered.map((o) => (
              <button key={o.id} type="button" className="row" onClick={() => sheets.open({ t: 'orderView', id: o.id })}>
                <HandCoins size={20} className="shrink-0 text-amber" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{customerLabel(o, d.customersById)} has not finished paying</span>
                  <span className="block text-sm text-muted">
                    Delivered {showDay(o.dueDate)} · balance {money(d.orderTotalsById.get(o.id)?.balance, cur)}
                  </span>
                </span>
              </button>
            ))}
            {dueNotes.map((n) => (
              <button key={n.id} type="button" className="row" onClick={() => sheets.open({ t: 'note', section: 'bake', id: n.id })}>
                <StickyNote size={20} className="shrink-0 text-accent-dark" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{n.title}</span>
                  <span className="block text-sm text-muted">Note for {showDay(n.date)}</span>
                </span>
              </button>
            ))}
            {specials.map(({ c, days }) => (
              <button key={c.id} type="button" className="row" onClick={() => sheets.open({ t: 'customerView', id: c.id })}>
                <Gift size={20} className="shrink-0 text-accent-dark" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {c.name}: {c.specialDayNote || 'a day to remember'}
                  </span>
                  <span className="block text-sm text-muted">
                    {specialDayText(c.specialDay)} · {days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`}
                  </span>
                </span>
              </button>
            ))}
          </List>
        </>
      )}

      <SectionTitle
        action={
          <Link to="/bake/orders" className="text-sm font-semibold text-accent-dark">
            All orders
          </Link>
        }
      >
        Orders coming up
      </SectionTitle>
      {coming.length === 0 ? (
        <p className="card flex items-center gap-2 px-4 py-4 text-sm text-muted">
          <CircleCheck size={18} className="text-leaf" aria-hidden /> No orders waiting to be baked or handed over.
        </p>
      ) : (
        <List>
          {coming.slice(0, 6).map((o) => (
            <OrderRow key={o.id} order={o} />
          ))}
        </List>
      )}
      {coming.length > 6 && (
        <p className="mt-2 flex items-center gap-1.5 text-sm text-muted">
          <Clock size={14} aria-hidden /> and {coming.length - 6} more after these
        </p>
      )}

      <SectionTitle>Last six months</SectionTitle>
      <MonthChart bars={bars} inLabel="Money in" outLabel="Spent" />
    </>
  );
}

type OrderFilter = 'upcoming' | 'unpaid' | 'delivered' | 'all';

export function Orders() {
  const d = useData();
  const sheets = useSheets();
  const [filter, setFilter] = useState<OrderFilter>('upcoming');
  const [search, setSearch] = useState('');

  const groups = useMemo(() => {
    const t = (id: string) => d.orderTotalsById.get(id);
    return {
      upcoming: d.orders.filter((o) => t(o.id)?.open),
      unpaid: d.orders.filter((o) => (t(o.id)?.balance ?? 0) > 0),
      delivered: d.orders.filter((o) => o.stage === 'Delivered'),
      all: d.orders,
    };
  }, [d.orders, d.orderTotalsById]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = groups[filter].filter((o) => !q || `${customerLabel(o, d.customersById)} ${itemsText(o)} ${o.number} ${o.notes ?? ''}`.toLowerCase().includes(q));
    const up = filter === 'upcoming';
    return [...list].sort((a, b) => (a.dueDate === b.dueDate ? b.createdAt - a.createdAt : (a.dueDate < b.dueDate ? -1 : 1) * (up ? 1 : -1)));
  }, [groups, filter, search, d.customersById]);

  return (
    <>
      <PageHead
        eyebrow={`${d.orders.length} order${d.orders.length === 1 ? '' : 's'} in all`}
        title="Orders"
        action={
          <Button icon={Plus} onClick={() => sheets.open({ t: 'order' })}>
            New order
          </Button>
        }
      />
      <div className="space-y-3">
        <SearchBox value={search} onChange={setSearch} placeholder="Search by customer or what was ordered" />
        <Choice<OrderFilter>
          scroll
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'upcoming', label: 'To do', count: groups.upcoming.length },
            { value: 'unpaid', label: 'Not fully paid', count: groups.unpaid.length },
            { value: 'delivered', label: 'Delivered' },
            { value: 'all', label: 'All' },
          ]}
        />
      </div>
      <div className="mt-4">
        {rows.length === 0 ? (
          <Empty
            icon={CakeSlice}
            title={search ? 'Nothing matches that search' : filter === 'upcoming' ? 'No orders waiting' : filter === 'unpaid' ? 'Nobody owes you on an order' : 'No orders here yet'}
            body={search ? undefined : 'Tap the + button to save a new order.'}
          />
        ) : (
          <List>
            {rows.map((o) => (
              <OrderRow key={o.id} order={o} />
            ))}
          </List>
        )}
      </div>
    </>
  );
}
