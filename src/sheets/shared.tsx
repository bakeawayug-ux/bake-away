// Windows used by both sections: payments, expenses, customers, notes.
import { Archive, ArchiveRestore, Banknote, CakeSlice, MessageCircle, Pencil, Phone, Plus, ShoppingCart, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSheets } from '../components/SheetHost';
import { Badge, Button, DateInput, Empty, Field, FormError, IconButton, Line, List, MoneyInput, Select, Sheet, SheetButtons, TextArea, TextInput, payTone, useConfirm, useNotice, useSaver } from '../components/ui';
import { useData } from '../data/DataContext';
import { showDate, showDay } from '../lib/dates';
import { money } from '../lib/money';
import { customerLabel, customerSummary, itemsText } from '../lib/orders';
import { isIngredientCategory } from '../lib/reports';
import { linesText, purchaseTotals, saleTotals } from '../lib/stock';
import type { Payment, PaymentKind, Section } from '../lib/types';
import { telLink, waLink } from '../lib/whatsapp';

// ---------- payments ----------

/** What a payment belongs to, with its title and balance, whichever kind it is. */
export function useOwing(kind: PaymentKind, refId: string) {
  const d = useData();
  return useMemo(() => {
    const pays = d.byRef.get(refId) ?? [];
    if (kind === 'order') {
      const o = d.orders.find((x) => x.id === refId);
      if (!o) return null;
      const t = d.orderTotalsById.get(o.id);
      return { title: `${customerLabel(o, d.customersById)} · ${o.number}`, sub: itemsText(o), value: t?.value ?? 0, paid: t?.paid ?? 0, balance: t?.balance ?? 0, pays, closed: o.stage === 'Cancelled' };
    }
    if (kind === 'sale') {
      const s = d.sales.find((x) => x.id === refId);
      if (!s) return null;
      const t = saleTotals(s, pays);
      return { title: `${customerLabel(s, d.customersById)} · ${s.number}`, sub: linesText(s.lines, (id) => d.itemsById.get(id)?.name ?? 'Item'), ...t, pays, closed: false };
    }
    const p = d.purchases.find((x) => x.id === refId);
    if (!p) return null;
    const t = purchaseTotals(p, pays);
    return { title: `${p.supplier} · ${showDate(p.date)}`, sub: linesText(p.lines, (id) => d.itemsById.get(id)?.name ?? 'Item'), ...t, pays, closed: !!p.opening };
  }, [d, kind, refId]);
}

export function PaymentForm({ kind, refId, onClose }: { kind: PaymentKind; refId: string; onClose: () => void }) {
  const d = useData();
  const notify = useNotice();
  const owing = useOwing(kind, refId);
  const saver = useSaver();
  const [amount, setAmount] = useState(owing?.balance ?? 0);
  const [date, setDate] = useState(d.today);
  const [method, setMethod] = useState(d.settings.methods[0] ?? 'Cash');
  const [note, setNote] = useState('');
  const paying = kind === 'purchase';
  if (!owing) return null;
  const save = () =>
    saver.run(
      () => d.actions.addPayment(kind, refId, { amount, date, method, note }),
      () => {
        notify(paying ? 'Payment to supplier saved' : 'Payment saved');
        onClose();
      },
    );
  return (
    <Sheet
      title={paying ? 'Pay the supplier' : 'Record a payment'}
      onClose={onClose}
      footer={
        <SheetButtons>
          <Button variant="plain" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} busy={saver.busy}>
            Save payment
          </Button>
        </SheetButtons>
      }
    >
      <FormError message={saver.error} />
      <div className="card mb-4 p-4">
        <p className="font-semibold">{owing.title}</p>
        {owing.sub && <p className="truncate text-sm text-muted">{owing.sub}</p>}
        <div className="mt-2 border-t border-line pt-2 text-sm">
          <Line label="Total" value={money(owing.value, d.settings.currency)} />
          <Line label="Paid so far" value={money(owing.paid, d.settings.currency)} />
          <Line label="Balance" value={money(owing.balance, d.settings.currency)} strong />
        </div>
      </div>
      <div className="space-y-3">
        <Field label={paying ? 'Amount paid' : 'Amount received'}>
          <MoneyInput value={amount} onChange={setAmount} autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">
            <DateInput value={date} onChange={setDate} max={d.today} />
          </Field>
          <Field label="How">
            <Select options={d.settings.methods} value={method} onChange={(e) => setMethod(e.target.value)} />
          </Field>
        </div>
        <Field label="Note (optional)">
          <TextInput value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Mobile Money reference" />
        </Field>
      </div>
    </Sheet>
  );
}

