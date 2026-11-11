// Pages both sections have: Customers, Expenses and Notes. Each takes the section it is shown in.
import { Check, Pin, Plus, Receipt, StickyNote, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSheets } from '../components/SheetHost';
import { Badge, Bars, Button, Choice, Empty, List, PageHead, PeriodPicker, SearchBox, SectionTitle, StatCard, cx, usePeriod } from '../components/ui';
import { useData } from '../data/DataContext';
import { inPeriod, showDate, showDay } from '../lib/dates';
import { money, sum } from '../lib/money';
import { customerLabel, customerSummary, type CustomerSummary } from '../lib/orders';
import { expensesByCategory } from '../lib/reports';
import { saleTotals } from '../lib/stock';
import type { Section } from '../lib/types';

// ---------- customers ----------

export function Customers({ section }: { section: Section }) {
  const d = useData();
  const sheets = useSheets();
  const cur = d.settings.currency;
  const [search, setSearch] = useState('');
  const [show, setShow] = useState<'active' | 'archived'>('active');
  const bake = section === 'bake';

  const rows = useMemo(() => {
    const list = d.customers.filter((c) => c.section === section);
    const saleT = new Map(d.sales.map((s) => [s.id, saleTotals(s, d.byRef.get(s.id))]));
    return list.map((c) => {
      const summary: CustomerSummary = bake
        ? customerSummary(c.id, d.orders, (id) => {
            const t = d.orderTotalsById.get(id);
            return { value: t?.value ?? 0, paid: t?.paid ?? 0, balance: t?.balance ?? 0, counts: d.orders.find((o) => o.id === id)?.stage !== 'Cancelled' };
          })
        : customerSummary(c.id, d.sales, (id) => ({ ...(saleT.get(id) ?? { value: 0, paid: 0, balance: 0 }), counts: true }));
      return { c, summary };
    });
  }, [d, section, bake]);

  const archivedCount = rows.filter((r) => r.c.archived).length;
  const q = search.trim().toLowerCase();
  const shown = rows
    .filter((r) => (show === 'archived' ? r.c.archived : !r.c.archived))
    .filter((r) => !q || `${r.c.name} ${r.c.phone ?? ''} ${r.c.place ?? ''}`.toLowerCase().includes(q))
    .sort((a, b) => b.summary.owed - a.summary.owed || a.c.name.localeCompare(b.c.name));
  const owed = sum(rows, (r) => r.summary.owed);

  return (
    <>
      <PageHead
        eyebrow={`${rows.length - archivedCount} customer${rows.length - archivedCount === 1 ? '' : 's'}`}
        title="Customers"
        action={
          <Button icon={Plus} onClick={() => sheets.open({ t: 'customer', section })}>
            New customer
          </Button>
        }
      />
      {owed > 0 && (
        <div className="mb-3">
          <StatCard label="Customers owe you" value={money(owed, cur)} sub="Those who owe are listed first" tone="warn" icon={Users} />
        </div>
      )}
      <div className="space-y-3">
        <SearchBox value={search} onChange={setSearch} placeholder="Search by name or phone" />
        {archivedCount > 0 && (
          <Choice
            value={show}
            onChange={setShow}
            options={[
              { value: 'active', label: 'Current' },
              { value: 'archived', label: 'Archived', count: archivedCount },
            ]}
          />
        )}
      </div>
      <div className="mt-4">
        {shown.length === 0 ? (
          <Empty icon={Users} title={q ? 'Nobody matches that search' : 'No customers yet'} body={q ? undefined : bake ? 'A customer is added for you when you save an order with their name.' : 'A customer is added for you when you save a sale with their name.'} />
        ) : (
          <List>
            {shown.map(({ c, summary }) => (
              <button key={c.id} type="button" className="row" onClick={() => sheets.open({ t: 'customerView', id: c.id })}>
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-soft font-semibold text-accent-dark">{c.name.trim().charAt(0).toUpperCase()}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{c.name}</span>
                  <span className="block truncate text-sm text-muted">
                    {summary.orders} {bake ? 'order' : 'sale'}
                    {summary.orders === 1 ? '' : 's'}
                    {c.phone ? ` · ${c.phone}` : ''}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="num block font-medium">{money(summary.value, cur)}</span>
                  {summary.owed > 0 && <span className="num block text-xs font-medium text-cherry">owes {money(summary.owed, cur)}</span>}
                </span>
              </button>
            ))}
          </List>
        )}
      </div>
    </>
  );
}

// ---------- expenses ----------

