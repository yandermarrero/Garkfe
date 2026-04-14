import Dexie, { Table } from 'dexie';

export interface Store {
  id?: number;
  name: string;
}

export interface Product {
  id?: number;
  name: string;
  price: number;
  costPrice?: number;
  category?: string;
  minStock?: number;
  unit?: string;
}

export interface InventoryItem {
  id?: number;
  storeId: number;
  productId: number;
  quantity: number;
  costPrice?: number;
  dateAdded?: string;
}

export interface TransactionItem {
  productId: number;
  quantity: number;
  price: number;
  costPrice?: number;
}

export interface Transaction {
  id?: number;
  type: 'sale' | 'consignment';
  date: string;
  fromStoreId: number;
  toStoreId?: number;
  customerName?: string;
  totalAmount: number;
  items: TransactionItem[];
  cashAmount?: number;
  transferAmount?: number;
  creditAmount?: number;
  extraExpense?: number;
  extraExpenseAccount?: 'cash' | 'transfer';
  extraIncome?: number;
  extraIncomeAccount?: 'cash' | 'transfer';
  shortage?: number;
  surplus?: number;
  shrinkage?: number;
}

export interface Expense {
  id?: number;
  storeId: number;
  date: string;
  description: string;
  amount: number;
  type?: 'expense' | 'income' | 'debt_payment';
  paymentMethod?: 'cash' | 'transfer';
  transactionId?: number;
  purchaseId?: number;
  debtId?: number;
  debtType?: 'payment' | 'collection';
}

export interface Debt {
  id?: number;
  creditorStoreId?: number;
  debtorStoreId?: number;
  debtorName?: string;
  creditorName?: string;
  supplierId?: number;
  transactionId?: number;
  purchaseId?: number;
  amount: number;
  paidAmount?: number;
  paidCash?: number;
  paidTransfer?: number;
  status: 'pending' | 'paid';
  date: string;
  type?: 'receivable' | 'payable';
  description?: string;
}

export interface Supplier {
  id?: number;
  name: string;
  contact?: string;
  phone?: string;
  type?: 'supplier' | 'customer';
}

export interface PurchaseItem {
  productId: number;
  quantity: number;
  costPrice: number;
}

export interface Purchase {
  id?: number;
  storeId: number;
  supplierId: number;
  date: string;
  totalAmount: number;
  items: PurchaseItem[];
  paymentStatus: 'paid' | 'credit';
  paymentMethod?: 'cash' | 'transfer';
  extraExpense?: number;
  extraExpenseAccount?: 'cash' | 'transfer';
  extraIncome?: number;
  extraIncomeAccount?: 'cash' | 'transfer';
  type?: 'purchase' | 'consignment';
}

export interface Treasury {
  id?: number;
  storeId: number;
  date: string;
  initialCapital: number;
  initialCapitalCash?: number;
  initialCapitalTransfer?: number;
  notes?: string;
}

export interface InventoryAdjustment {
  id?: number;
  storeId: number;
  productId: number;
  quantity: number;
  type: 'add' | 'remove';
  date: string;
  costPrice?: number;
  reason?: string;
}

export interface StorePrice {
  id?: number;
  storeId: number;
  productId: number;
  price: number;
}

export interface User {
  id?: number;
  username: string;
  password: string;
  name: string;
  role: 'admin' | 'guest';
}

export class InventoryDB extends Dexie {
  stores!: Table<Store>;
  products!: Table<Product>;
  inventory!: Table<InventoryItem>;
  transactions!: Table<Transaction>;
  expenses!: Table<Expense>;
  debts!: Table<Debt>;
  suppliers!: Table<Supplier>;
  purchases!: Table<Purchase>;
  treasury!: Table<Treasury>;
  storePrices!: Table<StorePrice>;
  users!: Table<User>;
  inventoryAdjustments!: Table<InventoryAdjustment>;