/** The payments on one order, sale or stock purchase, with a visible bin on each (no hover needed). */
export function PaymentsBlock({ kind, refId }: { kind: PaymentKind; refId: string }) {
  const d = useData();
  const sheets = useSheets();
  const confirm = useConfirm();
  const notify = useNotice();
  const owing = useOwing(kind, refId);
  if (!owing) return null;
  const pays = [...owing.pays].sort((a, b) => (a.date < b.date ? 1 : -1));
  const remove = async (p: Payment) => {
    const ok = await confirm({ title: 'Delete this payment?', body: `${money(p.amount, d.settings.currency)} on ${showDate(p.date)} will be removed and the balance will go up by that much.`, yes: 'Delete payment', danger: true });
    if (!ok) return;
    try {
      await d.actions.deletePayment(p.id);
      notify('Payment deleted');
    } catch (e) {
      notify((e as Error).message, 'bad');
    }
  };
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-semibold">{kind === 'purchase' ? 'Paid to supplier' : 'Payments'}</h3>
        {owing.balance > 0 && !owing.closed && (
          <Button small variant="soft" icon={Plus} onClick={() => sheets.open({ t: 'payment', kind, refId })}>
            {kind === 'purchase' ? 'Pay' : 'Record payment'}
          </Button>
        )}
      </div>
      {pays.length === 0 ? (
        <p className="card px-4 py-3 text-sm text-muted">{kind === 'purchase' ? 'Nothing paid yet.' : 'No payment yet.'}</p>
      ) : (
        <List>
          {pays.map((p) => (
            <div key={p.id} className="flex items-center gap-2 py-1 pr-1 pl-4">
              <div className="min-w-0 flex-1 py-1.5">
                <p className="num font-medium">{money(p.amount, d.settings.currency)}</p>
                <p className="truncate text-sm text-muted">
                  {showDate(p.date)} · {p.method}
                  {p.note ? ` · ${p.note}` : ''}
                </p>
              </div>
              <IconButton icon={Trash2} label="Delete payment" onClick={() => remove(p)} />
            </div>
          ))}
        </List>
      )}
    </div>
  );
}

/** Pick which order or sale a payment is for: only those with a balance are listed. */
export function PickOwing({ kind, onClose }: { kind: 'order' | 'sale'; onClose: () => void }) {
  const d = useData();
  const sheets = useSheets();
  const rows = useMemo(() => {
    if (kind === 'order')
      return d.orders
        .map((o) => ({ id: o.id, title: customerLabel(o, d.customersById), sub: `${o.number} · ${itemsText(o)}`, date: o.dueDate, balance: d.orderTotalsById.get(o.id)?.balance ?? 0 }))
        .filter((r) => r.balance > 0)
        .sort((a, b) => (a.date < b.date ? -1 : 1));
    return d.sales
      .map((s) => ({ id: s.id, title: customerLabel(s, d.customersById), sub: `${s.number} · ${showDate(s.date)}`, date: s.date, balance: saleTotals(s, d.byRef.get(s.id)).balance }))
      .filter((r) => r.balance > 0)
      .sort((a, b) => (a.date < b.date ? -1 : 1));
  }, [d, kind]);
  return (
    <Sheet title="Which one is the payment for?" onClose={onClose}>
      {rows.length === 0 ? (
        <Empty icon={Banknote} title="Nothing is owed" body={kind === 'order' ? 'Every order is fully paid.' : 'Every sale is fully paid.'} />
      ) : (
        <List>
          {rows.map((r) => (
            <button key={r.id} type="button" className="row" onClick={() => sheets.swap({ t: 'payment', kind, refId: r.id })}>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{r.title}</p>
                <p className="truncate text-sm text-muted">{r.sub}</p>
              </div>
              <span className="num shrink-0 font-semibold text-cherry">{money(r.balance, d.settings.currency)}</span>
            </button>
          ))}
        </List>
      )}
    </Sheet>
  );
}

// ---------- expenses ----------

