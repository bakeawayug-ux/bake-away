// Rows and small charts used on more than one page.
import type { MonthBar } from '../lib/reports';
import { useData } from '../data/DataContext';
import { dayParts, relativeDay, showDay } from '../lib/dates';
import { money, shortMoney } from '../lib/money';
import { customerLabel, itemsText } from '../lib/orders';
import { linesText, saleTotals } from '../lib/stock';
import type { Order, Sale } from '../lib/types';
import { stageTone } from '../sheets/bake';
import { useSheets } from './SheetHost';
import { Badge, cx, payTone } from './ui';

export function DateBlock({ date, late }: { date: string; late?: boolean }) {
  const p = dayParts(date);
  return (
    <span className={cx('flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl', late ? 'bg-cherry-soft text-cherry' : 'bg-accent-soft text-accent-dark')}>
      <span className="num text-lg leading-none font-semibold">{p.day}</span>
      <span className="text-[11px] leading-tight font-medium uppercase">{p.month}</span>
    </span>
  );
}

export function OrderRow({ order, hideMoney }: { order: Order; hideMoney?: boolean }) {
  const d = useData();
  const sheets = useSheets();
  const t = d.orderTotalsById.get(order.id);
  if (!t) return null;
  return (
    <button type="button" className="row" onClick={() => sheets.open({ t: 'orderView', id: order.id })}>
      <DateBlock date={order.dueDate} late={t.late} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{customerLabel(order, d.customersById)}</span>
        <span className="block truncate text-sm text-muted">{itemsText(order) || order.number}</span>
        <span className="mt-1 flex flex-wrap items-center gap-1.5">
          <Badge tone={t.late ? 'red' : stageTone(order.stage)}>{t.late ? `Late · ${order.stage}` : order.stage}</Badge>
          {order.stage !== 'Cancelled' && !hideMoney && <Badge tone={payTone(t.payStatus)}>{t.payStatus}</Badge>}
          {t.open && !t.late && <span className="text-xs text-muted">{relativeDay(order.dueDate, d.today)}{order.dueTime ? `, ${order.dueTime}` : ''}</span>}
        </span>
      </span>
      {!hideMoney && (
        <span className="shrink-0 text-right">
          <span className="num block font-semibold">{money(t.value, d.settings.currency)}</span>
          {t.balance > 0 && <span className="num block text-xs font-medium text-cherry">owes {shortMoney(t.balance)}</span>}
        </span>
      )}
    </button>
  );
}

export function SaleRow({ sale }: { sale: Sale }) {
  const d = useData();
  const sheets = useSheets();
  const t = saleTotals(sale, d.byRef.get(sale.id));
  return (
    <button type="button" className="row" onClick={() => sheets.open({ t: 'saleView', id: sale.id })}>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{linesText(sale.lines, (id) => d.itemsById.get(id)?.name ?? 'Item')}</span>
        <span className="block truncate text-sm text-muted">
          {showDay(sale.date)} · {customerLabel(sale, d.customersById)} · {sale.number}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="num block font-semibold">{money(t.value, d.settings.currency)}</span>
        {t.balance > 0 ? <span className="num block text-xs font-medium text-cherry">owes {shortMoney(t.balance)}</span> : <Badge tone="green">Paid</Badge>}
      </span>
    </button>
  );
}

/** Money in and out for the last few months, as pairs of bars. */
export function MonthChart({ bars, inLabel, outLabel }: { bars: MonthBar[]; inLabel: string; outLabel: string }) {
  const max = Math.max(1, ...bars.map((b) => Math.max(b.in, b.out)));
  const h = (v: number) => `${v > 0 ? Math.max(3, Math.round((v / max) * 100)) : 0}%`;
  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center gap-4 text-xs font-medium text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-accent" /> {inLabel}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-butter" /> {outLabel}
        </span>
      </div>
      <div className="flex h-36 items-end gap-2" role="img" aria-label={`${inLabel} and ${outLabel} for the last ${bars.length} months`}>
        {bars.map((b) => (
          <div key={b.key} className="flex h-full min-w-0 flex-1 flex-col">
            <div className="flex min-h-0 flex-1 items-end justify-center gap-1">
              <div className="w-1/2 max-w-6 rounded-t bg-accent" style={{ height: h(b.in) }} title={`${inLabel}: ${money(b.in)}`} />
              <div className="w-1/2 max-w-6 rounded-t bg-butter" style={{ height: h(b.out) }} title={`${outLabel}: ${money(b.out)}`} />
            </div>
            <div className="num mt-1 truncate text-center text-[10px] text-muted">{b.in || b.out ? shortMoney(b.in) : ''}</div>
            <div className="text-center text-xs font-medium text-muted">{b.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
