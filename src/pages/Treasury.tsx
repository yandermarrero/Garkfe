import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { formatCurrency, cn } from '../lib/utils';
import { useStoreContext } from '../lib/StoreContext';
import { Link } from 'react-router-dom';
import { Wallet, ArrowUpRight, ArrowDownRight, Calendar, Search, Edit2, Save, X, ExternalLink, Banknote, CreditCard, Lock, Settings2 } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';

export default function Treasury() {
  const { user } = useAuth();
  const isGuest = user?.role === 'guest';
  const { activeStoreId } = useStoreContext();
  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });

  const [filterMethod, setFilterMethod] = useState<'all' | 'cash' | 'transfer'>('all');

  const [isEditingCapital, setIsEditingCapital] = useState(false);
  const [newCapitalCash, setNewCapitalCash] = useState('');
  const [newCapitalTransfer, setNewCapitalTransfer] = useState('');

  const [isAdjustingBalance, setIsAdjustingBalance] = useState(false);
  const [adjustData, setAdjustData] = useState({ amount: '', method: 'cash' as 'cash' | 'transfer', type: 'expense' as 'expense' | 'income', reason: 'Ajuste manual de saldo' });

  const setQuickFilter = (type: 'today' | 'week' | 'month' | 'yeartodate' | 'last30') => {
    const end = new Date();
    let start = new Date();
    
    switch (type) {
      case 'today':
        start.setHours(0, 0, 0, 0);
        break;
      case 'week':
        start.setDate(end.getDate() - 7);
        break;
      case 'month':
        start.setDate(1);
        break;
      case 'yeartodate':
        start.setMonth(0, 1);
        break;
      case 'last30':
        start.setDate(end.getDate() - 30);
        break;
    }
    
    setDateRange({
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0]
    });
  };

  const treasuryRecord = useLiveQuery(
    () => activeStoreId ? db.treasury.where({ storeId: activeStoreId }).first() : undefined,
    [activeStoreId]
  );

  const transactions = useLiveQuery(() => db.transactions.toArray());
  const expenses = useLiveQuery(() => db.expenses.toArray());
  const purchases = useLiveQuery(() => db.purchases.toArray());
  const stores = useLiveQuery(() => db.stores.toArray());

  const handleSaveCapital = async () => {
    if (!activeStoreId) return;
    const cash = parseFloat(newCapitalCash) || 0;
    const transfer = parseFloat(newCapitalTransfer) || 0;
    const total = cash + transfer;

    if (treasuryRecord) {
      await db.treasury.update(treasuryRecord.id!, { 
        initialCapital: total,
        initialCapitalCash: cash,
        initialCapitalTransfer: transfer
      });
    } else {
      await db.treasury.add({
        storeId: activeStoreId,
        date: new Date().toISOString(),
        initialCapital: total,
        initialCapitalCash: cash,
        initialCapitalTransfer: transfer
      });
    }
    setIsEditingCapital(false);
  };

  const handleAdjustBalance = async () => {
    if (!activeStoreId) return;
    const amount = parseFloat(adjustData.amount);
    if (isNaN(amount) || amount <= 0) return;

    await db.expenses.add({
      storeId: activeStoreId,
      date: new Date().toISOString(),
      description: adjustData.reason,
      amount: amount,
      type: adjustData.type,
      paymentMethod: adjustData.method
    });

    setIsAdjustingBalance(false);
    setAdjustData({ amount: '', method: 'cash', type: 'expense', reason: 'Ajuste manual de saldo' });
  };

  const startEditing = () => {
    setNewCapitalCash((treasuryRecord?.initialCapitalCash ?? treasuryRecord?.initialCapital ?? 0).toString());
    setNewCapitalTransfer((treasuryRecord?.initialCapitalTransfer ?? 0).toString());
    setIsEditingCapital(true);
  };

  const history = useMemo(() => {
    if (!activeStoreId || !transactions || !expenses || !purchases) return [];

    const start = new Date(dateRange.start);
    start.setHours(0, 0, 0, 0);
    const end = new Date(dateRange.end);
    end.setHours(23, 59, 59, 999);

    const items: { id: number, date: string, type: string, description: string, amount: number, isIncome: boolean, paymentMethod: 'cash' | 'transfer', link: string }[] = [];

    // Sales (Incomes)
    transactions.filter(t => (t.fromStoreId === activeStoreId || t.toStoreId === activeStoreId) && t.type === 'sale').forEach(t => {
      const tDate = new Date(t.date);
      if (tDate >= start && tDate <= end) {
        if (t.cashAmount && t.cashAmount > 0) {
          items.push({
            id: t.id!,
            date: t.date,
            type: 'Venta',
            description: `Venta en efectivo #${t.id} (${t.customerName || 'Cliente'})`,
            amount: t.cashAmount,
            isIncome: true,
            paymentMethod: 'cash',
            link: `/transactions?id=${t.id}`
          });
        }
        if (t.transferAmount && t.transferAmount > 0) {
           items.push({
            id: t.id!,
            date: t.date,
            type: 'Venta (Transf)',
            description: `Venta por transferencia #${t.id} (${t.customerName || 'Cliente'})`,
            amount: t.transferAmount,
            isIncome: true,
            paymentMethod: 'transfer',
            link: `/transactions?id=${t.id}`
          });
        }
      }
    });

    // Expenses/Incomes/Debt Payments
    expenses.filter(e => e.storeId === activeStoreId).forEach(e => {
      // Avoid double counting sale items already in transactions
      if (e.description.includes('en venta #') || e.description.includes('(Venta #')) {
        // BUT keep them if they are extra expenses/surplus that actually change the physical cash
        // Actually, in this app, sales record the total cash/transfer received.
        // We only exclude the sale-related expenses if they ARE the COGS or if they are already accounted.
        // Looking at Sales.tsx, extraExpense is recorded in expenses but NOT subtracted from cashAmt.
        // So we KEEP expenses.
      }

      const eDate = new Date(e.date);
      if (eDate >= start && eDate <= end) {
        let link = '/expenses';
        if (e.transactionId) link = `/transactions?id=${e.transactionId}`;
        if (e.purchaseId) link = `/transactions?id=${e.purchaseId}&type=purchase`;
        if (e.debtId) link = `/debts?id=${e.debtId}`;

        items.push({
          id: e.id!,
          date: e.date,
          type: e.type === 'income' ? 'Ingreso' : (e.type === 'debt_payment' ? 'Abono/Cobro' : 'Gasto'),
          description: e.description,
          amount: e.amount,
          isIncome: e.type === 'income' || (e.type === 'debt_payment' && e.debtType === 'collection'),
          paymentMethod: e.paymentMethod || 'cash',
          link
        });
      }
    });

    // Purchases (Paid at once)
    purchases.filter(p => p.storeId === activeStoreId).forEach(p => {
       // Only count here if it's NOT in expenses (but Purchases.tsx adds it to expenses if paid)
       // So we rely on expenses for the actual money movement.
    });

    return items
      .filter(item => filterMethod === 'all' || item.paymentMethod === filterMethod)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [activeStoreId, transactions, expenses, purchases, dateRange, filterMethod]);

  const initialCash = treasuryRecord?.initialCapitalCash ?? treasuryRecord?.initialCapital ?? 0;
  const initialTransfer = treasuryRecord?.initialCapitalTransfer ?? 0;
  
  const periodIncomeCash = history.filter(h => h.isIncome && h.paymentMethod === 'cash').reduce((sum, h) => sum + h.amount, 0);
  const periodIncomeTransfer = history.filter(h => h.isIncome && h.paymentMethod === 'transfer').reduce((sum, h) => sum + h.amount, 0);
  
  const periodExpenseCash = history.filter(h => !h.isIncome && h.paymentMethod === 'cash').reduce((sum, h) => sum + h.amount, 0);
  const periodExpenseTransfer = history.filter(h => !h.isIncome && h.paymentMethod === 'transfer').reduce((sum, h) => sum + h.amount, 0);
  
  const currentCash = initialCash + periodIncomeCash - periodExpenseCash;
  const currentTransfer = initialTransfer + periodIncomeTransfer - periodExpenseTransfer;
  const currentTotal = currentCash + currentTransfer;

  if (!activeStoreId) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-8rem)]">
        <p className="text-gray-500 dark:text-slate-400 text-lg">Selecciona un punto de venta para ver la tesorería.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-slate-100 italic tracking-tight underline decoration-blue-500 decoration-4 underline-offset-8">Tesorería y Caja</h2>
        {!isGuest && (
          <button 
            onClick={() => setIsAdjustingBalance(true)}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 dark:bg-blue-600 text-white rounded-lg hover:bg-slate-900 dark:hover:bg-blue-700 transition-all shadow-md active:scale-95"
          >
            <Settings2 className="w-4 h-4" />
            Ajustar Saldo Manual
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* EFECTIVO CARD */}
        <div className="bg-white dark:bg-[#161B22] p-8 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 relative overflow-hidden group hover:shadow-xl hover:shadow-emerald-500/5 transition-all">
          <div className="absolute top-0 right-0 p-12 bg-emerald-500/5 rounded-full -mr-8 -mt-8 group-hover:scale-110 transition-transform"></div>
          <div className="flex justify-between items-start mb-6 relative">
             <div>
                <div className="flex items-center gap-2 mb-1">
                  <Banknote className="w-5 h-5 text-emerald-500" />
                  <p className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Cuenta Efectivo</p>
                </div>
                <h3 className="text-4xl font-black text-slate-900 dark:text-slate-100 tracking-tight">{formatCurrency(currentCash)}</h3>
             </div>
             <div className="text-right">
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase mb-1">Periodo</p>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-bold text-green-600 dark:text-green-400 flex items-center gap-1 justify-end">+{formatCurrency(periodIncomeCash)} <ArrowUpRight className="w-3 h-3" /></span>
                  <span className="text-xs font-bold text-red-600 dark:text-red-400 flex items-center gap-1 justify-end">-{formatCurrency(periodExpenseCash)} <ArrowDownRight className="w-3 h-3" /></span>
                </div>
             </div>
          </div>
          
          <div className="pt-4 border-t border-slate-50 dark:border-slate-800/50 flex justify-between items-center text-sm">
             <span className="text-slate-500 dark:text-slate-500">Capital Inicial: <span className="font-bold text-slate-700 dark:text-slate-300">{formatCurrency(initialCash)}</span></span>
             {!isGuest && (
               <button onClick={startEditing} className="text-blue-500 hover:text-blue-600 font-bold flex items-center gap-1 text-xs uppercase tracking-tighter">
                 <Edit2 className="w-3.5 h-3.5" /> Editar Inicial
               </button>
             )}
          </div>
        </div>

        {/* TRANSFERENCIA CARD */}
        <div className="bg-white dark:bg-[#161B22] p-8 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 relative overflow-hidden group hover:shadow-xl hover:shadow-blue-500/5 transition-all">
          <div className="absolute top-0 right-0 p-12 bg-blue-500/5 rounded-full -mr-8 -mt-8 group-hover:scale-110 transition-transform"></div>
          <div className="flex justify-between items-start mb-6 relative">
             <div>
                <div className="flex items-center gap-2 mb-1">
                  <CreditCard className="w-5 h-5 text-blue-500" />
                  <p className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Cuenta Transferencia</p>
                </div>
                <h3 className="text-4xl font-black text-slate-900 dark:text-slate-100 tracking-tight">{formatCurrency(currentTransfer)}</h3>
             </div>
             <div className="text-right">
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase mb-1">Periodo</p>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-bold text-green-600 dark:text-green-400 flex items-center gap-1 justify-end">+{formatCurrency(periodIncomeTransfer)} <ArrowUpRight className="w-3 h-3" /></span>
                  <span className="text-xs font-bold text-red-600 dark:text-red-400 flex items-center gap-1 justify-end">-{formatCurrency(periodExpenseTransfer)} <ArrowDownRight className="w-3 h-3" /></span>
                </div>
             </div>
          </div>

          <div className="pt-4 border-t border-slate-50 dark:border-slate-800/50 flex justify-between items-center text-sm">
             <span className="text-slate-500 dark:text-slate-500">Capital Inicial: <span className="font-bold text-slate-700 dark:text-slate-300">{formatCurrency(initialTransfer)}</span></span>
             {!isGuest && (
               <button onClick={startEditing} className="text-blue-500 hover:text-blue-600 font-bold flex items-center gap-1 text-xs uppercase tracking-tighter">
                 <Edit2 className="w-3.5 h-3.5" /> Editar Inicial
               </button>
             )}
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-[#161B22] rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 overflow-hidden">
        <div className="p-8 border-b border-gray-100 dark:border-slate-800 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6">
          <div>
            <h3 className="text-xl font-black text-slate-900 dark:text-slate-100 tracking-tight">Historial de Afectaciones</h3>
            <p className="text-xs text-slate-500 dark:text-slate-500 uppercase font-bold tracking-widest mt-1">Todos los movimientos que impactan las cuentas</p>
          </div>
          
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full xl:w-auto">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 mr-2">
                <button
                  onClick={() => setFilterMethod('all')}
                  className={cn(
                    "px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all",
                    filterMethod === 'all' 
                      ? "bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm" 
                      : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                  )}
                >
                  Todo
                </button>
                <button
                  onClick={() => setFilterMethod('cash')}
                  className={cn(
                    "px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all",
                    filterMethod === 'cash' 
                      ? "bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm" 
                      : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                  )}
                >
                  Efectivo
                </button>
                <button
                  onClick={() => setFilterMethod('transfer')}
                  className={cn(
                    "px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all",
                    filterMethod === 'transfer' 
                      ? "bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm" 
                      : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                  )}
                >
                  Transf.
                </button>
              </div>
              {['today', 'week', 'month', 'yeartodate'].map((f) => (
                <button 
                  key={f}
                  onClick={() => setQuickFilter(f as any)}
                  className="px-4 py-2 text-xs font-bold bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-all uppercase tracking-tighter border border-slate-200 dark:border-slate-700"
                >
                  {f === 'today' ? 'Hoy' : f === 'week' ? '7 días' : f === 'month' ? 'Mes' : 'Año'}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700">
              <Calendar className="w-4 h-4 text-slate-400 dark:text-slate-500" />
              <input
                type="date"
                value={dateRange.start}
                onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                className="bg-transparent border-none text-sm font-bold text-slate-700 dark:text-slate-300 focus:ring-0 p-0"
              />
              <span className="text-slate-300 dark:text-slate-700 font-bold">→</span>
              <input
                type="date"
                value={dateRange.end}
                onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                className="bg-transparent border-none text-sm font-bold text-slate-700 dark:text-slate-300 focus:ring-0 p-0"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-gray-200 dark:border-slate-800">
                <th className="px-8 py-4 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest pl-10">Fecha / Hora</th>
                <th className="px-8 py-4 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Tipo de Movimiento</th>
                <th className="px-8 py-4 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Descripción / Concepto</th>
                <th className="px-8 py-4 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Cuenta</th>
                <th className="px-8 py-4 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-right">Importe</th>
                <th className="px-8 py-4 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-right pr-10">Vínculo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800/50">
              {history.map((item, idx) => (
                <tr key={idx} className="group hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                  <td className="px-8 py-5 text-sm tabular-nums text-slate-500 dark:text-slate-500 pl-10 font-medium">
                    {new Date(item.date).toLocaleDateString()} <span className="text-[10px] bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded ml-1 italic">{new Date(item.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </td>
                  <td className="px-8 py-5 text-sm">
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter ${
                      item.isIncome ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                    }`}>
                      {item.isIncome ? <ArrowUpRight className="w-3 h-3 mr-1" /> : <ArrowDownRight className="w-3 h-3 mr-1" />}
                      {item.type}
                    </span>
                  </td>
                  <td className="px-8 py-5 text-sm text-slate-900 dark:text-slate-100 font-bold tracking-tight">{item.description}</td>
                  <td className="px-8 py-5 text-sm">
                    {item.paymentMethod === 'cash' ? (
                      <span className="flex items-center gap-2 text-slate-600 dark:text-slate-400 font-medium"><Banknote className="w-4 h-4 text-emerald-500" /> Efectivo</span>
                    ) : (
                      <span className="flex items-center gap-2 text-slate-600 dark:text-slate-400 font-medium"><CreditCard className="w-4 h-4 text-blue-500" /> Transf.</span>
                    )}
                  </td>
                  <td className={`px-8 py-5 text-sm font-black text-right tabular-nums ${item.isIncome ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {item.isIncome ? '+' : '-'}{formatCurrency(item.amount)}
                  </td>
                  <td className="px-8 py-5 text-sm text-right pr-10">
                    <Link to={item.link} className="p-2 text-slate-400 dark:text-slate-600 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-xl transition-all inline-flex items-center gap-2 group/link">
                      <span className="text-[10px] font-black uppercase tracking-widest opacity-0 group-hover/link:opacity-100 transition-opacity">Ir a origen</span>
                      <ExternalLink className="w-4 h-4" />
                    </Link>
                  </td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-8 py-16 text-center text-slate-400 dark:text-slate-600 italic">
                    No se encontraron afectaciones en las cuentas para el periodo seleccionado.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot className="bg-slate-50 dark:bg-slate-800/50 border-t border-gray-200 dark:border-slate-800">
               <tr className="font-black text-slate-900 dark:text-slate-100">
                  <td colSpan={4} className="px-8 py-6 text-sm text-right uppercase tracking-widest">Balance Final Disponible:</td>
                  <td className="px-8 py-6 text-xl text-right tabular-nums underline decoration-blue-500 decoration-2 underline-offset-4">{formatCurrency(currentTotal)}</td>
                  <td className="pr-10"></td>
               </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* ADJUSTMENT MODAL */}
      {isAdjustingBalance && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
              <div>
                <h3 className="text-xl font-black text-slate-900 dark:text-slate-100">Ajuste de Saldo</h3>
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-0.5">Sincronización manual de caja/banco</p>
              </div>
              <button onClick={() => setIsAdjustingBalance(false)} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-8 space-y-6">
               <div className="grid grid-cols-2 gap-4">
                  <button 
                    onClick={() => setAdjustData({...adjustData, type: 'income'})}
                    className={cn(
                      "p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2",
                      adjustData.type === 'income' ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20" : "border-transparent bg-slate-50 dark:bg-slate-800"
                    )}
                  >
                    <ArrowUpRight className={cn("w-6 h-6", adjustData.type === 'income' ? "text-emerald-500" : "text-slate-400")} />
                    <span className="text-[10px] font-black uppercase tracking-widest">Ingreso / Sobrante</span>
                  </button>
                  <button 
                    onClick={() => setAdjustData({...adjustData, type: 'expense'})}
                    className={cn(
                      "p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2",
                      adjustData.type === 'expense' ? "border-red-500 bg-red-50 dark:bg-red-900/20" : "border-transparent bg-slate-50 dark:bg-slate-800"
                    )}
                  >
                    <ArrowDownRight className={cn("w-6 h-6", adjustData.type === 'expense' ? "text-red-500" : "text-slate-400")} />
                    <span className="text-[10px] font-black uppercase tracking-widest">Gasto / Faltante</span>
                  </button>
               </div>

               <div>
                 <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Cuenta a Afectar</label>
                 <div className="flex gap-4">
                    <button 
                      onClick={() => setAdjustData({...adjustData, method: 'cash'})}
                      className={cn(
                        "flex-1 py-3 rounded-xl border font-bold text-sm flex items-center justify-center gap-2 transition-all",
                        adjustData.method === 'cash' ? "bg-emerald-600 border-emerald-600 text-white" : "border-slate-200 dark:border-slate-800 text-slate-500"
                      )}
                    >
                      <Banknote className="w-4 h-4" /> Efectivo
                    </button>
                    <button 
                      onClick={() => setAdjustData({...adjustData, method: 'transfer'})}
                      className={cn(
                        "flex-1 py-3 rounded-xl border font-bold text-sm flex items-center justify-center gap-2 transition-all",
                        adjustData.method === 'transfer' ? "bg-blue-600 border-blue-600 text-white" : "border-slate-200 dark:border-slate-800 text-slate-500"
                      )}
                    >
                      <CreditCard className="w-4 h-4" /> Transferencia
                    </button>
                 </div>
               </div>

               <div>
                 <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Importe del Ajuste</label>
                 <input
                   type="number"
                   value={adjustData.amount}
                   onChange={(e) => setAdjustData({...adjustData, amount: e.target.value})}
                   placeholder="0,00"
                   className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-2xl px-6 py-4 text-xl font-black focus:ring-2 focus:ring-blue-500"
                 />
               </div>

               <div>
                 <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Motivo o Referencia</label>
                 <input
                   type="text"
                   value={adjustData.reason}
                   onChange={(e) => setAdjustData({...adjustData, reason: e.target.value})}
                   className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-2xl px-6 py-4 text-sm font-bold focus:ring-2 focus:ring-blue-500"
                 />
               </div>

               <button 
                 onClick={handleAdjustBalance}
                 className="w-full py-4 bg-slate-900 dark:bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest shadow-xl hover:shadow-blue-500/20 active:scale-95 transition-all mt-4"
               >
                 Registrar Ajuste
               </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT INITIAL CAPITAL MODAL (Original Edit View in modal) */}
      {isEditingCapital && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-md overflow-hidden">
             <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                <h3 className="font-black uppercase tracking-widest text-slate-400">Capital Inicial</h3>
                <button onClick={() => setIsEditingCapital(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full"><X className="w-5 h-5"/></button>
             </div>
             <div className="p-8 space-y-6">
                <div>
                   <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Efectivo Inicial</label>
                   <input type="number" value={newCapitalCash} onChange={(e) => setNewCapitalCash(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-2xl px-6 py-4 font-black" />
                </div>
                <div>
                   <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Transferencia Inicial</label>
                   <input type="number" value={newCapitalTransfer} onChange={(e) => setNewCapitalTransfer(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-2xl px-6 py-4 font-black" />
                </div>
                <button onClick={handleSaveCapital} className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest">Guardar Cambios</button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}