export function ExpenseForm({ section, id, orderId, onClose }: { section: Section; id?: string; orderId?: string; onClose: () => void }) {
  const d = useData();
  const notify = useNotice();
  const confirm = useConfirm();
  const saver = useSaver();
  const old = id ? d.expenses.find((e) => e.id === id) : undefined;
  const cats = section === 'bake' ? d.settings.bakeCategories : d.settings.hardwareCategories;
  const [f, setF] = useState({
    date: old?.date ?? d.today,
    category: old?.category ?? cats[0] ?? 'Other',
    description: old?.description ?? '',
    amount: old?.amount ?? 0,
    paidTo: old?.paidTo ?? '',
    orderId: old?.orderId ?? orderId ?? '',
    ingredient: old?.ingredient ?? '',
    qtyNote: old?.qtyNote ?? '',
    note: old?.note ?? '',
  });
  const isIngredient = section === 'bake' && isIngredientCategory(f.category);
  const ingredientOptions = [{ value: '', label: 'Several, or not on the list' }, ...(f.ingredient && !d.settings.ingredients.includes(f.ingredient) ? [f.ingredient] : []), ...d.settings.ingredients];
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const catOptions = cats.includes(f.category) ? cats : [f.category, ...cats];
  const orderOptions = useMemo(() => {
    const recent = [...d.orders].sort((a, b) => (a.dueDate < b.dueDate ? 1 : -1)).slice(0, 40);
    const linked = f.orderId && !recent.some((o) => o.id === f.orderId) ? d.orders.filter((o) => o.id === f.orderId) : [];
    return [{ value: '', label: 'Not for one order (general)' }, ...[...linked, ...recent].map((o) => ({ value: o.id, label: `${o.number} · ${customerLabel(o, d.customersById)} · ${showDate(o.dueDate)}` }))];
  }, [d.orders, d.customersById, f.orderId]);

  const input = () => ({ section, ...f, ingredient: isIngredient ? f.ingredient : '', qtyNote: isIngredient ? f.qtyNote : '' });
  const save = () =>
    saver.run(
      () => d.actions.saveExpense(input(), id),
      () => {
        notify(id ? 'Expense updated' : 'Expense saved');
        onClose();
      },
    );
  /** For a shopping trip: saves this one and clears the form for the next item, keeping the date and shop. */
  const saveAndNext = () =>
    saver.run(
      () => d.actions.saveExpense(input()),
      () => {
        notify(`Saved ${money(f.amount, d.settings.currency)}. Add the next one.`);
        setF((x) => ({ ...x, amount: 0, description: '', ingredient: '', qtyNote: '', note: '' }));
      },
    );
  const remove = async () => {
    if (!id) return;
    if (!(await confirm({ title: 'Delete this expense?', body: `${f.description || f.category}, ${money(f.amount, d.settings.currency)}.`, yes: 'Delete expense', danger: true }))) return;
    saver.run(
      () => d.actions.deleteExpense(id),
      () => {
        notify('Expense deleted');
        onClose();
      },
    );
  };
  return (
    <Sheet
      title={id ? 'Edit expense' : 'Add an expense'}
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
            Save expense
          </Button>
        </SheetButtons>
      }
    >
      <FormError message={saver.error} />
      <div className="space-y-3">
        <Field label="Amount spent">
          <MoneyInput value={f.amount} onChange={(v) => set('amount', v)} autoFocus={!id} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Kind of expense">
            <Select options={catOptions} value={f.category} onChange={(e) => set('category', e.target.value)} />
          </Field>
          <Field label="Date">
            <DateInput value={f.date} onChange={(v) => set('date', v)} max={d.today} />
          </Field>
        </div>
        {isIngredient && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Which ingredient?">
              <Select options={ingredientOptions} value={f.ingredient} onChange={(e) => set('ingredient', e.target.value)} />
            </Field>
            <Field label="How much (optional)">
              <TextInput value={f.qtyNote} onChange={(e) => set('qtyNote', e.target.value)} placeholder="e.g. 2 trays, 5 kg" />
            </Field>
          </div>
        )}
        <Field label={isIngredient && f.ingredient ? 'More detail (optional)' : 'What was it for?'}>
          <TextInput value={f.description} onChange={(e) => set('description', e.target.value)} placeholder={section === 'bake' ? (isIngredient ? 'e.g. For the weekend orders' : 'e.g. Boda to deliver a cake') : 'e.g. Shop rent for November'} autoCapitalize="sentences" />
        </Field>
        <Field label="Paid to (optional)">
          <TextInput value={f.paidTo} onChange={(e) => set('paidTo', e.target.value)} placeholder={section === 'bake' ? 'Shop, helper or rider' : 'Who was paid'} autoCapitalize="words" />
        </Field>
        {section === 'bake' && (
          <Field label="For which order?" hint="Linking a cost to an order shows what that order really left you.">
            <Select options={orderOptions} value={f.orderId} onChange={(e) => set('orderId', e.target.value)} />
          </Field>
        )}
        <Field label="Note (optional)">
          <TextInput value={f.note} onChange={(e) => set('note', e.target.value)} autoCapitalize="sentences" />
        </Field>
        {!id && (
          <Button variant="soft" icon={Plus} className="w-full" onClick={saveAndNext} busy={saver.busy}>
            Save and add another
          </Button>
        )}
      </div>
    </Sheet>
  );
}