  constructor() {
    super('InventoryDB');
    this.version(1).stores({
      stores: '++id, name',
      products: '++id, name',
      inventory: '++id, storeId, productId, [storeId+productId]',
      transactions: '++id, type, date, fromStoreId, toStoreId',
      expenses: '++id, storeId, date',
      debts: '++id, creditorStoreId, debtorStoreId, status, date'
    });
    this.version(2).stores({
      stores: '++id, name',
      products: '++id, name',
      inventory: '++id, storeId, productId, [storeId+productId]',
      transactions: '++id, type, date, fromStoreId, toStoreId',
      expenses: '++id, storeId, date',
      debts: '++id, creditorStoreId, debtorStoreId, status, date',
      suppliers: '++id, name',
      purchases: '++id, storeId, supplierId, date, paymentStatus'
    });
    this.version(3).stores({
      stores: '++id, name',
      products: '++id, name',
      inventory: '++id, storeId, productId, [storeId+productId]',
      transactions: '++id, type, date, fromStoreId, toStoreId',
      expenses: '++id, storeId, date',
      debts: '++id, creditorStoreId, debtorStoreId, status, date',
      suppliers: '++id, name, type',
      purchases: '++id, storeId, supplierId, date, paymentStatus',
      treasury: '++id, storeId, date'
    });
    this.version(4).stores({
      stores: '++id, name',
      products: '++id, name',
      inventory: '++id, storeId, productId, [storeId+productId]',
      transactions: '++id, type, date, fromStoreId, toStoreId',
      expenses: '++id, storeId, date',
      debts: '++id, creditorStoreId, debtorStoreId, status, date',
      suppliers: '++id, name, type',
      purchases: '++id, storeId, supplierId, date, paymentStatus',
      treasury: '++id, storeId, date',
      storePrices: '++id, storeId, productId, [storeId+productId]'
    });
    this.version(7).stores({
      stores: '++id, name',
      products: '++id, name',
      inventory: '++id, storeId, productId, [storeId+productId]',
      transactions: '++id, type, date, fromStoreId, toStoreId',
      expenses: '++id, storeId, date, transactionId, purchaseId',
      debts: '++id, creditorStoreId, debtorStoreId, status, date, transactionId, purchaseId',
      suppliers: '++id, name, type',
      purchases: '++id, storeId, supplierId, date, paymentStatus',
      treasury: '++id, storeId, date',
      storePrices: '++id, storeId, productId, [storeId+productId]',
      users: '++id, username, role'
    });
    this.version(8).stores({
      stores: '++id, name',
      products: '++id, name',
      inventory: '++id, storeId, productId, [storeId+productId]',
      transactions: '++id, type, date, fromStoreId, toStoreId',
      expenses: '++id, storeId, date, transactionId, purchaseId, debtId',
      debts: '++id, creditorStoreId, debtorStoreId, status, date, transactionId, purchaseId',
      suppliers: '++id, name, type',
      purchases: '++id, storeId, supplierId, date, paymentStatus',
      treasury: '++id, storeId, date',
      storePrices: '++id, storeId, productId, [storeId+productId]',
      users: '++id, username, role'
    });
    this.version(9).stores({
      stores: '++id, name',
      products: '++id, name',
      inventory: '++id, storeId, productId, [storeId+productId]',
      transactions: '++id, type, date, fromStoreId, toStoreId',
      expenses: '++id, storeId, date, transactionId, purchaseId, debtId',
      debts: '++id, creditorStoreId, debtorStoreId, status, date, transactionId, purchaseId',
      suppliers: '++id, name, type',
      purchases: '++id, storeId, supplierId, date, paymentStatus',
      treasury: '++id, storeId, date',
      storePrices: '++id, storeId, productId, [storeId+productId]',
      users: '++id, username, role',
      inventoryAdjustments: '++id, storeId, productId, date'
    });
  }
}

export const db = new InventoryDB();
