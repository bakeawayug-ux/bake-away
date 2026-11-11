// Bake Away windows: the order form and the order page.
import { MessageCircle, Pencil, Phone, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSheets } from '../components/SheetHost';
import { Badge, Button, Choice, DateInput, Field, FormError, IconButton, Line, List, MoneyInput, QtyInput, Select, Sheet, SheetButtons, TextArea, TextInput, payTone, useConfirm, useNotice, useSaver } from '../components/ui';
import { useData } from '../data/DataContext';
import { relativeDay, showDate, showDay } from '../lib/dates';
import { money, num } from '../lib/money';
import { customerLabel, itemsText, orderProfit, orderValue, sameName } from '../lib/orders';
import { ORDER_STAGES, SUGGESTED_PRODUCTS, type OrderItem, type OrderStage } from '../lib/types';
import { telLink, waLink } from '../lib/whatsapp';
import { PaymentsBlock } from './shared';

const BLANK_ITEM: OrderItem = { what: '', qty: 1, price: 0 };

export function OrderForm({ id, customerName, onClose }: { id?: string; customerName?: string; onClose: () => void }) {
  const d = useData();
  const notify = useNotice();
  const sheets = useSheets();
  const saver = useSaver();
  const old = id ? d.orders.find((o) => o.id === id) : undefined;
  const cur = d.settings.currency;
  const known = useMemo(() => d.customers.filter((c) => c.section === 'bake' && !c.archived).sort((a, b) => a.name.localeCompare(b.name)), [d.customers]);
  const startName = old ? customerLabel(old, d.customersById) : (customerName ?? '');
  const [f, setF] = useState({
    customerName: startName === 'Walk-in customer' ? '' : startName,
    phone: old?.phone ?? known.find((c) => sameName(c.name, customerName))?.phone ?? '',
    date: old?.date ?? d.today,
    dueDate: old?.dueDate ?? '',
    dueTime: old?.dueTime ?? '',
    items: old?.items?.length ? old.items.map((i) => ({ ...i })) : [{ ...BLANK_ITEM }],
    delivery: old?.delivery ?? ('Pick up' as const),
    place: old?.place ?? '',
    deliveryFee: old?.deliveryFee ?? 0,
    discount: old?.discount ?? 0,
    stage: old?.stage ?? ('Booked' as OrderStage),
    notes: old?.notes ?? '',
  });
  const [deposit, setDeposit] = useState(0);
  const [method, setMethod] = useState(d.settings.methods[0] ?? 'Cash');
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const setItem = (i: number, patch: Partial<OrderItem>) => set('items', f.items.map((it, n) => (n === i ? { ...it, ...patch } : it)));
  const products = useMemo(() => d.products.filter((p) => !p.archived).sort((a, b) => a.name.localeCompare(b.name)), [d.products]);
  const suggestions = products.length ? products.map((p) => p.name) : SUGGESTED_PRODUCTS;
  /** Typing or picking a product from the list links the item to it and fills its usual price. */
  const onWhat = (i: number, what: string) => {
    const match = products.find((p) => sameName(p.name, what));
    const it = f.items[i];
    setItem(i, { what, productId: match?.id ?? '', price: match && !it.price ? match.price : it.price });
  };
  const total = orderValue(f);

  const onName = (name: string) => {
    const match = known.find((c) => sameName(c.name, name));
    setF((x) => ({ ...x, customerName: name, phone: match?.phone && !x.phone ? match.phone : x.phone, place: match?.place && !x.place ? match.place : x.place }));
  };

  const save = () =>
    saver.run(
      () => d.actions.saveOrder(f, id, { amount: deposit, method }),
      () => {
        notify(id ? 'Order updated' : 'Order saved');
        onClose();
      },
    );

  return (
    <Sheet
      title={id ? `Edit order ${old?.number ?? ''}` : 'New order'}
      onClose={onClose}
      footer={
        <>
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-muted">Order total</span>
            <span className="num text-lg font-semibold">{money(total, cur)}</span>
          </div>
          <SheetButtons>
            <Button variant="plain" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={save} busy={saver.busy}>
              Save order
            </Button>
          </SheetButtons>
        </>
      }
    >
      <FormError message={saver.error} />
      <div className="space-y-3">
        <Field label="Customer" hint="Type a new name or pick one you have served before.">
          <TextInput list="bake-customers" value={f.customerName} onChange={(e) => onName(e.target.value)} placeholder="Customer's name" autoCapitalize="words" autoFocus={!id && !customerName} />
          <datalist id="bake-customers">
            {known.map((c) => (
              <option key={c.id} value={c.name} />
            ))}
          </datalist>
        </Field>
        <Field label="Phone (optional)">
          <TextInput type="tel" inputMode="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="07xx xxx xxx" />
        </Field>

        <div>
          <span className="label">What they ordered</span>
          <div className="space-y-2">
            {f.items.map((it, i) => (
              <div key={i} className="card p-3">
                <div className="flex gap-1">
                  <TextInput list="bake-products" value={it.what} onChange={(e) => onWhat(i, e.target.value)} placeholder="e.g. Birthday cake 2 kg" autoCapitalize="sentences" aria-label="Item" />
                  {f.items.length > 1 && <IconButton icon={Trash2} label="Remove this item" onClick={() => set('items', f.items.filter((_, n) => n !== i))} />}
                </div>
                <div className="mt-2 grid grid-cols-[5.5rem_1fr] gap-2">
                  <Field label="How many">
                    <QtyInput value={it.qty} onChange={(v) => setItem(i, { qty: v })} />
                  </Field>
                  <Field label={`Price each (${cur})`}>
                    <MoneyInput value={it.price} onChange={(v) => setItem(i, { price: v })} />
                  </Field>
                </div>
              </div>
            ))}
          </div>
          <datalist id="bake-products">
            {suggestions.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
          <Button small variant="soft" icon={Plus} className="mt-2" onClick={() => set('items', [...f.items, { ...BLANK_ITEM }])}>
            Add another item
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Needed on">
            <DateInput value={f.dueDate} onChange={(v) => set('dueDate', v)} />
          </Field>
          <Field label="Time (optional)">
            <input type="time" className="input" value={f.dueTime} onChange={(e) => set('dueTime', e.target.value)} />
          </Field>
        </div>
        <Field label="Order taken on">
          <DateInput value={f.date} onChange={(v) => set('date', v)} max={d.today} />
        </Field>

        <div>
          <span className="label">How it reaches the customer</span>
          <Choice options={['Pick up', 'Delivery'] as const} value={f.delivery} onChange={(v) => set('delivery', v)} />
        </div>
        {f.delivery === 'Delivery' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Deliver to">
              <TextInput value={f.place} onChange={(e) => set('place', e.target.value)} placeholder="Place" autoCapitalize="words" />
            </Field>
            <Field label="Delivery charge">
              <MoneyInput value={f.deliveryFee} onChange={(v) => set('deliveryFee', v)} />
            </Field>
          </div>
        )}
        <Field label={`Discount (${cur}, optional)`}>
          <MoneyInput value={f.discount} onChange={(v) => set('discount', v)} />
        </Field>
        <Field label="Notes (optional)" hint="Flavour, colours, the message on the cake, allergies.">
          <TextArea value={f.notes} onChange={(e) => set('notes', e.target.value)} autoCapitalize="sentences" />
        </Field>

        {!id && (
          <div className="card bg-butter-soft p-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Deposit paid now">
                <MoneyInput value={deposit} onChange={setDeposit} />
              </Field>
              <Field label="How">
                <Select options={d.settings.methods} value={method} onChange={(e) => setMethod(e.target.value)} />
              </Field>
            </div>
            <div className="mt-2 flex gap-2">
              <Button small variant="plain" onClick={() => setDeposit(Math.round(total / 2))} disabled={!total}>
                Half
              </Button>
              <Button small variant="plain" onClick={() => setDeposit(total)} disabled={!total}>
                Paid in full
              </Button>
              <Button small variant="plain" onClick={() => setDeposit(0)} disabled={!deposit}>
                None
              </Button>
            </div>
          </div>
        )}
        {id && (
          <p className="text-sm text-muted">
            Payments are recorded on the order's page, not here.{' '}
            <button type="button" className="font-semibold text-accent-dark underline" onClick={() => sheets.swap({ t: 'orderView', id })}>
              Open the order
            </button>
          </p>
        )}
      </div>
    </Sheet>
  );
}