export function Expenses({ section }: { section: Section }) {
  const d = useData();
  const sheets = useSheets();
  const cur = d.settings.currency;
  const period = usePeriod('thisMonth');
  const [category, setCategory] = useState('');
  const breakdown = useMemo(() => expensesByCategory(d, section, period.period), [d, section, period.period]);
  const rows = useMemo(
    () =>
      d.expenses
        .filter((e) => e.section === section && inPeriod(e.date, period.period) && (!category || (e.category || 'Other') === category))
        .sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1)),
    [d.expenses, section, period.period, category],
  );
  const orderById = useMemo(() => new Map(d.orders.map((o) => [o.id, o])), [d.orders]);

  return (
    <>
      <PageHead
        eyebrow={period.period.label}
        title="Expenses"
        action={
          <Button icon={Plus} onClick={() => sheets.open({ t: 'expense', section })}>
            Add an expense
          </Button>
        }
      />
      <PeriodPicker state={period} />
      <div className="mt-4">
        <StatCard label="Total spent" value={money(breakdown.total, cur)} sub={`${period.period.label} · ${sum(breakdown.rows, (r) => r.count)} expenses`} icon={Receipt} />
      </div>

      {breakdown.rows.length > 0 && (
        <>
          <SectionTitle>Where it went</SectionTitle>
          <div className="card p-4">
            <Bars currency={cur} rows={breakdown.rows.map((r) => ({ label: r.category, amount: r.amount, share: r.share }))} />
          </div>
          <div className="mt-3">
            <Choice scroll value={category} onChange={setCategory} options={[{ value: '', label: 'All kinds' }, ...breakdown.rows.map((r) => ({ value: r.category, label: r.category }))]} />
          </div>
        </>
      )}

      <SectionTitle>{category || 'All expenses'}</SectionTitle>
      {rows.length === 0 ? (
        <Empty icon={Receipt} title="No expenses in this period" body="Tap the + button to add what you spend, as you spend it." />
      ) : (
        <List>
          {rows.map((e) => {
            const order = e.orderId ? orderById.get(e.orderId) : undefined;
            return (
              <button key={e.id} type="button" className="row" onClick={() => sheets.open({ t: 'expense', section, id: e.id })}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {e.description}
                    {e.qtyNote ? <span className="font-normal text-muted"> · {e.qtyNote}</span> : null}
                  </span>
                  <span className="block truncate text-sm text-muted">
                    {showDate(e.date)} · {e.ingredient && e.ingredient !== e.description ? `${e.ingredient} · ` : ''}
                    {e.category}
                    {e.paidTo ? ` · ${e.paidTo}` : ''}
                    {order ? ` · for ${customerLabel(order, d.customersById)}` : ''}
                  </span>
                </span>
                <span className="num shrink-0 font-semibold">{money(e.amount, cur)}</span>
              </button>
            );
          })}
        </List>
      )}
    </>
  );
}

// ---------- notes ----------

export function Notes({ section }: { section: Section }) {
  const d = useData();
  const sheets = useSheets();
  const [show, setShow] = useState<'open' | 'done'>('open');
  const all = d.notes.filter((n) => n.section === section);
  const doneCount = all.filter((n) => n.done).length;
  const rows = all
    .filter((n) => (show === 'done' ? n.done : !n.done))
    .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || (a.date && b.date ? (a.date < b.date ? -1 : 1) : a.date ? -1 : b.date ? 1 : b.updatedAt - a.updatedAt));
  const toggle = (id: string, done: boolean) => d.actions.patchNote(id, { done }).catch(() => {});

  return (
    <>
      <PageHead
        eyebrow="Ideas, reminders and future bookings"
        title="Notes"
        action={
          <Button icon={Plus} onClick={() => sheets.open({ t: 'note', section })}>
            New note
          </Button>
        }
      />
      {doneCount > 0 && (
        <div className="mb-3">
          <Choice
            value={show}
            onChange={setShow}
            options={[
              { value: 'open', label: 'To do' },
              { value: 'done', label: 'Done', count: doneCount },
            ]}
          />
        </div>
      )}
      {rows.length === 0 ? (
        <Empty
          icon={StickyNote}
          title={show === 'done' ? 'Nothing marked done yet' : 'No notes yet'}
          body={show === 'done' ? undefined : 'Write down anything worth remembering: an enquiry to follow up, an idea to try, something to buy.'}
          action={
            show === 'open' ? (
              <Button icon={Plus} onClick={() => sheets.open({ t: 'note', section })}>
                New note
              </Button>
            ) : undefined
          }
        />
      ) : (
        <List>
          {rows.map((n) => (
            <div key={n.id} className="flex items-stretch">
              <button type="button" aria-label={n.done ? 'Mark as not done' : 'Mark as done'} onClick={() => toggle(n.id, !n.done)} className="flex w-14 shrink-0 items-center justify-center">
                <span className={cx('flex h-6 w-6 items-center justify-center rounded-full border-2', n.done ? 'border-leaf bg-leaf text-white' : 'border-faint')}>{n.done && <Check size={14} strokeWidth={3} aria-hidden />}</span>
              </button>
              <button type="button" className="min-w-0 flex-1 py-3 pr-4 text-left" onClick={() => sheets.open({ t: 'note', section, id: n.id })}>
                <span className={cx('flex items-center gap-1.5 font-medium', n.done && 'text-muted line-through')}>
                  {n.pinned && <Pin size={14} className="shrink-0 text-accent-dark" aria-hidden />}
                  <span className="truncate">{n.title}</span>
                </span>
                {n.body && <span className="mt-0.5 line-clamp-2 block text-sm whitespace-pre-wrap text-muted">{n.body}</span>}
                {n.date && (
                  <span className="mt-1 block">
                    <Badge tone={!n.done && n.date < d.today ? 'red' : 'pink'}>For {showDay(n.date)}</Badge>
                  </span>
                )}
              </button>
            </div>
          ))}
        </List>
      )}
    </>
  );
}
