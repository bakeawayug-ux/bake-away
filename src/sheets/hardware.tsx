// Hardware windows: items, sales, stock in, count corrections, money put in or taken out.
import { Archive, ArchiveRestore, PackagePlus, Pencil, Plus, Scale, ShoppingCart, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSheets } from '../components/SheetHost';
import { Badge, Button, Choice, DateInput, Field, FormError, IconButton, Line, List, MoneyInput, QtyInput, Select, Sheet, SheetButtons, TextInput, payTone, useConfirm, useNotice, useSaver } from '../components/ui';
import { useData } from '../data/DataContext';
import { showDate, showDay } from '../lib/dates';
import { money, num, qty } from '../lib/money';
import { customerLabel } from '../lib/orders';
import { itemMoves, linesValue, purchaseTotals, saleCost, saleTotals, saleValue } from '../lib/stock';
import type { Line as StockLine } from '../lib/types';
import { PaymentsBlock } from './shared';

// ---------- items ----------

export function ItemForm({ id, onClose }: { id?: string; onClose: () => void }) {
  const d = useData();
  const notify = useNotice();
  const saver = useSaver();
  const old = id ? d.itemsById.get(id) : undefined;
  const s = d.settings;
  const [f, setF] = useState({
    name: old?.name ?? '',
    category: old?.category ?? s.itemCategories[0] ?? 'Other',
    unit: old?.unit ?? s.units[0] ?? 'pc',
    sellPrice: old?.sellPrice ?? 0,
    reorderLevel: old?.reorderLevel ?? 0,
  });
  const [openQty, setOpenQty] = useState(0);
  const [openCost, setOpenCost] = useState(0);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const cats = s.itemCategories.includes(f.category) ? s.itemCategories : [f.category, ...s.itemCategories];
  const units = s.units.includes(f.unit) ? s.units : [f.unit, ...s.units];
  const save = () =>
    saver.run(
      async () => {
        if (!id && openQty > 0 && openCost <= 0) throw new Error('Type what each one cost you, so the stock has a value.');
        await d.actions.saveItem(f, id, { qty: openQty, cost: openCost });
      },
      () => {
        notify(id ? 'Item updated' : 'Item saved');
        onClose();
      },
    );
  return (
    <Sheet
      title={id ? 'Edit item' : 'New item'}
      onClose={onClose}
      footer={
        <SheetButtons>
          <Button variant="plain" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} busy={saver.busy}>
            Save item
          </Button>
        </SheetButtons>
      }
    >
      <FormError message={saver.error} />
      <div className="space-y-3">
        <Field label="Item name">
          <TextInput value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Cement 50 kg" autoCapitalize="sentences" autoFocus={!id} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Group">
            <Select options={cats} value={f.category} onChange={(e) => set('category', e.target.value)} />
          </Field>
          <Field label="Sold by the">
            <Select options={units} value={f.unit} onChange={(e) => set('unit', e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={`Selling price (${s.currency})`}>
            <MoneyInput value={f.sellPrice} onChange={(v) => set('sellPrice', v)} />
          </Field>
          <Field label="Warn me at" hint="Low stock warning when this many or fewer are left.">
            <QtyInput value={f.reorderLevel} onChange={(v) => set('reorderLevel', v)} />
          </Field>
        </div>
        {!id && (
          <div className="card bg-butter-soft p-3">
            <p className="mb-2 text-sm font-medium">Already have some in the shop?</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="How many now">
                <QtyInput value={openQty} onChange={setOpenQty} />
              </Field>
              <Field label={`Cost each (${s.currency})`}>
                <MoneyInput value={openCost} onChange={setOpenCost} />
              </Field>
            </div>
            <p className="mt-2 text-xs text-muted">This is saved as opening stock. New deliveries go in later with Stock in.</p>
          </div>
        )}
      </div>
    </Sheet>
  );
}

export function ItemView({ id, onClose }: { id: string; onClose: () => void }) {
  const d = useData();
  const sheets = useSheets();
  const confirm = useConfirm();
  const notify = useNotice();
  const item = d.itemsById.get(id);
  const level = d.levels.get(id);
  const cur = d.settings.currency;
  const moves = useMemo(() => itemMoves(id, d.purchases, d.sales, d.adjustments), [id, d.purchases, d.sales, d.adjustments]);
  if (!item || !level) return null;
  const margin = num(item.sellPrice) - level.avgCost;

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
    if (level.moves > 0) {
      notify('This item has stock records, so it is kept. Use Archive to hide it instead.', 'info');
      return;
    }
    if (await confirm({ title: `Delete ${item.name}?`, body: 'It has no stock records. The item will be removed.', yes: 'Delete item', danger: true })) act(() => d.actions.deleteItem(id), 'Item deleted', true);
  };
  const openMove = (m: (typeof moves)[number]) => {
    if (m.kind === 'Sold') sheets.open({ t: 'saleView', id: m.refId });
    else if (m.kind === 'Stock in' || m.kind === 'Opening stock') sheets.open({ t: 'purchaseView', id: m.refId });
  };
  const removeCorrection = async (m: (typeof moves)[number]) => {
    if (await confirm({ title: 'Delete this correction?', body: `${m.qty > 0 ? '+' : ''}${qty(m.qty)} ${item.unit} on ${showDate(m.date)} (${m.who}).`, yes: 'Delete correction', danger: true })) act(() => d.actions.deleteAdjustment(m.refId), 'Correction deleted');
  };

  return (
    <Sheet
      title={item.name}
      onClose={onClose}
      footer={
        <SheetButtons>
          <Button variant="plain" icon={PackagePlus} onClick={() => sheets.open({ t: 'purchase', itemId: id })}>
            Stock in
          </Button>
          <Button icon={ShoppingCart} onClick={() => sheets.open({ t: 'sale', itemId: id })}>
            Sell
          </Button>
        </SheetButtons>
      }
    >
      {item.archived && <p className="mb-3 rounded-xl bg-line px-3 py-2 text-sm text-muted">This item is archived (hidden from the stock list).</p>}
      <div className="card flex items-center justify-between p-4">
        <div>
          <p className="text-sm text-muted">In stock</p>
          <p className="num text-3xl font-semibold">
            {qty(level.onHand)} <span className="text-base font-medium text-muted">{item.unit}</span>
          </p>
        </div>
        {level.onHand < 0 ? <Badge tone="red">Below zero: check the count</Badge> : level.low ? <Badge tone="amber">Low stock</Badge> : <Badge tone="green">In stock</Badge>}
      </div>
      <div className="card mt-3 p-4 text-[15px]">
        <Line label="Group" value={item.category} />
        <Line label="Selling price" value={money(item.sellPrice, cur)} />
        <Line label="Average cost" value={level.bought > 0 ? money(level.avgCost, cur) : 'Not bought yet'} />
        {level.bought > 0 && <Line label="You make on each" value={money(margin, cur)} tone={margin >= 0 ? 'good' : 'bad'} />}
        <Line label="Value of what is in stock" value={money(level.value, cur)} strong />
        <div className="mt-1 border-t border-line pt-1">
          <Line label="Bought so far" value={`${qty(level.bought)} ${item.unit}`} />
          <Line label="Sold so far" value={`${qty(level.sold)} ${item.unit}`} />
          {level.adjusted !== 0 && <Line label="Count corrections" value={`${level.adjusted > 0 ? '+' : ''}${qty(level.adjusted)} ${item.unit}`} />}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button small variant="plain" icon={Scale} onClick={() => sheets.open({ t: 'adjust', itemId: id })}>
          Correct the count
        </Button>
        <Button small variant="plain" icon={Pencil} onClick={() => sheets.open({ t: 'item', id })}>
          Edit
        </Button>
        <Button small variant="plain" icon={item.archived ? ArchiveRestore : Archive} onClick={() => act(() => d.actions.archiveItem(id, !item.archived), item.archived ? 'Item restored' : 'Item archived')}>
          {item.archived ? 'Restore' : 'Archive'}
        </Button>
        <Button small variant="plain" icon={Trash2} onClick={remove}>
          Delete
        </Button>
      </div>

      <h3 className="mt-5 mb-2 font-semibold">What happened to this item</h3>
      {moves.length === 0 ? (
        <p className="card px-4 py-3 text-sm text-muted">Nothing yet. Use Stock in when you buy some.</p>
      ) : (
        <List>
          {moves.map((m, i) =>
            m.kind === 'Correction' ? (
              <div key={i} className="flex items-center gap-2 py-1 pr-1 pl-4">
                <div className="min-w-0 flex-1 py-1.5">
                  <p className="font-medium">Correction: {m.who}</p>
                  <p className="text-sm text-muted">{showDate(m.date)}</p>
                </div>
                <span className={`num shrink-0 font-semibold ${m.qty >= 0 ? 'text-leaf' : 'text-cherry'}`}>
                  {m.qty > 0 ? '+' : ''}
                  {qty(m.qty)}
                </span>
                <IconButton icon={Trash2} label="Delete correction" onClick={() => removeCorrection(m)} />
              </div>
            ) : (
              <button key={i} type="button" className="row" onClick={() => openMove(m)}>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {m.kind}
                    {m.who && m.kind !== 'Opening stock' ? ` · ${m.who}` : ''}
                  </p>
                  <p className="text-sm text-muted">
                    {showDate(m.date)} · {money(m.price, cur)} each
                  </p>
                </div>
                <span className={`num shrink-0 font-semibold ${m.qty >= 0 ? 'text-leaf' : 'text-cherry'}`}>
                  {m.qty > 0 ? '+' : ''}
                  {qty(m.qty)}
                </span>
              </button>
            ),
          )}
        </List>
      )}
    </Sheet>
  );
}

