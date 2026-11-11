// The two parts of the app and their menus, defined once. The sidebar (laptop), the bottom tabs
// (phone), the + button and Home all read from here. A new section = one more entry here plus a
// card on Home.
import {
  Banknote,
  Boxes,
  CakeSlice,
  ChartColumn,
  Cookie,
  HandCoins,
  LayoutDashboard,
  PackagePlus,
  Receipt,
  ShoppingCart,
  StickyNote,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { SheetSpec } from '../components/SheetHost';
import type { Section } from './types';

export interface MenuItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Shown as a bottom tab on the phone (the rest sit under More) */
  tab?: boolean;
}

export interface QuickAction {
  label: string;
  hint: string;
  icon: LucideIcon;
  sheet: SheetSpec;
}

export interface SectionDef {
  key: Section;
  base: string;
  tagline: string;
  menu: MenuItem[];
  quick: QuickAction[];
}

export const SECTIONS: Record<Section, SectionDef> = {
  bake: {
    key: 'bake',
    base: '/bake',
    tagline: 'Orders, customers and baking costs',
    menu: [
      { to: '/bake', label: 'Overview', icon: LayoutDashboard, tab: true },
      { to: '/bake/orders', label: 'Orders', icon: CakeSlice, tab: true },
      { to: '/bake/customers', label: 'Customers', icon: Users, tab: true },
      { to: '/bake/expenses', label: 'Expenses', icon: Receipt, tab: true },
      { to: '/bake/products', label: 'Products', icon: Cookie },
      { to: '/bake/reports', label: 'Profit and reports', icon: ChartColumn },
      { to: '/bake/notes', label: 'Notes', icon: StickyNote },
    ],
    quick: [
      { label: 'New order', hint: 'A cake or bake a customer has asked for', icon: CakeSlice, sheet: { t: 'order' } },
      { label: 'Record a payment', hint: 'Money received on an order', icon: Banknote, sheet: { t: 'pickOwing', kind: 'order' } },
      { label: 'Add an expense', hint: 'Ingredients, labour, transport and the rest', icon: Receipt, sheet: { t: 'expense', section: 'bake' } },
      { label: 'Add a note', hint: 'An idea, a reminder or a future booking', icon: StickyNote, sheet: { t: 'note', section: 'bake' } },
    ],
  },
  hardware: {
    key: 'hardware',
    base: '/hardware',
    tagline: 'Stock, sales and money invested',
    menu: [
      { to: '/hardware', label: 'Overview', icon: LayoutDashboard, tab: true },
      { to: '/hardware/stock', label: 'Stock', icon: Boxes, tab: true },
      { to: '/hardware/sales', label: 'Sales', icon: ShoppingCart, tab: true },
      { to: '/hardware/stock-in', label: 'Stock in', icon: PackagePlus, tab: true },
      { to: '/hardware/customers', label: 'Customers', icon: Users },
      { to: '/hardware/expenses', label: 'Expenses', icon: Receipt },
      { to: '/hardware/money', label: 'Money invested', icon: Wallet },
      { to: '/hardware/reports', label: 'Reports', icon: ChartColumn },
      { to: '/hardware/notes', label: 'Notes', icon: StickyNote },
    ],
    quick: [
      { label: 'New sale', hint: 'Items sold to a customer', icon: ShoppingCart, sheet: { t: 'sale' } },
      { label: 'Stock in', hint: 'Items bought for the shop', icon: PackagePlus, sheet: { t: 'purchase' } },
      { label: 'Record a payment', hint: 'Money received on a credit sale', icon: Banknote, sheet: { t: 'pickOwing', kind: 'sale' } },
      { label: 'Add an expense', hint: 'Rent, transport, wages and the rest', icon: Receipt, sheet: { t: 'expense', section: 'hardware' } },
      { label: 'Money put in or taken out', hint: 'Your own money into or out of the shop', icon: HandCoins, sheet: { t: 'capital' } },
    ],
  },
};

export function sectionForPath(pathname: string): Section | null {
  if (pathname.startsWith('/hardware')) return 'hardware';
  if (pathname.startsWith('/bake')) return 'bake';
  return null;
}

/** The menu item to light up: the longest one that matches the address. */
export function activeItem(menu: MenuItem[], pathname: string): string {
  let best = '';
  for (const m of menu) if ((pathname === m.to || pathname.startsWith(m.to + '/')) && m.to.length > best.length) best = m.to;
  return best;
}

const LAST = 'bakeaway.section';
export function rememberSection(s: Section) {
  try {
    localStorage.setItem(LAST, s);
  } catch {
    /* private mode: nothing to remember */
  }
}
export function lastSection(): Section {
  try {
    return localStorage.getItem(LAST) === 'hardware' ? 'hardware' : 'bake';
  } catch {
    return 'bake';
  }
}