const STAGE_TONE = { Booked: 'pink', Ready: 'amber', Delivered: 'green', Cancelled: 'grey' } as const;
export const stageTone = (s: OrderStage) => STAGE_TONE[s] ?? 'grey';

export function OrderView({ id, onClose }: { id: string; onClose: () => void }) {
  const d = useData();
  const sheets = useSheets();
  const confirm = useConfirm();
  const notify = useNotice();
  const o = d.orders.find((x) => x.id === id);
  const t = d.orderTotalsById.get(id);
  const cur = d.settings.currency;
  if (!o || !t) return null;
  const name = customerLabel(o, d.customersById);
  const phone = o.phone || (o.customerId && d.customersById.get(o.customerId)?.phone) || '';
  const costs = d.expenses.filter((e) => e.orderId === id);
  const profit = orderProfit(o, d.expenses);
  const when = `${showDay(o.dueDate)}${o.dueTime ? ` at ${o.dueTime}` : ''}`;

  const detailsMessage = [
    `Hello ${name}, this is ${d.settings.bakeName}. Your order ${o.number}:`,
    ...o.items.map((i) => `• ${num(i.qty) === 1 ? '' : `${num(i.qty)} × `}${i.what}`),
    `${o.delivery === 'Delivery' ? 'Delivery' : 'Pick up'}: ${when}${o.delivery === 'Delivery' && o.place ? `, ${o.place}` : ''}`,
    `Total: ${money(t.value, cur)}`,
    t.paid > 0 ? `Paid: ${money(t.paid, cur)}` : '',
    t.balance > 0 ? `Balance: ${money(t.balance, cur)}` : 'Fully paid. Thank you!',
  ]
    .filter(Boolean)
    .join('\n');
  const reminderMessage = `Hello ${name}, this is ${d.settings.bakeName}. A gentle reminder that the balance on your order ${o.number} (${itemsText(o)}) is ${money(t.balance, cur)}. Thank you!`;

  const setStage = async (stage: OrderStage) => {
    if (stage === o.stage) return;
    if (stage === 'Cancelled' && !(await confirm({ title: 'Cancel this order?', body: t.paid > 0 ? `${money(t.paid, cur)} has been paid on it. The payments stay recorded; delete them on this page if you give the money back.` : 'It will no longer count as owed or as an order to bake.', yes: 'Cancel order', danger: true }))) return;
    try {
      await d.actions.setOrderStage(id, stage);
      notify(stage === 'Cancelled' ? 'Order cancelled' : `Marked ${stage.toLowerCase()}`);
    } catch (e) {
      notify((e as Error).message, 'bad');
    }
  };
  const remove = async () => {
    const body = `${name}, ${itemsText(o)}.${t.paid > 0 ? ` Its payments (${money(t.paid, cur)}) will be deleted with it.` : ''}${costs.length ? ' Costs recorded for it stay as ordinary expenses.' : ''} If the customer simply changed their mind, use Cancelled instead so the history is kept.`;
    if (!(await confirm({ title: `Delete order ${o.number}?`, body, yes: 'Delete order', danger: true }))) return;
    try {
      await d.actions.deleteOrder(id);
      notify('Order deleted');
      onClose();
    } catch (e) {
      notify((e as Error).message, 'bad');
    }
  };

  return (
    <Sheet
      title={`Order ${o.number}`}
      onClose={onClose}
      footer={
        <SheetButtons>
          <Button variant="plain" icon={Pencil} onClick={() => sheets.open({ t: 'order', id })}>
            Edit
          </Button>
          {t.balance > 0 ? (
            <Button onClick={() => sheets.open({ t: 'payment', kind: 'order', refId: id })}>Record payment</Button>
          ) : o.stage === 'Booked' || o.stage === 'Ready' ? (
            <Button onClick={() => setStage('Delivered')}>Mark delivered</Button>
          ) : (
            <Button variant="soft" onClick={onClose}>
              Done
            </Button>
          )}
        </SheetButtons>
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xl font-semibold">{name}</p>
          <p className="text-muted">
            {when} · <span className={t.late ? 'font-semibold text-cherry' : ''}>{relativeDay(o.dueDate, d.today)}</span>
          </p>
          <p className="text-sm text-muted">
            {o.delivery}
            {o.delivery === 'Delivery' && o.place ? ` to ${o.place}` : ''} · taken {showDate(o.date)}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Badge tone={stageTone(o.stage)}>{t.late ? 'Late' : o.stage}</Badge>
          {o.stage !== 'Cancelled' && <Badge tone={payTone(t.payStatus)}>{t.payStatus}</Badge>}
        </div>
      </div>

      {phone && (
        <div className="mt-3 flex gap-2 [&>*]:flex-1">
          <a className="btn btn-plain btn-sm" href={telLink(phone)}>
            <Phone size={16} aria-hidden /> Call
          </a>
          <a className="btn btn-plain btn-sm" href={waLink(phone, detailsMessage)} target="_blank" rel="noreferrer">
            <MessageCircle size={16} aria-hidden /> Send details
          </a>
          {t.balance > 0 && (
            <a className="btn btn-plain btn-sm" href={waLink(phone, reminderMessage)} target="_blank" rel="noreferrer">
              <MessageCircle size={16} aria-hidden /> Remind
            </a>
          )}
        </div>
      )}

      <div className="card mt-4 p-4 text-[15px]">
        {o.items.map((i, n) => (
          <Line key={n} label={`${num(i.qty) === 1 ? '' : `${num(i.qty)} × `}${i.what}`} value={money(num(i.qty) * num(i.price), cur)} />
        ))}
        {num(o.deliveryFee) > 0 && <Line label="Delivery" value={money(o.deliveryFee, cur)} />}
        {num(o.discount) > 0 && <Line label="Discount" value={`-${money(o.discount, cur)}`} />}
        <div className="mt-1 border-t border-line pt-1">
          <Line label="Total" value={money(t.value, cur)} strong />
          <Line label="Paid" value={money(t.paid, cur)} tone="good" />
          {o.stage !== 'Cancelled' && <Line label="Balance" value={money(t.balance, cur)} strong tone={t.balance > 0 ? 'bad' : undefined} />}
          {t.overpaid > 0 && <Line label="Paid over the total" value={money(t.overpaid, cur)} tone="muted" />}
        </div>
      </div>

      {o.notes && <p className="mt-3 rounded-xl bg-butter-soft px-4 py-3 text-[15px] whitespace-pre-wrap">{o.notes}</p>}

      <div className="mt-5">
        <span className="label">Where the order has reached</span>
        <Choice options={ORDER_STAGES} value={o.stage} onChange={setStage} />
      </div>

      <div className="mt-5">
        <PaymentsBlock kind="order" refId={id} />
      </div>

      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-semibold">What this order cost you</h3>
          <Button small variant="soft" icon={Plus} onClick={() => sheets.open({ t: 'expense', section: 'bake', orderId: id })}>
            Add a cost
          </Button>
        </div>
        {costs.length === 0 ? (
          <p className="card px-4 py-3 text-sm text-muted">No costs linked yet. Add the ingredients, labour or transport for this order to see what it left you.</p>
        ) : (
          <>
            <List>
              {costs.map((e) => (
                <button key={e.id} type="button" className="row" onClick={() => sheets.open({ t: 'expense', section: 'bake', id: e.id })}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{e.description}</p>
                    <p className="text-sm text-muted">
                      {e.category} · {showDate(e.date)}
                    </p>
                  </div>
                  <span className="num shrink-0">{money(e.amount, cur)}</span>
                </button>
              ))}
            </List>
            <div className="card mt-2 px-4 py-2 text-[15px]">
              <Line label="Costs" value={money(profit.costs, cur)} />
              <Line label="Left from this order" value={money(profit.profit, cur)} strong tone={profit.profit >= 0 ? 'good' : 'bad'} />
            </div>
          </>
        )}
      </div>

      <div className="mt-6">
        <Button small variant="plain" icon={Trash2} onClick={remove}>
          Delete order
        </Button>
      </div>
    </Sheet>
  );
}

// ---------- products ----------

export function ProductForm({ id, onClose }: { id?: string; onClose: () => void }) {
  const d = useData();
  const notify = useNotice();
  const confirm = useConfirm();
  const saver = useSaver();
  const old = id ? d.products.find((p) => p.id === id) : undefined;
  const cur = d.settings.currency;
  const [f, setF] = useState({ name: old?.name ?? '', price: old?.price ?? 0, cost: old?.cost ?? 0 });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const left = f.price - f.cost;
  const save = () =>
    saver.run(
      () => d.actions.saveProduct(f, id),
      () => {
        notify(id ? 'Product updated' : 'Product saved');
        onClose();
      },
    );
  const remove = async () => {
    if (!id) return;
    if (!(await confirm({ title: `Delete ${f.name}?`, body: 'Orders already saved keep their items and prices. The product just leaves the list.', yes: 'Delete product', danger: true }))) return;
    saver.run(
      () => d.actions.deleteProduct(id),
      () => {
        notify('Product deleted');
        onClose();
      },
    );
  };
  return (
    <Sheet
      title={id ? 'Edit product' : 'New product'}
      onClose={onClose}
      footer={
        <SheetButtons>
          {id ? (
            <Button variant="danger" icon={Trash2} onClick={remove} disabled={saver.busy}>
              Delete
            </Button>
          ) : (
            <Button variant="plain" onClick={onClose}>
              Cancel
            </Button>
          )}
          <Button onClick={save} busy={saver.busy}>
            Save product
          </Button>
        </SheetButtons>
      }
    >
      <FormError message={saver.error} />
      <div className="space-y-3">
        <Field label="Product name">
          <TextInput value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Birthday cake 2 kg" autoCapitalize="sentences" autoFocus={!id} />
        </Field>
        <Field label={`Usual selling price (${cur})`} hint="Filled in for you when you pick this product on an order. You can still change it there.">
          <MoneyInput value={f.price} onChange={(v) => set('price', v)} />
        </Field>
        <Field label={`Usual cost to make one (${cur})`} hint="Your best estimate of the ingredients, packaging and labour that go into one. The profit page uses it.">
          <MoneyInput value={f.cost} onChange={(v) => set('cost', v)} />
        </Field>
        {f.price > 0 && f.cost > 0 && (
          <div className="card px-4 py-2 text-[15px]">
            <Line label="You keep on each one" value={money(left, cur)} strong tone={left >= 0 ? 'good' : 'bad'} />
            <Line label="Out of every 100 shillings" value={`${Math.round((left / f.price) * 100)} is yours`} />
          </div>
        )}
      </div>
    </Sheet>
  );
}
