import { useState, useMemo, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { formatCurrency } from '../lib/utils';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useStoreContext } from '../lib/StoreContext';
import { Download, FileText, PieChart, DollarSign, Users, Lock } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { useTheme } from '../lib/ThemeContext';

export default function Reports() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const isGuest = user?.role === 'guest';
  const { activeStoreId } = useStoreContext();
  const [reportStoreId, setReportStoreId] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'summary' | 'balance' | 'pl' | 'debts'>('summary');
  const [debtFilter, setDebtFilter] = useState('');
  
  const [startDate, setStartDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });

  useEffect(() => {
    if (activeStoreId) {
      setReportStoreId(activeStoreId.toString());
    } else {
      setReportStoreId('all');
    }
  }, [activeStoreId]);

  const stores = useLiveQuery(() => db.stores.toArray());
  const transactions = useLiveQuery(() => db.transactions.toArray());
  const expenses = useLiveQuery(() => db.expenses.toArray());
  const inventory = useLiveQuery(() => db.inventory.toArray());
  const debts = useLiveQuery(() => db.debts.toArray());
  const treasury = useLiveQuery(() => db.treasury.toArray());
  const suppliers = useLiveQuery(() => db.suppliers.toArray());
  const purchases = useLiveQuery(() => db.purchases.toArray());
  const adjustments = useLiveQuery(() => db.inventoryAdjustments.toArray());

  const reportData = useMemo(() => {
    if (!transactions || !expenses || !stores) return null;

    const start = startDate ? new Date(startDate + 'T00:00:00') : new Date(0);
    const end = endDate ? new Date(endDate + 'T23:59:59.999') : new Date('2100-01-01');

    const filteredTxs = transactions.filter(t => {
      const d = new Date(t.date);
      const inDateRange = d >= start && d <= end;
      const inStore = reportStoreId === 'all' || t.fromStoreId === parseInt(reportStoreId);
      return inDateRange && inStore;
    });

    const filteredExps = expenses.filter(e => {
      const d = new Date(e.date);
      const inDateRange = d >= start && d <= end;
      const inStore = reportStoreId === 'all' || e.storeId === parseInt(reportStoreId);
      
      // We exclude debt payments (abonos/cobros) from the P&L as they are balance sheet movements
      const isDebtPayment = e.type === 'debt_payment' || !!e.debtId || 
                           e.description.startsWith('Abono a cuenta:') || 
                           e.description.startsWith('Pago a cuenta (Inter-sucursal):') ||
                           e.description.startsWith('Cobro a cuenta (Inter-sucursal):');
      
      // We exclude inventory purchases from P&L expenses as inventory is an asset
      const isPurchase = !!e.purchaseId || 
                         e.description.toLowerCase().includes('compra') || 
                         e.description.toLowerCase().includes('mercancia') ||
                         e.description.toLowerCase().includes('mercancía') ||
                         e.description.toLowerCase().includes('suministros') ||
                         e.description.toLowerCase().includes('insumos');
      
      return inDateRange && inStore && !isDebtPayment && !isPurchase;
    });

    let totalDirectSales = 0;
    let totalDirectSalesCash = 0;
    let totalDirectSalesTransfer = 0;
    let totalConsignments = 0;
    let totalConsignmentsCash = 0;
    let totalConsignmentsTransfer = 0;
    
    // Operating Expenses (standalone from Expenses module)
    let totalOperatingExpenses = 0;
    let totalOperatingExpensesCash = 0;
    let totalOperatingExpensesTransfer = 0;
    
    // Transaction-related Expenses (from Sales/Purchases)
    let totalTransactionExpenses = 0;
    let totalTransactionExpensesCash = 0;
    let totalTransactionExpensesTransfer = 0;
    
    // Extra Incomes (both standalone and transaction-related)
    let totalExtraIncome = 0;
    let totalExtraIncomeCash = 0;
    let totalExtraIncomeTransfer = 0;
    
    let totalCostOfGoods = 0;

    filteredTxs.forEach(t => {
      // Gross sales amount
      const pureSales = t.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
      
      let pureCash = t.cashAmount || 0;
      let pureTransfer = t.transferAmount || 0;
      
      // Adjust cash/transfer to get the "pure" sale amount before extra income/expense
      if (t.extraIncome) {
        if (t.extraIncomeAccount === 'transfer') pureTransfer -= t.extraIncome;
        else pureCash -= t.extraIncome;
      }
      if (t.extraExpense) {
        if (t.extraExpenseAccount === 'transfer') pureTransfer += t.extraExpense;
        else pureCash += t.extraExpense;
      }

      if (t.type === 'sale') {
        totalDirectSales += pureSales;
        totalDirectSalesCash += pureCash;
        totalDirectSalesTransfer += pureTransfer;
      }
      else if (t.type === 'consignment') {
        totalConsignments += pureSales;
        totalConsignmentsCash += pureCash;
        totalConsignmentsTransfer += pureTransfer;
      }
      
      t.items.forEach(item => {
        totalCostOfGoods += (item.costPrice || 0) * item.quantity;
      });
    });

    filteredExps.forEach(e => {
      if (e.type === 'income') {
        totalExtraIncome += e.amount;
        if (e.paymentMethod === 'transfer') totalExtraIncomeTransfer += e.amount;
        else totalExtraIncomeCash += e.amount;
      } else {
        // Distinguish between operating expenses and transaction-related ones
        const isTransactionRelated = e.description.includes('en venta #') || 
                                    e.description.includes('Merma/Rotura');
        
        // Skip purchase-related expenses in P&L as inventory is an asset, 
        // and its cost is already handled via Cost of Goods Sold (COGS)
        const isPurchaseRelated = !!e.purchaseId || 
                                  e.description.toLowerCase().includes('compra') ||
                                  e.description.toLowerCase().includes('mercancia') ||
                                  e.description.toLowerCase().includes('mercancía') ||
                                  e.description.toLowerCase().includes('suministros') ||
                                  e.description.toLowerCase().includes('insumos');
        if (isPurchaseRelated) return;
        
        if (isTransactionRelated) {
          totalTransactionExpenses += e.amount;
          if (e.paymentMethod === 'transfer') totalTransactionExpensesTransfer += e.amount;
          else totalTransactionExpensesCash += e.amount;
        } else {
          totalOperatingExpenses += e.amount;
          if (e.paymentMethod === 'transfer') totalOperatingExpensesTransfer += e.amount;
          else totalOperatingExpensesCash += e.amount;
        }
      }
    });

    const totalIncome = totalDirectSales + totalConsignments;
    const totalIncomeCash = totalDirectSalesCash + totalConsignmentsCash;
    const totalIncomeTransfer = totalDirectSalesTransfer + totalConsignmentsTransfer;
    const totalExpenses = totalOperatingExpenses + totalTransactionExpenses;
    const totalExpensesCash = totalOperatingExpensesCash + totalTransactionExpensesCash;
    const totalExpensesTransfer = totalOperatingExpensesTransfer + totalTransactionExpensesTransfer;
    
    const grossProfit = totalIncome - totalCostOfGoods;
    const netIncome = grossProfit + totalExtraIncome - totalExpenses;

    let chartData = [];

    if (reportStoreId === 'all') {
      const storeStats: Record<number, { name: string, directSales: number, consignments: number, expenses: number, extraIncome: number, costOfGoods: number }> = {};
      stores.forEach(s => {
        storeStats[s.id!] = { name: s.name, directSales: 0, consignments: 0, expenses: 0, extraIncome: 0, costOfGoods: 0 };
      });

      filteredTxs.forEach(t => {
        // Point 1: Internal consignments are not Revenue
        if (t.type === 'consignment' && t.toStoreId) return;

        // Point 2: Revenue only from 'sale' items. Merma is handled as an expense.
        const saleItems = t.items.filter(i => i.type !== 'shrinkage');
        const pureSales = saleItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
        
        if (t.type === 'sale' && storeStats[t.fromStoreId]) {
          storeStats[t.fromStoreId].directSales += pureSales;
        } else if (t.type === 'consignment' && storeStats[t.fromStoreId]) {
          storeStats[t.fromStoreId].consignments += pureSales;
        }
        
        if (storeStats[t.fromStoreId]) {
          saleItems.forEach(item => {
            storeStats[t.fromStoreId].costOfGoods += (item.costPrice || 0) * item.quantity;
          });
        }
      });

      filteredExps.forEach(e => {
        if (storeStats[e.storeId]) {
          if (e.type === 'income') {
            storeStats[e.storeId].extraIncome += e.amount;
          } else {
            storeStats[e.storeId].expenses += e.amount;
          }
        }
      });

      chartData = Object.values(storeStats).map(stat => {
        const income = stat.directSales + stat.consignments;
        const gross = income - stat.costOfGoods;
        return {
          name: stat.name,
          'Ventas Directas': stat.directSales,
          'Consignaciones': stat.consignments,
          'Ingresos Extras': stat.extraIncome,
          'Gastos': stat.expenses,
          'Utilidad Neta': gross + stat.extraIncome - stat.expenses
        };
      });
    } else {
      const dateStats: Record<string, { name: string, directSales: number, consignments: number, expenses: number, extraIncome: number, costOfGoods: number }> = {};
      
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        const displayDate = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
        dateStats[dateStr] = { name: displayDate, directSales: 0, consignments: 0, expenses: 0, extraIncome: 0, costOfGoods: 0 };
      }

      filteredTxs.forEach(t => {
        // Point 1: Internal consignments are not Revenue
        if (t.type === 'consignment' && t.toStoreId) return;

        const dateStr = t.date.split('T')[0];
        if (dateStats[dateStr]) {
          // Point 2: Revenue only from 'sale' items
          const saleItems = t.items.filter(i => i.type !== 'shrinkage');
          const pureSales = saleItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
          
          if (t.type === 'sale') dateStats[dateStr].directSales += pureSales;
          else if (t.type === 'consignment') dateStats[dateStr].consignments += pureSales;
          
          saleItems.forEach(item => {
            dateStats[dateStr].costOfGoods += (item.costPrice || 0) * item.quantity;
          });
        }
      });

      filteredExps.forEach(e => {
        const dateStr = e.date.split('T')[0];
        if (dateStats[dateStr]) {
          if (e.type === 'income') {
            dateStats[dateStr].extraIncome += e.amount;
          } else {
            dateStats[dateStr].expenses += e.amount;
          }
        }
      });

      chartData = Object.keys(dateStats).sort().map(key => {
        const stat = dateStats[key];
        const income = stat.directSales + stat.consignments;
        const gross = income - stat.costOfGoods;
        return {
          name: stat.name,
          'Ventas Directas': stat.directSales,
          'Consignaciones': stat.consignments,
          'Ingresos Extras': stat.extraIncome,
          'Gastos': stat.expenses,
          'Utilidad Neta': gross + stat.extraIncome - stat.expenses
        };
      });
    }

    return {
      totalDirectSales,
      totalDirectSalesCash,
      totalDirectSalesTransfer,
      totalConsignments,
      totalConsignmentsCash,
      totalConsignmentsTransfer,
      totalIncome,
      totalIncomeCash,
      totalIncomeTransfer,
      totalCostOfGoods,
      grossProfit,
      totalExpenses,
      totalExpensesCash,
      totalExpensesTransfer,
      totalOperatingExpenses,
      totalOperatingExpensesCash,
      totalOperatingExpensesTransfer,
      totalTransactionExpenses,
      totalTransactionExpensesCash,
      totalTransactionExpensesTransfer,
      totalExtraIncome,
      totalExtraIncomeCash,
      totalExtraIncomeTransfer,
      netIncome,
      chartData
    };
  }, [transactions, expenses, stores, startDate, endDate, reportStoreId]);

  const balanceData = useMemo(() => {
    if (!inventory || !debts || !treasury || !transactions || !expenses || !purchases || !adjustments) return null;
    
    const cutOffDate = endDate ? new Date(endDate + 'T23:59:59.999') : new Date();
    const cutOffTime = cutOffDate.getTime();

    // 1. Calculate Inventory Value at cut-off
    // Start with current inventory
    let inventoryValue = 0;
    
    // We'll calculate it by store
    const storeIds = reportStoreId === 'all' ? stores?.map(s => s.id!) || [] : [parseInt(reportStoreId)];
    
    storeIds.forEach(sId => {
      // Current inventory for this store
      const currentStoreInventory = inventory.filter(i => i.storeId === sId);
      
      // We need to REVERT all movements that happened AFTER cutOffTime
      // Movements that INCREASED stock must be SUBTRACTED
      // Movements that DECREASED stock must be ADDED
      
      let storeValue = currentStoreInventory.reduce((sum, item) => sum + (item.costPrice || 0) * item.quantity, 0);
      
      // Purchases after cutOff (Increased stock -> subtract)
      purchases.filter(p => p.storeId === sId && new Date(p.date).getTime() > cutOffTime).forEach(p => {
        p.items.forEach(item => {
          storeValue -= (item.costPrice || 0) * item.quantity;
        });
      });
      
      // Sales after cutOff (Decreased stock -> add back)
      transactions.filter(t => t.fromStoreId === sId && new Date(t.date).getTime() > cutOffTime).forEach(t => {
        t.items.forEach(item => {
          storeValue += (item.costPrice || 0) * item.quantity;
        });
        // Also if it was an inter-store transfer, the destination store stock increased
      });

      // Inter-store transfers (Inbound to this store after cutOff)
      transactions.filter(t => t.toStoreId === sId && new Date(t.date).getTime() > cutOffTime).forEach(t => {
        t.items.forEach(item => {
          storeValue -= (item.costPrice || 0) * item.quantity;
        });
      });

      // Adjustments after cutOff
      adjustments.filter(a => a.storeId === sId && new Date(a.date).getTime() > cutOffTime).forEach(a => {
        if (a.type === 'add') {
          storeValue -= (a.costPrice || 0) * a.quantity;
        } else {
          storeValue += (a.costPrice || 0) * a.quantity;
        }
      });
      
      inventoryValue += storeValue;
    });

    // 2. Calculate Accounts Receivable & Payable at cut-off
    let accountsReceivable = 0;
    let accountsPayable = 0;
    
    debts.forEach(d => {
      const createdTime = new Date(d.date).getTime();
      if (createdTime > cutOffTime) return; // Ignore if created after cut-off

      // Find all payments for this debt made before or at cut-off
      const debtPayments = expenses.filter(e => e.debtId === d.id && new Date(e.date).getTime() <= cutOffTime);
      const paidAtThatTime = debtPayments.reduce((sum, e) => sum + e.amount, 0);
      const remaining = d.amount - paidAtThatTime;

      if (d.type === 'receivable' || d.creditorStoreId) {
        if (reportStoreId === 'all' || d.creditorStoreId === parseInt(reportStoreId)) {
          accountsReceivable += remaining;
        }
      } else if (d.type === 'payable' || d.debtorStoreId) {
        if (reportStoreId === 'all' || d.debtorStoreId === parseInt(reportStoreId)) {
          accountsPayable += remaining;
        }
      }
    });

    // 3. Calculate Cash (Treasury) at cut-off
    let cashCash = 0;
    let cashTransfer = 0;
    treasury.forEach(t => {
      if (reportStoreId === 'all' || t.storeId === parseInt(reportStoreId)) {
        // Initial capital is usually the start of everything
        cashCash += (t.initialCapitalCash ?? t.initialCapital ?? 0);
        cashTransfer += (t.initialCapitalTransfer ?? 0);
      }
    });

    // Incomes from sales/consignments up to cut-off
    transactions.filter(t => new Date(t.date).getTime() <= cutOffTime).forEach(t => {
      if (reportStoreId === 'all' || t.fromStoreId === parseInt(reportStoreId)) {
        if (t.type === 'sale') {
          cashCash += (t.cashAmount || 0);
          cashTransfer += (t.transferAmount || 0);
        }
      }
    });

    // Incomes/Expenses from expenses table up to cut-off
    expenses.filter(e => new Date(e.date).getTime() <= cutOffTime).forEach(e => {
      if (reportStoreId === 'all' || e.storeId === parseInt(reportStoreId)) {
        // Ignore sales items (redundant)
        if (e.description.includes('en venta #') || e.description.includes('(Venta #')) {
          return;
        }
        if (e.type === 'income' || (e.type === 'debt_payment' && e.debtType === 'collection')) {
          if (e.paymentMethod === 'transfer') cashTransfer += e.amount;
          else cashCash += e.amount;
        } else if (e.type === 'expense' || (e.type === 'debt_payment' && e.debtType === 'payment')) {
          if (e.paymentMethod === 'transfer') cashTransfer -= e.amount;
          else cashCash -= e.amount;
        }
      }
    });

    const cash = cashCash + cashTransfer;
    const totalAssets = cash + inventoryValue + accountsReceivable;
    const totalLiabilities = accountsPayable;
    const equity = totalAssets - totalLiabilities;

    return {
      cash,
      cashCash,
      cashTransfer,
      inventoryValue,
      accountsReceivable,
      totalAssets,
      accountsPayable,
      totalLiabilities,
      equity
    };
  }, [inventory, debts, treasury, transactions, expenses, purchases, adjustments, reportStoreId, endDate]);

  const debtsData = useMemo(() => {
    if (!debts || !suppliers) return { receivables: [], payables: [] };
    
    let filteredDebts = debts;
    if (reportStoreId !== 'all') {
      filteredDebts = debts.filter(d => d.creditorStoreId === parseInt(reportStoreId) || d.debtorStoreId === parseInt(reportStoreId));
    }

    const getPersonName = (d: any) => {
      if (d.supplierId) return suppliers.find(s => s.id === d.supplierId)?.name || 'Desconocido';
      if (d.debtorName) return d.debtorName;
      return 'Desconocido';
    };

    const pendingDebts = filteredDebts.filter(d => d.status === 'pending');
    
    let receivables = pendingDebts.filter(d => d.type === 'receivable' || d.creditorStoreId);
    let payables = pendingDebts.filter(d => d.type === 'payable' || d.debtorStoreId);

    if (debtFilter) {
      const lowerFilter = debtFilter.toLowerCase();
      receivables = receivables.filter(d => getPersonName(d).toLowerCase().includes(lowerFilter));
      payables = payables.filter(d => getPersonName(d).toLowerCase().includes(lowerFilter));
    }

    return {
      receivables: receivables.map(d => ({ ...d, personName: getPersonName(d) })),
      payables: payables.map(d => ({ ...d, personName: getPersonName(d) }))
    };
  }, [debts, suppliers, reportStoreId, debtFilter]);

  const exportToCSV = () => {
    if (!reportData) return;

    const headers = ['Nombre', 'Ventas Directas', 'Consignaciones', 'Ingresos Extras', 'Gastos', 'Utilidad Neta'];
    const csvContent = [
      headers.join(','),
      ...reportData.chartData.map(row => 
        [
          `"${row.name}"`,
          row['Ventas Directas'],
          row['Consignaciones'],
          row['Ingresos Extras'],
          row['Gastos'],
          row['Utilidad Neta']
        ].join(',')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `reporte_${startDate}_${endDate}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      <div className="flex gap-4 border-b border-gray-200 dark:border-slate-800 pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('summary')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-colors whitespace-nowrap ${activeTab === 'summary' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' : 'text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800/50'}`}
        >
          <PieChart className="w-4 h-4" /> Resumen
        </button>
        <button
          onClick={() => setActiveTab('pl')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-colors whitespace-nowrap ${activeTab === 'pl' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' : 'text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800/50'}`}
        >
          <FileText className="w-4 h-4" /> Estado de Resultados
        </button>
        <button
          onClick={() => setActiveTab('balance')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-colors whitespace-nowrap ${activeTab === 'balance' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' : 'text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800/50'}`}
        >
          <DollarSign className="w-4 h-4" /> Balance General
        </button>
        <button
          onClick={() => setActiveTab('debts')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-colors whitespace-nowrap ${activeTab === 'debts' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' : 'text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800/50'}`}
        >
          <Users className="w-4 h-4" /> Cuentas por Cobrar/Pagar
        </button>
      </div>

      <div className="bg-white dark:bg-[#161B22] p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800 flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Punto de Venta</label>
          <select
            value={reportStoreId}
            onChange={(e) => setReportStoreId(e.target.value)}
            className="w-full border border-gray-300 dark:border-slate-700 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
          >
            <option value="all">Todos los puntos de venta</option>
            {stores?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-[150px]">
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Fecha Inicio</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full border border-gray-300 dark:border-slate-700 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
          />
        </div>
        <div className="flex-1 min-w-[150px]">
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Fecha Fin</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full border border-gray-300 dark:border-slate-700 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
          />
        </div>
        <div className="flex-1 min-w-[150px] flex justify-end gap-3 items-center">
          {isGuest && (
            <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 rounded-md border border-amber-200 dark:border-amber-800 text-sm font-medium h-[42px]">
              <Lock className="w-4 h-4" />
              Modo Lectura
            </div>
          )}
          <button
            onClick={exportToCSV}
            disabled={!reportData || reportData.chartData.length === 0}
            className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition-colors disabled:bg-gray-400 dark:disabled:bg-slate-800 disabled:cursor-not-allowed h-[42px]"
          >
            <Download className="w-4 h-4" />
            Exportar CSV
          </button>
        </div>
      </div>

      {activeTab === 'summary' && reportData && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-6">
            <div className="bg-white dark:bg-[#161B22] p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800">
              <p className="text-sm font-medium text-gray-500 dark:text-slate-400 mb-1">Ventas Directas</p>
              <p className="text-xl font-bold text-gray-900 dark:text-slate-100">{formatCurrency(reportData.totalDirectSales)}</p>
              <p className="text-xs text-gray-500 dark:text-slate-500 mt-1">Ef: {formatCurrency(reportData.totalDirectSalesCash)} | Tr: {formatCurrency(reportData.totalDirectSalesTransfer)}</p>
            </div>
            <div className="bg-white dark:bg-[#161B22] p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800">
              <p className="text-sm font-medium text-gray-500 dark:text-slate-400 mb-1">Consignaciones</p>
              <p className="text-xl font-bold text-gray-900 dark:text-slate-100">{formatCurrency(reportData.totalConsignments)}</p>
              <p className="text-xs text-gray-500 dark:text-slate-500 mt-1">Ef: {formatCurrency(reportData.totalConsignmentsCash)} | Tr: {formatCurrency(reportData.totalConsignmentsTransfer)}</p>
            </div>
            <div className="bg-white dark:bg-[#161B22] p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800 bg-green-50 dark:bg-green-900/10">
              <p className="text-sm font-medium text-green-800 dark:text-green-400 mb-1">Ingresos de Ventas</p>
              <p className="text-xl font-bold text-green-900 dark:text-green-300">{formatCurrency(reportData.totalIncome)}</p>
              <p className="text-xs text-green-700 dark:text-green-500 mt-1">Ef: {formatCurrency(reportData.totalIncomeCash)} | Tr: {formatCurrency(reportData.totalIncomeTransfer)}</p>
            </div>
            <div className="bg-white dark:bg-[#161B22] p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800">
              <p className="text-sm font-medium text-gray-500 dark:text-slate-400 mb-1">Costo de Ventas</p>
              <p className="text-xl font-bold text-orange-600 dark:text-orange-400">-{formatCurrency(reportData.totalCostOfGoods)}</p>
            </div>
            <div className="bg-white dark:bg-[#161B22] p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800">
              <p className="text-sm font-medium text-gray-500 dark:text-slate-400 mb-1">Ingresos Extras</p>
              <p className="text-xl font-bold text-green-600 dark:text-green-400">+{formatCurrency(reportData.totalExtraIncome)}</p>
              <p className="text-xs text-gray-500 dark:text-slate-500 mt-1">Ef: {formatCurrency(reportData.totalExtraIncomeCash)} | Tr: {formatCurrency(reportData.totalExtraIncomeTransfer)}</p>
            </div>
            <div className="bg-white dark:bg-[#161B22] p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800">
              <p className="text-sm font-medium text-gray-500 dark:text-slate-400 mb-1">Total Gastos</p>
              <p className="text-xl font-bold text-red-600 dark:text-red-400">-{formatCurrency(reportData.totalExpenses)}</p>
              <p className="text-xs text-gray-500 dark:text-slate-500 mt-1">Ef: {formatCurrency(reportData.totalExpensesCash)} | Tr: {formatCurrency(reportData.totalExpensesTransfer)}</p>
            </div>
            <div className="bg-white dark:bg-[#161B22] p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800 bg-blue-50 dark:bg-blue-900/10">
              <p className="text-sm font-medium text-blue-800 dark:text-blue-400 mb-1">Utilidad Neta</p>
              <p className="text-xl font-bold text-blue-900 dark:text-blue-300">{formatCurrency(reportData.netIncome)}</p>
            </div>
          </div>

          <div className="bg-white dark:bg-[#161B22] p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800 h-96">
            <h3 className="text-lg font-medium mb-6 text-slate-900 dark:text-slate-100">
              {reportStoreId === 'all' ? 'Desempeño por Punto de Venta' : 'Desempeño Diario'}
            </h3>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={reportData.chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme === 'dark' ? '#334155' : '#e2e8f0'} />
                <XAxis dataKey="name" stroke={theme === 'dark' ? '#94a3b8' : '#64748b'} fontSize={12} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={(value) => `$${value}`} stroke={theme === 'dark' ? '#94a3b8' : '#64748b'} fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip 
                  formatter={(value: number) => formatCurrency(value)}
                  contentStyle={{ 
                    backgroundColor: theme === 'dark' ? '#1e293b' : '#ffffff', 
                    border: theme === 'dark' ? '1px solid #334155' : '1px solid #e2e8f0', 
                    borderRadius: '12px', 
                    color: theme === 'dark' ? '#f1f5f9' : '#1e293b',
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
                  }}
                  itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
                />
                <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px', fontSize: '12px', fontWeight: 'bold' }} />
                <Bar dataKey="Ventas Directas" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Consignaciones" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Ingresos Extras" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Gastos" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {activeTab === 'pl' && reportData && (
        <div className="bg-white dark:bg-[#161B22] p-8 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800 max-w-3xl mx-auto">
          <h3 className="text-2xl font-bold text-center mb-6 text-slate-900 dark:text-slate-100">Estado de Resultados</h3>
          <p className="text-center text-gray-500 dark:text-slate-400 mb-8">Del {startDate} al {endDate}</p>
          
          <div className="space-y-4">
            <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-slate-800">
              <span className="font-medium text-gray-700 dark:text-slate-300">Ingresos por Ventas</span>
              <div className="text-right">
                <span className="font-medium block text-slate-900 dark:text-slate-100">{formatCurrency(reportData.totalIncome)}</span>
                <span className="text-xs text-gray-500 dark:text-slate-500">Ef: {formatCurrency(reportData.totalIncomeCash)} | Tr: {formatCurrency(reportData.totalIncomeTransfer)}</span>
              </div>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-slate-800">
              <span className="font-medium text-gray-700 dark:text-slate-300">Costo de Ventas</span>
              <span className="font-medium text-red-600 dark:text-red-400">-{formatCurrency(reportData.totalCostOfGoods)}</span>
            </div>
            <div className="flex justify-between items-center py-3 border-b-2 border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 px-2 rounded">
              <span className="font-bold text-gray-900 dark:text-slate-100">Utilidad Bruta</span>
              <span className="font-bold text-slate-900 dark:text-slate-100">{formatCurrency(reportData.grossProfit)}</span>
            </div>
            
            <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-slate-800 mt-4">
              <span className="font-medium text-gray-700 dark:text-slate-300">Ingresos Operativos / Extras</span>
              <div className="text-right">
                <span className="font-medium text-green-600 dark:text-green-400 block">+{formatCurrency(reportData.totalExtraIncome)}</span>
                <span className="text-xs text-gray-500 dark:text-slate-500">Ef: {formatCurrency(reportData.totalExtraIncomeCash)} | Tr: {formatCurrency(reportData.totalExtraIncomeTransfer)}</span>
              </div>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-slate-800">
              <div className="flex flex-col">
                <span className="font-medium text-gray-700 dark:text-slate-300">Gastos Operativos Totales</span>
                <span className="text-xs text-gray-500 dark:text-slate-500">(Incluye gastos fijos, extras en ventas/compras y mermas)</span>
              </div>
              <div className="text-right">
                <span className="font-medium text-red-600 dark:text-red-400 block">-{formatCurrency(reportData.totalExpenses)}</span>
                <span className="text-xs text-gray-500 dark:text-slate-500">Ef: {formatCurrency(reportData.totalExpensesCash)} | Tr: {formatCurrency(reportData.totalExpensesTransfer)}</span>
              </div>
            </div>
            
            <div className="pl-4 space-y-1 border-l-2 border-gray-100 dark:border-slate-800 ml-2">
              <div className="flex justify-between text-xs text-gray-500 dark:text-slate-500">
                <span>• Gastos Fijos / Generales</span>
                <span>{formatCurrency(reportData.totalOperatingExpenses)}</span>
              </div>
              <div className="flex justify-between text-xs text-gray-500 dark:text-slate-500">
                <span>• Gastos Extras en Transacciones</span>
                <span>{formatCurrency(reportData.totalTransactionExpenses)}</span>
              </div>
            </div>
            
            <div className="flex justify-between items-center py-4 border-t-4 border-double border-gray-300 dark:border-slate-700 mt-6 bg-blue-50 dark:bg-blue-900/20 px-4 rounded-lg">
              <span className="text-xl font-bold text-blue-900 dark:text-blue-300">Utilidad Neta</span>
              <div className="text-right flex flex-col items-end">
                <span className="text-xl font-bold text-blue-900 dark:text-blue-300 block">{formatCurrency(reportData.netIncome)}</span>
                <span className="text-[10px] text-blue-700 dark:text-blue-400 font-medium mt-1 uppercase tracking-wider">
                  (Ventas - Costo + Ingresos Extras - Total Gastos)
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'balance' && balanceData && (
        <div className="bg-white dark:bg-[#161B22] p-8 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800 max-w-4xl mx-auto">
          <h3 className="text-2xl font-bold text-center mb-6 text-slate-900 dark:text-slate-100">Balance General</h3>
          <p className="text-center text-gray-500 dark:text-slate-400 mb-8">
            Al {endDate ? new Date(endDate + 'T23:59:59').toLocaleDateString() : new Date().toLocaleDateString()}
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            {/* Activos */}
            <div>
              <h4 className="text-lg font-bold text-gray-800 dark:text-slate-200 border-b-2 border-gray-200 dark:border-slate-700 pb-2 mb-4">Activos</h4>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 dark:text-slate-400">Efectivo y Equivalentes (Caja)</span>
                  <div className="text-right">
                    <span className="font-medium block text-slate-900 dark:text-slate-100">{formatCurrency(balanceData.cash)}</span>
                    <span className="text-xs text-gray-500 dark:text-slate-500">Ef: {formatCurrency(balanceData.cashCash)} | Tr: {formatCurrency(balanceData.cashTransfer)}</span>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 dark:text-slate-400">Cuentas por Cobrar</span>
                  <span className="font-medium text-slate-900 dark:text-slate-100">{formatCurrency(balanceData.accountsReceivable)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 dark:text-slate-400">Inventario</span>
                  <span className="font-medium text-slate-900 dark:text-slate-100">{formatCurrency(balanceData.inventoryValue)}</span>
                </div>
                <div className="flex justify-between items-center pt-3 border-t border-gray-200 dark:border-slate-700 font-bold text-slate-900 dark:text-slate-100">
                  <span>Total Activos</span>
                  <span>{formatCurrency(balanceData.totalAssets)}</span>
                </div>
              </div>
            </div>

            {/* Pasivos y Patrimonio */}
            <div>
              <h4 className="text-lg font-bold text-gray-800 dark:text-slate-200 border-b-2 border-gray-200 dark:border-slate-700 pb-2 mb-4">Pasivos</h4>
              <div className="space-y-3 mb-8">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 dark:text-slate-400">Cuentas por Pagar</span>
                  <span className="font-medium text-slate-900 dark:text-slate-100">{formatCurrency(balanceData.accountsPayable)}</span>
                </div>
                <div className="flex justify-between items-center pt-3 border-t border-gray-200 dark:border-slate-700 font-bold text-slate-900 dark:text-slate-100">
                  <span>Total Pasivos</span>
                  <span>{formatCurrency(balanceData.totalLiabilities)}</span>
                </div>
              </div>

              <h4 className="text-lg font-bold text-gray-800 dark:text-slate-200 border-b-2 border-gray-200 dark:border-slate-700 pb-2 mb-4">Patrimonio</h4>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 dark:text-slate-400">Capital y Utilidades Retenidas</span>
                  <span className="font-medium text-slate-900 dark:text-slate-100">{formatCurrency(balanceData.equity)}</span>
                </div>
                <div className="flex justify-between items-center pt-3 border-t border-gray-200 dark:border-slate-700 font-bold text-slate-900 dark:text-slate-100">
                  <span>Total Patrimonio</span>
                  <span>{formatCurrency(balanceData.equity)}</span>
                </div>
              </div>
            </div>
          </div>
          
          <div className="mt-8 pt-4 border-t-4 border-double border-gray-300 dark:border-slate-700 flex justify-between items-center bg-gray-50 dark:bg-slate-800/50 px-6 py-4 rounded-lg">
            <span className="text-lg font-bold text-gray-800 dark:text-slate-100">Total Pasivos + Patrimonio</span>
            <span className="text-lg font-bold text-gray-800 dark:text-slate-100">{formatCurrency(balanceData.totalLiabilities + balanceData.equity)}</span>
          </div>
        </div>
      )}

      {activeTab === 'debts' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-[#161B22] p-4 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800">
            <input
              type="text"
              placeholder="Filtrar por nombre de cliente o proveedor..."
              value={debtFilter}
              onChange={(e) => setDebtFilter(e.target.value)}
              className="w-full border border-gray-300 dark:border-slate-700 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
            />
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-[#161B22] rounded-xl shadow-sm border border-gray-100 dark:border-slate-800 overflow-hidden">
              <div className="bg-green-50 dark:bg-green-900/20 p-4 border-b border-green-100 dark:border-green-800">
                <h3 className="text-lg font-bold text-green-800 dark:text-green-400">Cuentas por Cobrar</h3>
              </div>
              <div className="p-0">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-slate-800/50 border-b border-gray-200 dark:border-slate-700">
                      <th className="px-4 py-2 text-sm font-semibold text-gray-600 dark:text-slate-400">Deudor</th>
                      <th className="px-4 py-2 text-sm font-semibold text-gray-600 dark:text-slate-400">Fecha</th>
                      <th className="px-4 py-2 text-sm font-semibold text-gray-600 dark:text-slate-400 text-right">Monto Pendiente</th>
                    </tr>
                  </thead>
                  <tbody>
                    {debtsData.receivables.map(d => (
                      <tr key={d.id} className="border-b border-gray-100 dark:border-slate-800 last:border-0 hover:bg-gray-50 dark:hover:bg-slate-800/30 transition-colors">
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-slate-100 font-medium">{d.personName}</td>
                        <td className="px-4 py-3 text-sm text-gray-500 dark:text-slate-500">{new Date(d.date).toLocaleDateString()}</td>
                        <td className="px-4 py-3 text-sm font-bold text-green-600 dark:text-green-400 text-right">{formatCurrency(d.amount - (d.paidAmount || 0))}</td>
                      </tr>
                    ))}
                    {debtsData.receivables.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-4 py-6 text-center text-gray-500 dark:text-slate-500">No hay cuentas por cobrar pendientes.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white dark:bg-[#161B22] rounded-xl shadow-sm border border-gray-100 dark:border-slate-800 overflow-hidden">
              <div className="bg-red-50 dark:bg-red-900/20 p-4 border-b border-red-100 dark:border-red-800">
                <h3 className="text-lg font-bold text-red-800 dark:text-red-400">Cuentas por Pagar</h3>
              </div>
              <div className="p-0">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-slate-800/50 border-b border-gray-200 dark:border-slate-700">
                      <th className="px-4 py-2 text-sm font-semibold text-gray-600 dark:text-slate-400">Acreedor</th>
                      <th className="px-4 py-2 text-sm font-semibold text-gray-600 dark:text-slate-400">Fecha</th>
                      <th className="px-4 py-2 text-sm font-semibold text-gray-600 dark:text-slate-400 text-right">Monto Pendiente</th>
                    </tr>
                  </thead>
                  <tbody>
                    {debtsData.payables.map(d => (
                      <tr key={d.id} className="border-b border-gray-100 dark:border-slate-800 last:border-0 hover:bg-gray-50 dark:hover:bg-slate-800/30 transition-colors">
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-slate-100 font-medium">{d.personName}</td>
                        <td className="px-4 py-3 text-sm text-gray-500 dark:text-slate-500">{new Date(d.date).toLocaleDateString()}</td>
                        <td className="px-4 py-3 text-sm font-bold text-red-600 dark:text-red-400 text-right">{formatCurrency(d.amount - (d.paidAmount || 0))}</td>
                      </tr>
                    ))}
                    {debtsData.payables.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-4 py-6 text-center text-gray-500 dark:text-slate-500">No hay cuentas por pagar pendientes.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