// ---------- customers ----------

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function specialDayText(mmdd: string | undefined): string {
  const m = mmdd?.match(/^(\d{2})-(\d{2})$/);
  return m ? `${Number(m[2])} ${MONTHS[Number(m[1]) - 1]}` : '';
}

export function CustomerForm({ section, id, onClose }: { section: Section; id?: string; onClose: () => void }) {
  const d = useData();
  const notify = useNotice();
  const saver = useSaver();
  const old = id ? d.customersById.get(id) : undefined;
  const [f, setF] = useState({
    name: old?.name ?? '',
    phone: old?.phone ?? '',
    place: old?.place ?? '',
    month: old?.specialDay?.slice(0, 2) ?? '',
    day: old?.specialDay?.slice(3, 5) ?? '',
    specialDayNote: old?.specialDayNote ?? '',
    notes: old?.notes ?? '',
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const save = () =>
    saver.run(
      () =>
        d.actions.saveCustomer(
          { section, name: f.name, phone: f.phone, place: f.place, specialDay: f.month && f.day ? `${f.month}-${f.day.padStart(2, '0')}` : '', specialDayNote: f.specialDayNote, notes: f.notes },
          id,
        ),
      () => {
        notify(id ? 'Customer updated' : 'Customer saved');
        onClose();
      },
    );
  return (
    <Sheet
      title={id ? 'Edit customer' : 'New customer'}
      onClose={onClose}
      footer={
        <SheetButtons>
          <Button variant="plain" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} busy={saver.busy}>
            Save customer
          </Button>
        </SheetButtons>
      }
    >
      <FormError message={saver.error} />
      <div className="space-y-3">
        <Field label="Name">
          <TextInput value={f.name} onChange={(e) => set('name', e.target.value)} autoCapitalize="words" autoFocus={!id} />
        </Field>
        <Field label="Phone" hint="Used for the Call and WhatsApp buttons.">
          <TextInput type="tel" inputMode="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="07xx xxx xxx" />
        </Field>
        <Field label="Where they are (optional)">
          <TextInput value={f.place} onChange={(e) => set('place', e.target.value)} placeholder="Area or delivery address" autoCapitalize="words" />
        </Field>
        {section === 'bake' && (
          <div>
            <span className="label">A day to remember (optional)</span>
            <div className="grid grid-cols-[1fr_5rem] gap-2">
              <Select aria-label="Month" options={[{ value: '', label: 'Month' }, ...MONTHS.map((m, i) => ({ value: String(i + 1).padStart(2, '0'), label: m }))]} value={f.month} onChange={(e) => set('month', e.target.value)} />
              <Select aria-label="Day" options={[{ value: '', label: 'Day' }, ...Array.from({ length: 31 }, (_, i) => String(i + 1))]} value={f.day ? String(Number(f.day)) : ''} onChange={(e) => set('day', e.target.value)} />
            </div>
            <TextInput className="mt-2" value={f.specialDayNote} onChange={(e) => set('specialDayNote', e.target.value)} placeholder="e.g. Daughter's birthday" autoCapitalize="sentences" aria-label="What the day is" />
            <span className="mt-1 block text-xs text-muted">The Overview reminds you two weeks before, so you can offer a cake.</span>
          </div>
        )}
        <Field label="Notes (optional)">
          <TextArea value={f.notes} onChange={(e) => set('notes', e.target.value)} placeholder={section === 'bake' ? 'Favourite flavours, allergies...' : 'Anything worth remembering'} autoCapitalize="sentences" />
        </Field>
      </div>
    </Sheet>
  );
}

export function CustomerView({ id, onClose }: { id: string; onClose: () => void }) {
  const d = useData();
  const sheets = useSheets();
  const confirm = useConfirm();
  const notify = useNotice();
  const c = d.customersById.get(id);
  const cur = d.settings.currency;
  const bake = c?.section === 'bake';

  const summary = useMemo(() => {
    if (!c) return null;
    if (c.section === 'bake')
      return customerSummary(c.id, d.orders, (oid) => {
        const t = d.orderTotalsById.get(oid);
        const o = d.orders.find((x) => x.id === oid);
        return { value: t?.value ?? 0, paid: t?.paid ?? 0, balance: t?.balance ?? 0, counts: o?.stage !== 'Cancelled' };
      });
    return customerSummary(c.id, d.sales, (sid) => {
      const s = d.sales.find((x) => x.id === sid);
      const t = s ? saleTotals(s, d.byRef.get(sid)) : { value: 0, paid: 0, balance: 0 };
      return { ...t, counts: true };
    });
  }, [c, d]);

  if (!c || !summary) return null;
  const orders = bake ? d.orders.filter((o) => o.customerId === id).sort((a, b) => (a.dueDate < b.dueDate ? 1 : -1)) : [];
  const sales = bake ? [] : d.sales.filter((s) => s.customerId === id).sort((a, b) => (a.date < b.date ? 1 : -1));

  const act = async (fn: () => Promise<unknown>, done: string, close = false) => {
    try {
      await fn();
      notify(done);
      if (close) onClose();
    } catch (e) {
      notify((e as Error).message, 'bad');
    }
  };
  const remove = async () => {
    if (orders.length || sales.length) {
      notify(`This customer has ${bake ? 'orders' : 'sales'}, so the record is kept. Use Archive to hide it instead.`, 'info');
      return;
    }
    if (await confirm({ title: `Delete ${c.name}?`, body: 'This customer has no orders or sales. The record will be removed.', yes: 'Delete customer', danger: true })) act(() => d.actions.deleteCustomer(id), 'Customer deleted', true);
  };

  return (
    <Sheet
      title={c.name}
      onClose={onClose}
      footer={
        <SheetButtons>
          <Button variant="plain" icon={Pencil} onClick={() => sheets.open({ t: 'customer', section: c.section, id })}>
            Edit
          </Button>
          <Button icon={bake ? CakeSlice : ShoppingCart} onClick={() => sheets.open(bake ? { t: 'order', customerName: c.name } : { t: 'sale', customerName: c.name })}>
            {bake ? 'New order' : 'New sale'}
          </Button>
        </SheetButtons>
      }
    >
      {c.archived && (
        <p className="mb-3 rounded-xl bg-line px-3 py-2 text-sm text-muted">This customer is archived (hidden from the list).</p>
      )}
      {c.phone ? (
        <div className="mb-4 flex gap-2 [&>*]:flex-1">
          <a className="btn btn-plain" href={telLink(c.phone)}>
            <Phone size={18} aria-hidden /> Call
          </a>
          <a className="btn btn-plain" href={waLink(c.phone)} target="_blank" rel="noreferrer">
            <MessageCircle size={18} aria-hidden /> WhatsApp
          </a>
        </div>
      ) : (
        <p className="mb-4 text-sm text-muted">No phone number saved. Tap Edit to add one.</p>
      )}
      <div className="card p-4 text-[15px]">
        {c.phone && <Line label="Phone" value={c.phone} />}
        {c.place && <Line label="Where" value={c.place} />}
        {c.specialDay && <Line label={c.specialDayNote || 'Day to remember'} value={specialDayText(c.specialDay)} />}
        <Line label={bake ? 'Orders' : 'Sales'} value={String(summary.orders)} />
        <Line label={bake ? 'Total ordered' : 'Total bought'} value={money(summary.value, cur)} />
        <Line label="Paid" value={money(summary.paid, cur)} />
        <Line label="Owes you" value={money(summary.owed, cur)} strong tone={summary.owed > 0 ? 'bad' : undefined} />
      </div>
      {c.notes && <p className="mt-3 rounded-xl bg-butter-soft px-4 py-3 text-[15px] whitespace-pre-wrap">{c.notes}</p>}

      <h3 className="mt-5 mb-2 font-semibold">{bake ? 'Orders' : 'Sales'}</h3>
      {orders.length + sales.length === 0 ? (
        <p className="card px-4 py-3 text-sm text-muted">Nothing yet.</p>
      ) : (
        <List>
          {orders.map((o) => {
            const t = d.orderTotalsById.get(o.id);
            return (
              <button key={o.id} type="button" className="row" onClick={() => sheets.open({ t: 'orderView', id: o.id })}>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{itemsText(o) || o.number}</p>
                  <p className="text-sm text-muted">
                    {showDay(o.dueDate)} · {o.stage}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="num font-medium">{money(t?.value, cur)}</p>
                  {o.stage !== 'Cancelled' && <Badge tone={payTone(t?.payStatus ?? '')}>{t?.payStatus}</Badge>}
                </div>
              </button>
            );
          })}
          {sales.map((s) => {
            const t = saleTotals(s, d.byRef.get(s.id));
            return (
              <button key={s.id} type="button" className="row" onClick={() => sheets.open({ t: 'saleView', id: s.id })}>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{linesText(s.lines, (iid) => d.itemsById.get(iid)?.name ?? 'Item')}</p>
                  <p className="text-sm text-muted">
                    {showDay(s.date)} · {s.number}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="num font-medium">{money(t.value, cur)}</p>
                  <Badge tone={payTone(t.status)}>{t.status}</Badge>
                </div>
              </button>
            );
          })}
        </List>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        <Button small variant="plain" icon={c.archived ? ArchiveRestore : Archive} onClick={() => act(() => d.actions.archiveCustomer(id, !c.archived), c.archived ? 'Customer restored' : 'Customer archived')}>
          {c.archived ? 'Restore' : 'Archive'}
        </Button>
        <Button small variant="plain" icon={Trash2} onClick={remove}>
          Delete
        </Button>
      </div>
    </Sheet>
  );
}

// ---------- notes ----------

export function NoteForm({ section, id, onClose }: { section: Section; id?: string; onClose: () => void }) {
  const d = useData();
  const notify = useNotice();
  const confirm = useConfirm();
  const saver = useSaver();
  const old = id ? d.notes.find((n) => n.id === id) : undefined;
  const [f, setF] = useState({ title: old?.title ?? '', body: old?.body ?? '', date: old?.date ?? '', pinned: old?.pinned ?? false, done: old?.done ?? false });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const save = () =>
    saver.run(
      () => d.actions.saveNote({ section, ...f }, id),
      () => {
        notify(id ? 'Note updated' : 'Note saved');
        onClose();
      },
    );
  const remove = async () => {
    if (!id) return;
    if (!(await confirm({ title: 'Delete this note?', body: f.title, yes: 'Delete note', danger: true }))) return;
    saver.run(
      () => d.actions.deleteNote(id),
      () => {
        notify('Note deleted');
        onClose();
      },
    );
  };
  return (
    <Sheet
      title={id ? 'Edit note' : 'New note'}
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
            Save note
          </Button>
        </SheetButtons>
      }
    >
      <FormError message={saver.error} />
      <div className="space-y-3">
        <Field label="Title">
          <TextInput value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Wedding cake enquiry, Sarah" autoCapitalize="sentences" autoFocus={!id} />
        </Field>
        <Field label="Details (optional)">
          <TextArea rows={5} value={f.body} onChange={(e) => set('body', e.target.value)} placeholder="Ideas, things to look into, what was agreed..." autoCapitalize="sentences" />
        </Field>
        <Field label="For which day? (optional)" hint="A note with a day shows on the Overview when that day is near.">
          <div className="flex gap-2">
            <DateInput value={f.date} onChange={(v) => set('date', v)} />
            {f.date && (
              <Button variant="plain" onClick={() => set('date', '')}>
                Clear
              </Button>
            )}
          </div>
        </Field>
        <label className="card flex min-h-12 items-center gap-3 px-4">
          <input type="checkbox" className="h-5 w-5 accent-[var(--accent)]" checked={f.pinned} onChange={(e) => set('pinned', e.target.checked)} />
          <span className="font-medium">Keep at the top (pin)</span>
        </label>
        {id && (
          <label className="card flex min-h-12 items-center gap-3 px-4">
            <input type="checkbox" className="h-5 w-5 accent-[var(--accent)]" checked={f.done} onChange={(e) => set('done', e.target.checked)} />
            <span className="font-medium">Done</span>
          </label>
        )}
      </div>
    </Sheet>
  );
}
