// Loads every record list ONCE for the whole app (one listener per list, not one per page) and
// works out the shared figures once. Pages read from here; they never load records themselves.
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { todayYmd } from '../lib/dates';
import { orderTotals, paymentsByRef, type OrderTotals } from '../lib/orders';
import { stockLevels, type StockLevel } from '../lib/stock';
import { COLLECTIONS, DEFAULT_SETTINGS, EMPTY_RECORDS, type Col, type Customer, type Item, type Payment, type Records, type Settings } from '../lib/types';
import { makeActions, type Actions } from './actions';
import type { Row, SnapshotInfo, Store } from './store';

export type SyncState = 'device' | 'saved' | 'sending' | 'offline';

interface DataValue extends Records {
  settings: Settings;
  /** The settings exactly as stored (without the defaults filled in), for backups */
  settingsRow: Partial<Settings> | null;
  /** false until every list has arrived; pages show "Loading" rather than "no records" */
  ready: boolean;
  loadError: string;
  sync: SyncState;
  storeKind: Store['kind'];
  account: string;
  today: string;
  actions: Actions;
  byRef: Map<string, Payment[]>;
  customersById: Map<string, Customer>;
  itemsById: Map<string, Item>;
  levels: Map<string, StockLevel>;
  orderTotalsById: Map<string, OrderTotals>;
  /** Cloud only: forget the account on this device */
  signOut?: () => void;
  /** Cloud only: show the PIN screen now */
  lock?: () => void;
  /** Cloud only: returns an error message, or '' when the PIN was changed */
  changePin?: (oldPin: string, newPin: string) => Promise<string>;
}

const DataContext = createContext<DataValue | null>(null);

export function useData(): DataValue {
  const v = useContext(DataContext);
  if (!v) throw new Error('useData must be used inside DataProvider');
  return v;
}

function useToday(): string {
  const [today, setToday] = useState(todayYmd());
  useEffect(() => {
    const check = () => setToday((t) => (t === todayYmd() ? t : todayYmd()));
    const timer = setInterval(check, 60000);
    document.addEventListener('visibilitychange', check);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);
  return today;
}

function useOnline(): boolean {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export function DataProvider({
  store,
  account = '',
  signOut,
  lock,
  changePin,
  onWriteError,
  children,
}: {
  store: Store;
  account?: string;
  signOut?: () => void;
  lock?: () => void;
  changePin?: (oldPin: string, newPin: string) => Promise<string>;
  onWriteError: (message: string) => void;
  children: ReactNode;
}) {
  const [rows, setRows] = useState<Partial<Record<Col, Row[]>>>({});
  const [infos, setInfos] = useState<Partial<Record<Col, SnapshotInfo>>>({});
  const [loadError, setLoadError] = useState('');
  const today = useToday();
  const online = useOnline();

  useEffect(() => {
    setRows({});
    setInfos({});
    setLoadError('');
    store.onWriteError = (e) => onWriteError(`A change could not be saved to the cloud: ${e.message}`);
    const stops = COLLECTIONS.map((col) =>
      store.subscribe(
        col,
        (list, info) => {
          setRows((r) => ({ ...r, [col]: list }));
          setInfos((i) => (i[col]?.fromCache === info.fromCache && i[col]?.pending === info.pending ? i : { ...i, [col]: info }));
        },
        (e) => setLoadError(e.message || 'The records could not be loaded.'),
      ),
    );
    return () => stops.forEach((stop) => stop());
    // onWriteError is a stable notice function
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store]);

  const ready = COLLECTIONS.every((col) => rows[col] !== undefined);

  const records: Records = useMemo(() => {
    const pick = <K extends keyof Records>(col: K): Records[K] => (rows[col] as unknown as Records[K]) ?? EMPTY_RECORDS[col];
    return {
      customers: pick('customers'),
      orders: pick('orders'),
      products: pick('products'),
      payments: pick('payments'),
      expenses: pick('expenses'),
      notes: pick('notes'),
      items: pick('items'),
      purchases: pick('purchases'),
      sales: pick('sales'),
      adjustments: pick('adjustments'),
      capital: pick('capital'),
    };
  }, [rows]);

  const settingsRow = useMemo(() => {
    const row = rows.settings?.find((r) => r.id === 'main');
    if (!row) return null;
    const { id: _id, ...rest } = row;
    return rest as Partial<Settings>;
  }, [rows.settings]);

  // Defaults are filled in here, in memory. They are never written back, so opening the app on a
  // new device (or with no signal) can never overwrite the stored settings with defaults.
  const settings: Settings = useMemo(() => {
    const out = { ...DEFAULT_SETTINGS };
    if (settingsRow)
      for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
        const v = settingsRow[key];
        if (Array.isArray(DEFAULT_SETTINGS[key]) ? Array.isArray(v) && v.length > 0 : typeof v === 'string' && v !== '') (out as Record<string, unknown>)[key] = v;
        else if (key === 'phone' && typeof v === 'string') out.phone = v;
      }
    return out;
  }, [settingsRow]);

  const current = useRef(records);
  current.current = records;
  const actions = useMemo(() => makeActions(store, () => current.current), [store]);

  const derived = useMemo(() => {
    const byRef = paymentsByRef(records.payments);
    return {
      byRef,
      customersById: new Map(records.customers.map((c) => [c.id, c])),
      itemsById: new Map(records.items.map((i) => [i.id, i])),
      levels: stockLevels(records.items, records.purchases, records.sales, records.adjustments),
      orderTotalsById: new Map(records.orders.map((o) => [o.id, orderTotals(o, byRef.get(o.id), today)])),
    };
  }, [records, today]);

  const sync: SyncState =
    store.kind === 'device'
      ? 'device'
      : !online
        ? 'offline'
        : Object.values(infos).some((i) => i?.pending)
          ? 'sending'
          : Object.values(infos).some((i) => i?.fromCache)
            ? 'offline'
            : 'saved';

  const value: DataValue = { ...records, ...derived, settings, settingsRow, ready, loadError, sync, storeKind: store.kind, account, today, actions, signOut, lock, changePin };
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}
