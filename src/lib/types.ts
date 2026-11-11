// Every record type the app keeps. Figures such as "paid", "balance" or "in stock" are NOT stored:
// they are always worked out from the payments and stock movements (see orders.ts and stock.ts).

export type Section = 'bake' | 'hardware';

export interface Base {
  id: string;
  createdAt: number;
  updatedAt: number;
}

export interface Customer extends Base {
  section: Section;
  name: string;
  phone?: string;
  place?: string;
  /** A date worth remembering, e.g. a birthday, as 'MM-DD' */
  specialDay?: string;
  specialDayNote?: string;
  notes?: string;
  archived?: boolean;
}

export interface OrderItem {
  what: string;
  qty: number;
  price: number; // each
  /** Set when the item was picked from the product list, so a renamed product still matches */
  productId?: string;
}

/** Something Bake Away sells again and again, with its usual price and what it usually costs to make one. */
export interface Product extends Base {
  name: string;
  price: number;
  cost: number;
  archived?: boolean;
}

export const ORDER_STAGES = ['Booked', 'Ready', 'Delivered', 'Cancelled'] as const;
export type OrderStage = (typeof ORDER_STAGES)[number];

export interface Order extends Base {
  number: string; // BA-0001
  customerId?: string;
  customerName: string; // kept as typed; the customer record's name is shown when there is one
  phone?: string;
  date: string; // when the order was taken
  dueDate: string; // when it is needed
  dueTime?: string; // 'HH:MM'
  items: OrderItem[];
  delivery: 'Pick up' | 'Delivery';
  place?: string;
  deliveryFee?: number;
  discount?: number;
  stage: OrderStage;
  notes?: string;
}

export type PaymentKind = 'order' | 'sale' | 'purchase';

/** Money received on an order or a sale, or money paid to a supplier on a stock purchase. */
export interface Payment extends Base {
  kind: PaymentKind;
  refId: string;
  section: Section;
  amount: number;
  date: string;
  method: string;
  note?: string;
}

export interface Expense extends Base {
  section: Section;
  date: string;
  category: string;
  description: string;
  amount: number;
  paidTo?: string;
  /** Bake Away only: the order this cost was for */
  orderId?: string;
  /** Bake Away only: which ingredient was bought (from the ingredient list in Settings) */
  ingredient?: string;
  /** How much was bought, as typed: "2 trays", "5 kg" */
  qtyNote?: string;
  note?: string;
}

export interface Note extends Base {
  section: Section;
  title: string;
  body?: string;
  /** A day this note is for (a reminder, a future booking to follow up) */
  date?: string;
  pinned?: boolean;
  done?: boolean;
}

export interface Item extends Base {
  name: string;
  category: string;
  unit: string;
  sellPrice: number;
  reorderLevel: number;
  archived?: boolean;
}

export interface Line {
  itemId: string;
  qty: number;
  price: number; // each: cost on a purchase, selling price on a sale
}

export interface Purchase extends Base {
  date: string;
  supplier: string;
  lines: Line[];
  /** Stock already in the shop when the records started: counts as stock, not as money owed to a supplier */
  opening?: boolean;
  note?: string;
}

export interface Sale extends Base {
  number: string; // HW-0001
  date: string;
  customerId?: string;
  customerName: string;
  lines: Line[];
  discount?: number;
  note?: string;
}

export interface Adjustment extends Base {
  date: string;
  itemId: string;
  qty: number; // + found, - lost / damaged / used
  reason: string;
}

export interface Capital extends Base {
  section: Section;
  date: string;
  direction: 'in' | 'out';
  amount: number;
  note?: string;
}

export interface Settings {
  ownerName: string;
  phone: string;
  bakeName: string;
  hardwareName: string;
  currency: string;
  methods: string[];
  bakeCategories: string[];
  ingredients: string[];
  hardwareCategories: string[];
  itemCategories: string[];
  units: string[];
}

export const DEFAULT_SETTINGS: Settings = {
  ownerName: 'Evelyn',
  phone: '',
  bakeName: 'Bake Away',
  hardwareName: 'Hardware',
  currency: 'UGX',
  methods: ['Cash', 'Mobile Money', 'Bank'],
  bakeCategories: ['Ingredients', 'Packaging', 'Labour', 'Transport', 'Gas and power', 'Equipment', 'Other'],
  ingredients: [
    'Wheat flour',
    'Sugar',
    'Eggs',
    'Margarine / butter',
    'Baking powder',
    'Milk',
    'Cooking oil',
    'Icing sugar',
    'Cocoa powder',
    'Vanilla essence',
    'Food colour',
    'Yeast',
    'Whipping cream',
    'Fondant',
    'Fruit and nuts',
    'Salt',
  ],
  hardwareCategories: ['Rent', 'Transport', 'Wages', 'Power and water', 'Licences', 'Repairs', 'Other'],
  itemCategories: ['Cement and building', 'Paint', 'Plumbing', 'Electrical', 'Tools', 'Nails and fixings', 'Other'],
  units: ['pc', 'bag', 'kg', 'litre', 'metre', 'box', 'roll', 'tin'],
};

/** Suggestions for the product list; Evelyn starts from these or types her own. */
export const SUGGESTED_PRODUCTS = ['Birthday cake 1 kg', 'Birthday cake 2 kg', 'Wedding cake', 'Cupcakes (dozen)', 'Queen cakes (dozen)', 'Cookies (pack)', 'Banana bread', 'Bread loaf', 'Doughnuts (dozen)', 'Mandazi (dozen)'];

/** Collections kept in the store. 'settings' holds one record with id 'main'. */
export const COLLECTIONS = [
  'customers',
  'orders',
  'products',
  'payments',
  'expenses',
  'notes',
  'items',
  'purchases',
  'sales',
  'adjustments',
  'capital',
  'settings',
] as const;
export type Col = (typeof COLLECTIONS)[number];

export interface Records {
  customers: Customer[];
  orders: Order[];
  products: Product[];
  payments: Payment[];
  expenses: Expense[];
  notes: Note[];
  items: Item[];
  purchases: Purchase[];
  sales: Sale[];
  adjustments: Adjustment[];
  capital: Capital[];
}

export const EMPTY_RECORDS: Records = {
  customers: [],
  orders: [],
  products: [],
  payments: [],
  expenses: [],
  notes: [],
  items: [],
  purchases: [],
  sales: [],
  adjustments: [],
  capital: [],
};