// ---------- lines (shared by sales and stock in) ----------

function LinesEditor({ lines, onChange, mode }: { lines: StockLine[]; onChange: (lines: StockLine[]) => void; mode: 'sale' | 'purchase' }) {
  const d = useData();
  const sheets = useSheets();
  const cur = d.settings.currency;
  const options = useMemo(() => {
    const used = new Set(lines.map((l) => l.itemId));
    const list = d.items.filter((i) => !i.archived || used.has(i.id)).sort((a, b) => a.name.localeCompare(b.name));
    return [{ value: '', label: list.length ? 'Choose an item' : 'No items yet: add one below' }, ...list.map((i) => ({ value: i.id, label: `${i.name} (${qty(d.levels.get(i.id)?.onHand ?? 0)} ${i.unit} in stock)` }))];
  }, [d.items, d.levels, lines]);
  const setLine = (i: number, patch: Partial<StockLine>) => onChange(lines.map((l, n) => (n === i ? { ...l, ...patch } : l)));
  const pick = (i: number, itemId: string) => {
    const item = d.itemsById.get(itemId);
    const price = mode === 'sale' ? num(item?.sellPrice) : Math.round(d.levels.get(itemId)?.avgCost ?? 0);
    setLine(i, { itemId, price });
  };
  return (
    <div>
      <span className="label">{mode === 'sale' ? 'What was sold' : 'What came in'}</span>
      <div className="space-y-2">
        {lines.map((l, i) => {
          const item = d.itemsById.get(l.itemId);
          const have = d.levels.get(l.itemId)?.onHand ?? 0;
          const short = mode === 'sale' && item && num(l.qty) > have;
          return (
            <div key={i} className="card p-3">
              <div className="flex gap-1">
                <Select aria-label="Item" options={options} value={l.itemId} onChange={(e) => pick(i, e.target.value)} />
                {lines.length > 1 && <IconButton icon={Trash2} label="Remove this line" onClick={() => onChange(lines.filter((_, n) => n !== i))} />}
              </div>
              <div className="mt-2 grid grid-cols-[5.5rem_1fr] gap-2">
                <Field label={item ? `How many (${item.unit})` : 'How many'}>
                  <QtyInput value={l.qty} onChange={(v) => setLine(i, { qty: v })} />
                </Field>
                <Field label={mode === 'sale' ? `Price each (${cur})` : `Cost each (${cur})`}>
                  <MoneyInput value={l.price} onChange={(v) => setLine(i, { price: v })} />
                </Field>
              </div>
              {short && (
                <p className="mt-2 text-sm font-medium text-amber">
                  The records show only {qty(have)} {item.unit} in stock. You can still save; correct the count afterwards if needed.
                </p>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button small variant="soft" icon={Plus} onClick={() => onChange([...lines, { itemId: '', qty: 1, price: 0 }])}>
          Add another line
        </Button>
        <Button small variant="plain" icon={Plus} onClick={() => sheets.open({ t: 'item' })}>
          New item
        </Button>
      </div>
    </div>
  );
}

/** "Paid now" follows the total until the person types their own figure. */
function usePaidNow(total: number) {
  const [typed, setTyped] = useState<number | null>(null);
  return { paid: typed ?? total, setPaid: (n: number) => setTyped(n), reset: () => setTyped(null), touched: typed !== null };
}

// ---------- sales ----------

export function SaleForm({ id, itemId, customerName, onClose }: { id?: string; itemId?: string; customerName?: string; onClose: () => void }) {
  const d = useData();
  const notify = useNotice();
  const saver = useSaver();
  const old = id ? d.sales.find((s) => s.id === id) : undefined;
  const cur = d.settings.currency;
  const known = useMemo(() => d.customers.filter((c) => c.section === 'hardware' && !c.archived).sort((a, b) => a.name.localeCompare(b.name)), [d.customers]);
  const firstItem = itemId ? d.itemsById.get(itemId) : undefined;
  const oldName = old ? customerLabel(old, d.customersById) : (customerName ?? '');
  const [f, setF] = useState({
    date: old?.date ?? d.today,
    customerName: oldName === 'Walk-in customer' ? '' : oldName,
    lines: old?.lines?.length ? old.lines.map((l) => ({ ...l })) : [{ itemId: itemId ?? '', qty: 1, price: num(firstItem?.sellPrice) }],
    discount: old?.discount ?? 0,
    note: old?.note ?? '',
  });
  const [method, setMethod] = useState(d.settings.methods[0] ?? 'Cash');
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const total = saleValue(f);
  const now = usePaidNow(total);
  const save = () =>
    saver.run(
      () => d.actions.saveSale(f, id, { amount: now.paid, method }),
      () => {
        notify(id ? 'Sale updated' : 'Sale saved');
        onClose();
      },
    );
  return (
    <Sheet
      title={id ? `Edit sale ${old?.number ?? ''}` : 'New sale'}
      onClose={onClose}
      footer={
        <>
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-muted">Sale total</span>
            <span className="num text-lg font-semibold">{money(total, cur)}</span>
          </div>
          <SheetButtons>
            <Button variant="plain" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={save} busy={saver.busy}>
              Save sale
            </Button>
          </SheetButtons>
        </>
      }
    >
      <FormError message={saver.error} />
      <div className="space-y-3">
        <LinesEditor lines={f.lines} onChange={(lines) => set('lines', lines)} mode="sale" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">
            <DateInput value={f.date} onChange={(v) => set('date', v)} max={d.today} />
          </Field>
          <Field label={`Discount (${cur})`}>
            <MoneyInput value={f.discount} onChange={(v) => set('discount', v)} />
          </Field>
        </div>
        <Field label="Customer (optional)" hint="Leave blank for a walk-in. Type a name when they take goods on credit.">
          <TextInput list="hw-customers" value={f.customerName} onChange={(e) => set('customerName', e.target.value)} placeholder="Customer's name" autoCapitalize="words" />
          <datalist id="hw-customers">
            {known.map((c) => (
              <option key={c.id} value={c.name} />
            ))}
          </datalist>
        </Field>
        {!id && (
          <div className="card bg-butter-soft p-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label={`Paid now (${cur})`}>
                <MoneyInput value={now.paid} onChange={now.setPaid} />
              </Field>
              <Field label="How">
                <Select options={d.settings.methods} value={method} onChange={(e) => setMethod(e.target.value)} />
              </Field>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button small variant="plain" onClick={now.reset}>
                Paid in full
              </Button>
              <Button small variant="plain" onClick={() => now.setPaid(0)}>
                On credit
              </Button>
              {now.paid < total && <span className="num text-sm font-medium text-cherry">Balance {money(total - now.paid, cur)}</span>}
            </div>
            {now.paid < total && !f.customerName.trim() && <p className="mt-2 text-sm font-medium text-amber">Type the customer's name above so you know who owes this.</p>}
          </div>
        )}
        <Field label="Note (optional)">
          <TextInput value={f.note} onChange={(e) => set('note', e.target.value)} autoCapitalize="sentences" />
        </Field>
      </div>
    </Sheet>
  );
}

export function SaleView({ id, onClose }: { id: string; onClose: () => void }) {
  const d = useData();
  const sheets = useSheets();
  const confirm = useConfirm();
  const notify = useNotice();
  const s = d.sales.find((x) => x.id === id);
  const cur = d.settings.currency;
  if (!s) return null;
  const t = saleTotals(s, d.byRef.get(id));
  const cost = saleCost(s, d.levels);
  const remove = async () => {
    if (!(await confirm({ title: `Delete sale ${s.number}?`, body: `The items go back into stock${t.paid > 0 ? ` and its payments (${money(t.paid, cur)}) are deleted with it` : ''}.`, yes: 'Delete sale', danger: true }))) return;
    try {
      await d.actions.deleteSale(id);
      notify('Sale deleted');
      onClose();
    } catch (e) {
      notify((e as Error).message, 'bad');
    }
  };
  return (
    <Sheet
      title={`Sale ${s.number}`}
      onClose={onClose}
      footer={
        <SheetButtons>
          <Button variant="plain" icon={Pencil} onClick={() => sheets.open({ t: 'sale', id })}>
            Edit
          </Button>
          {t.balance > 0 ? (
            <Button onClick={() => sheets.open({ t: 'payment', kind: 'sale', refId: id })}>Record payment</Button>
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
          <p className="truncate text-xl font-semibold">{customerLabel(s, d.customersById)}</p>
          <p className="text-muted">{showDay(s.date)}</p>
        </div>
        <Badge tone={payTone(t.status)}>{t.status}</Badge>
      </div>
      <div className="card mt-4 p-4 text-[15px]">
        {s.lines.map((l, n) => (
          <Line key={n} label={`${qty(l.qty)} × ${d.itemsById.get(l.itemId)?.name ?? 'Item'} @ ${money(l.price, cur)}`} value={money(num(l.qty) * num(l.price), cur)} />
        ))}
        {num(s.discount) > 0 && <Line label="Discount" value={`-${money(s.discount, cur)}`} />}
        <div className="mt-1 border-t border-line pt-1">
          <Line label="Total" value={money(t.value, cur)} strong />
          <Line label="Paid" value={money(t.paid, cur)} tone="good" />
          <Line label="Balance" value={money(t.balance, cur)} strong tone={t.balance > 0 ? 'bad' : undefined} />
        </div>
      </div>
      <div className="card mt-3 px-4 py-2 text-[15px]">
        <Line label="What these goods cost you" value={money(cost, cur)} />
        <Line label="Profit on this sale" value={money(t.value - cost, cur)} strong tone={t.value - cost >= 0 ? 'good' : 'bad'} />
      </div>
      {s.note && <p className="mt-3 rounded-xl bg-butter-soft px-4 py-3 text-[15px]">{s.note}</p>}
      <div className="mt-5">
        <PaymentsBlock kind="sale" refId={id} />
      </div>
      <div className="mt-6">
        <Button small variant="plain" icon={Trash2} onClick={remove}>
          Delete sale
        </Button>
      </div>
    </Sheet>
  );
}

// ---------- stock in ----------

export function PurchaseForm({ id, itemId, onClose }: { id?: string; itemId?: string; onClose: () => void }) {
  const d = useData();
  const notify = useNotice();
  const saver = useSaver();
  const old = id ? d.purchases.find((p) => p.id === id) : undefined;
  const cur = d.settings.currency;
  const suppliers = useMemo(() => [...new Set(d.purchases.filter((p) => !p.opening).map((p) => p.supplier))].sort(), [d.purchases]);
  const [f, setF] = useState({
    date: old?.date ?? d.today,
    supplier: old?.supplier ?? '',
    lines: old?.lines?.length ? old.lines.map((l) => ({ ...l })) : [{ itemId: itemId ?? '', qty: 1, price: itemId ? Math.round(d.levels.get(itemId)?.avgCost ?? 0) : 0 }],
    note: old?.note ?? '',
    opening: old?.opening ?? false,
  });
  const [method, setMethod] = useState(d.settings.methods[0] ?? 'Cash');
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const total = linesValue(f.lines);
  const now = usePaidNow(total);
  const save = () =>
    saver.run(
      () => d.actions.savePurchase(f, id, { amount: now.paid, method }),
      () => {
        notify(id ? 'Stock in updated' : 'Stock in saved');
        onClose();
      },
    );
  return (
    <Sheet
      title={id ? 'Edit stock in' : 'Stock in'}
      onClose={onClose}
      footer={
        <>
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-muted">Total cost</span>
            <span className="num text-lg font-semibold">{money(total, cur)}</span>
          </div>
          <SheetButtons>
            <Button variant="plain" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={save} busy={saver.busy}>
              Save stock in
            </Button>
          </SheetButtons>
        </>
      }
    >
      <FormError message={saver.error} />
      <div className="space-y-3">
        <LinesEditor lines={f.lines} onChange={(lines) => set('lines', lines)} mode="purchase" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">
            <DateInput value={f.date} onChange={(v) => set('date', v)} max={d.today} />
          </Field>
          <Field label="Bought from">
            <TextInput list="hw-suppliers" value={f.supplier} onChange={(e) => set('supplier', e.target.value)} placeholder="Supplier" autoCapitalize="words" disabled={f.opening} />
            <datalist id="hw-suppliers">
              {suppliers.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </Field>
        </div>
        {!id && (
          <div className="card bg-butter-soft p-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label={`Paid now (${cur})`}>
                <MoneyInput value={now.paid} onChange={now.setPaid} />
              </Field>
              <Field label="How">
                <Select options={d.settings.methods} value={method} onChange={(e) => setMethod(e.target.value)} />
              </Field>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button small variant="plain" onClick={now.reset}>
                Paid in full
              </Button>
              <Button small variant="plain" onClick={() => now.setPaid(0)}>
                On credit
              </Button>
              {now.paid < total && <span className="num text-sm font-medium text-cherry">You will owe {money(total - now.paid, cur)}</span>}
            </div>
          </div>
        )}
        <Field label="Note (optional)" hint="Transport to bring the stock goes under Expenses.">
          <TextInput value={f.note} onChange={(e) => set('note', e.target.value)} autoCapitalize="sentences" />
        </Field>
      </div>
    </Sheet>
  );
}

export function PurchaseView({ id, onClose }: { id: string; onClose: () => void }) {
  const d = useData();
  const sheets = useSheets();
  const confirm = useConfirm();
  const notify = useNotice();
  const p = d.purchases.find((x) => x.id === id);
  const cur = d.settings.currency;
  if (!p) return null;
  const t = purchaseTotals(p, d.byRef.get(id));
  const remove = async () => {
    if (!(await confirm({ title: 'Delete this stock in?', body: `The items come out of stock again${!p.opening && t.paid > 0 ? ` and its payments (${money(t.paid, cur)}) are deleted with it` : ''}.`, yes: 'Delete', danger: true }))) return;
    try {
      await d.actions.deletePurchase(id);
      notify('Stock in deleted');
      onClose();
    } catch (e) {
      notify((e as Error).message, 'bad');
    }
  };
  return (
    <Sheet
      title={p.opening ? 'Opening stock' : 'Stock in'}
      onClose={onClose}
      footer={
        <SheetButtons>
          <Button variant="plain" icon={Pencil} onClick={() => sheets.open({ t: 'purchase', id })}>
            Edit
          </Button>
          {t.balance > 0 ? (
            <Button onClick={() => sheets.open({ t: 'payment', kind: 'purchase', refId: id })}>Pay the supplier</Button>
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
          <p className="truncate text-xl font-semibold">{p.supplier}</p>
          <p className="text-muted">{showDay(p.date)}</p>
        </div>
        {!p.opening && <Badge tone={payTone(t.status)}>{t.status}</Badge>}
      </div>
      <div className="card mt-4 p-4 text-[15px]">
        {p.lines.map((l, n) => (
          <Line key={n} label={`${qty(l.qty)} × ${d.itemsById.get(l.itemId)?.name ?? 'Item'} @ ${money(l.price, cur)}`} value={money(num(l.qty) * num(l.price), cur)} />
        ))}
        <div className="mt-1 border-t border-line pt-1">
          <Line label="Total cost" value={money(t.value, cur)} strong />
          {!p.opening && (
            <>
              <Line label="Paid" value={money(t.paid, cur)} tone="good" />
              <Line label="You still owe" value={money(t.balance, cur)} strong tone={t.balance > 0 ? 'bad' : undefined} />
            </>
          )}
        </div>
      </div>
      {p.opening && <p className="mt-3 text-sm text-muted">Opening stock was already in the shop when the records started, so nothing is owed for it.</p>}
      {p.note && <p className="mt-3 rounded-xl bg-butter-soft px-4 py-3 text-[15px]">{p.note}</p>}
      {!p.opening && (
        <div className="mt-5">
          <PaymentsBlock kind="purchase" refId={id} />
        </div>
      )}
      <div className="mt-6">
        <Button small variant="plain" icon={Trash2} onClick={remove}>
          Delete
        </Button>
      </div>
    </Sheet>
  );
}

// ---------- count correction ----------

const REASONS = ['Counted the shelf', 'Damaged', 'Lost or stolen', 'Used in the shop', 'Other'];

export function AdjustForm({ itemId, onClose }: { itemId: string; onClose: () => void }) {
  const d = useData();
  const notify = useNotice();
  const saver = useSaver();
  const item = d.itemsById.get(itemId);
  const have = d.levels.get(itemId)?.onHand ?? 0;
  const [counted, setCounted] = useState(have > 0 ? have : 0);
  const [reason, setReason] = useState(REASONS[0]);
  const [date, setDate] = useState(d.today);
  if (!item) return null;
  const diff = Math.round((counted - have) * 1000) / 1000;
  const save = () =>
    saver.run(
      () => d.actions.saveAdjustment({ itemId, date, qty: diff, reason }),
      () => {
        notify('Count corrected');
        onClose();
      },
    );
  return (
    <Sheet
      title="Correct the count"
      onClose={onClose}
      footer={
        <SheetButtons>
          <Button variant="plain" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} busy={saver.busy}>
            Save correction
          </Button>
        </SheetButtons>
      }
    >
      <FormError message={saver.error} />
      <div className="card mb-4 p-4">
        <p className="font-semibold">{item.name}</p>
        <p className="text-sm text-muted">
          The records say {qty(have)} {item.unit} in stock.
        </p>
      </div>
      <div className="space-y-3">
        <Field label={`How many are really there? (${item.unit})`}>
          <QtyInput value={counted} onChange={setCounted} autoFocus />
        </Field>
        <p className={`text-sm font-medium ${diff === 0 ? 'text-muted' : diff > 0 ? 'text-leaf' : 'text-cherry'}`}>
          {diff === 0 ? 'Same as the records.' : diff > 0 ? `${qty(diff)} ${item.unit} more than the records: they will be added.` : `${qty(-diff)} ${item.unit} fewer than the records: they will be taken off.`}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Why">
            <Select options={REASONS} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <Field label="Date">
            <DateInput value={date} onChange={setDate} max={d.today} />
          </Field>
        </div>
      </div>
    </Sheet>
  );
}

// ---------- money put in or taken out ----------

export function CapitalForm({ id, onClose }: { id?: string; onClose: () => void }) {
  const d = useData();
  const notify = useNotice();
  const confirm = useConfirm();
  const saver = useSaver();
  const old = id ? d.capital.find((c) => c.id === id) : undefined;
  const [f, setF] = useState({ direction: old?.direction ?? ('in' as 'in' | 'out'), amount: old?.amount ?? 0, date: old?.date ?? d.today, note: old?.note ?? '' });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const save = () =>
    saver.run(
      () => d.actions.saveCapital({ section: 'hardware', ...f }, id),
      () => {
        notify(id ? 'Updated' : 'Saved');
        onClose();
      },
    );
  const remove = async () => {
    if (!id) return;
    if (!(await confirm({ title: 'Delete this entry?', body: `${f.direction === 'in' ? 'Money put in' : 'Money taken out'}, ${money(f.amount, d.settings.currency)}.`, yes: 'Delete', danger: true }))) return;
    saver.run(
      () => d.actions.deleteCapital(id),
      () => {
        notify('Deleted');
        onClose();
      },
    );
  };
  return (
    <Sheet
      title={id ? 'Edit entry' : 'Your money in the shop'}
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
            Save
          </Button>
        </SheetButtons>
      }
    >
      <FormError message={saver.error} />
      <div className="space-y-3">
        <Choice
          options={[
            { value: 'in', label: 'Money I put in' },
            { value: 'out', label: 'Money I took out' },
          ]}
          value={f.direction}
          onChange={(v) => set('direction', v)}
        />
        <Field label="Amount">
          <MoneyInput value={f.amount} onChange={(v) => set('amount', v)} autoFocus={!id} />
        </Field>
        <Field label="Date">
          <DateInput value={f.date} onChange={(v) => set('date', v)} max={d.today} />
        </Field>
        <Field label="Note (optional)">
          <TextInput value={f.note} onChange={(e) => set('note', e.target.value)} placeholder={f.direction === 'in' ? 'e.g. Savings to start the shop' : 'e.g. School fees'} autoCapitalize="sentences" />
        </Field>
      </div>
    </Sheet>
  );
}
