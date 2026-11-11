// Every form and detail window in the app is opened from here by name, e.g. open({ t: 'order' }).
// Windows stack: a detail window can open its edit form on top, and closing returns to the detail.
// (Windows are opened by this call, not by a "?new=1" in the address, which caused trouble before.)
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { PaymentKind, Section } from '../lib/types';
import { OrderForm, OrderView, ProductForm } from '../sheets/bake';
import { AdjustForm, CapitalForm, ItemForm, ItemView, PurchaseForm, PurchaseView, SaleForm, SaleView } from '../sheets/hardware';
import { MoreSheet, QuickSheet } from '../sheets/menus';
import { CustomerForm, CustomerView, ExpenseForm, NoteForm, PaymentForm, PickOwing } from '../sheets/shared';

export type SheetSpec =
  | { t: 'order'; id?: string; customerName?: string }
  | { t: 'orderView'; id: string }
  | { t: 'product'; id?: string }
  | { t: 'pickOwing'; kind: 'order' | 'sale' }
  | { t: 'payment'; kind: PaymentKind; refId: string }
  | { t: 'expense'; section: Section; id?: string; orderId?: string }
  | { t: 'customer'; section: Section; id?: string }
  | { t: 'customerView'; id: string }
  | { t: 'note'; section: Section; id?: string }
  | { t: 'item'; id?: string }
  | { t: 'itemView'; id: string }
  | { t: 'sale'; id?: string; itemId?: string; customerName?: string }
  | { t: 'saleView'; id: string }
  | { t: 'purchase'; id?: string; itemId?: string }
  | { t: 'purchaseView'; id: string }
  | { t: 'adjust'; itemId: string }
  | { t: 'capital'; id?: string }
  | { t: 'quick'; section: Section }
  | { t: 'more'; section: Section };

interface SheetsApi {
  open: (spec: SheetSpec) => void;
  /** Closes the top window and opens another in its place */
  swap: (spec: SheetSpec) => void;
  close: () => void;
}

const SheetsContext = createContext<SheetsApi>({ open: () => {}, swap: () => {}, close: () => {} });
export const useSheets = () => useContext(SheetsContext);

function render(spec: SheetSpec, close: () => void) {
  switch (spec.t) {
    case 'order':
      return <OrderForm id={spec.id} customerName={spec.customerName} onClose={close} />;
    case 'orderView':
      return <OrderView id={spec.id} onClose={close} />;
    case 'product':
      return <ProductForm id={spec.id} onClose={close} />;
    case 'pickOwing':
      return <PickOwing kind={spec.kind} onClose={close} />;
    case 'payment':
      return <PaymentForm kind={spec.kind} refId={spec.refId} onClose={close} />;
    case 'expense':
      return <ExpenseForm section={spec.section} id={spec.id} orderId={spec.orderId} onClose={close} />;
    case 'customer':
      return <CustomerForm section={spec.section} id={spec.id} onClose={close} />;
    case 'customerView':
      return <CustomerView id={spec.id} onClose={close} />;
    case 'note':
      return <NoteForm section={spec.section} id={spec.id} onClose={close} />;
    case 'item':
      return <ItemForm id={spec.id} onClose={close} />;
    case 'itemView':
      return <ItemView id={spec.id} onClose={close} />;
    case 'sale':
      return <SaleForm id={spec.id} itemId={spec.itemId} customerName={spec.customerName} onClose={close} />;
    case 'saleView':
      return <SaleView id={spec.id} onClose={close} />;
    case 'purchase':
      return <PurchaseForm id={spec.id} itemId={spec.itemId} onClose={close} />;
    case 'purchaseView':
      return <PurchaseView id={spec.id} onClose={close} />;
    case 'adjust':
      return <AdjustForm itemId={spec.itemId} onClose={close} />;
    case 'capital':
      return <CapitalForm id={spec.id} onClose={close} />;
    case 'quick':
      return <QuickSheet section={spec.section} onClose={close} />;
    case 'more':
      return <MoreSheet section={spec.section} onClose={close} />;
  }
}

export function SheetProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<{ key: number; spec: SheetSpec }[]>([]);
  const open = useCallback((spec: SheetSpec) => setStack((s) => [...s, { key: Date.now() + Math.random(), spec }]), []);
  const close = useCallback(() => setStack((s) => s.slice(0, -1)), []);
  const swap = useCallback((spec: SheetSpec) => setStack((s) => [...s.slice(0, -1), { key: Date.now() + Math.random(), spec }]), []);
  const api = useMemo(() => ({ open, close, swap }), [open, close, swap]);
  return (
    <SheetsContext.Provider value={api}>
      {children}
      {stack.map((s) => (
        <div key={s.key}>{render(s.spec, close)}</div>
      ))}
    </SheetsContext.Provider>
  );
}
