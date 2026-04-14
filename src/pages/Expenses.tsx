import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { formatCurrency, formatDate, toLocalISO, fromLocalISO } from '../lib/utils';
import { useStoreContext } from '../lib/StoreContext';
import { ArrowDownCircle, ArrowUpCircle, Wallet, Banknote, CreditCard, Lock, Edit, Trash2, AlertTriangle } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';

export default function Expenses() {
  const { user } = useAuth();
  const isGuest = user?.role === 'guest';
  const { activeStoreId } = useStoreContext();
  const stores = useLiveQuery(() => db.stores.toArray());
  const allExpenses = useLiveQuery(() => db.expenses.orderBy('date').reverse().toArray());

  const expenses = activeStoreId 
    ? allExpenses?.filter(e => e.storeId === activeStoreId)
    : allExpenses;

  const [storeId, setStoreId] = useState<string>(activeStoreId.toString());
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer'>('cash');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [filterType, setFilterType] = useState<'all' | 'expense' | 'income'>('all');
  const [filterSource, setFilterSource] = useState<'all' | 'manual' | 'transaction'>('all');
  const [filterName, setFilterName] = useState('');

  const [editingExpense, setEditingExpense] = useState<any | null>(null);
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean, id?: number }>({ isOpen: false });

  useEffect(() => {
    if (activeStoreId) {
      setStoreId(activeStoreId.toString());
    } else {
      setStoreId('');
    }
  }, [activeStoreId]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeId || !description.trim() || !amount) return;

    await db.expenses.add({
      storeId: parseInt(storeId),
      date: new Date().toISOString(),
      description: description.trim(),
      amount: parseFloat(amount),
      type: type,
      paymentMethod: paymentMethod
    });

    setDescription('');
    setAmount('');
    setPaymentMethod('cash');
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingExpense) return;

    await db.expenses.update(editingExpense.id, {
      storeId: editingExpense.storeId,
      date: editingExpense.date,
      description: editingExpense.description,
      amount: parseFloat(editingExpense.amount.toString()),
      type: editingExpense.type,
      paymentMethod: editingExpense.paymentMethod
    });

    setEditingExpense(null);
  };

  const handleDelete = async () => {
    if (deleteModal.id) {
      await db.expenses.delete(deleteModal.id);
      setDeleteModal({ isOpen: false });
    }
  };

  const getStoreName = (id: number) => stores?.find(s => s.id === id)?.name || 'Desconocido';

  const filteredExpenses = expenses?.filter(e => {
    if (startDate) {
      const start = new Date(startDate + 'T00:00:00');
      if (new Date(e.date) < start) return false;
    }
    if (endDate) {
      const end = new Date(endDate + 'T23:59:59.999');
      if (new Date(e.date) > end) return false;
    }
    
    if (filterType !== 'all' && e.type !== filterType) return false;
    
    const isTransaction = e.description.includes('en venta #') || 
                         e.description.includes('en compra #') || 
                         e.description.includes('Merma/Rotura');
    
    if (filterSource === 'manual' && isTransaction) return false;
    if (filterSource === 'transaction' && !isTransaction) return false;
    
    if (filterName && !e.description.toLowerCase().includes(filterName.toLowerCase())) return false;
    
    return true;
  });

  const totalExpenses = filteredExpenses?.filter(e => e.type === 'expense').reduce((sum, e) => sum + e.amount, 0) || 0;
  const totalIncome = filteredExpenses?.filter(e => e.type === 'income').reduce((sum, e) => sum + e.amount, 0) || 0;
  const totalDebtMovements = filteredExpenses?.filter(e => e.type === 'debt_payment').reduce((sum, e) => {
    return sum + (e.debtType === 'collection' ? e.amount : -e.amount);
  }, 0) || 0;
  const balance = totalIncome - totalExpenses + totalDebtMovements;

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-[#161B22] p-4 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800 flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-1">Fecha Inicio</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full border border-gray-300 dark:border-slate-700 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-1">Fecha Fin</label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full border border-gray-300 dark:border-slate-700 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-1">Tipo de Movimiento</label>
          <select 
            value={filterType} 
            onChange={(e) => setFilterType(e.target.value as any)}
            className="w-full border border-gray-300 dark:border-slate-700 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
          >
            <option value="all">Todos los Movimientos</option>
            <option value="expense">Solo Gastos Operativos</option>
            <option value="income">Solo Ingresos Extras</option>
            <option value="debt_payment">Solo Abonos/Cobros de Deuda</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-1">Origen</label>
          <select 
            value={filterSource} 
            onChange={(e) => setFilterSource(e.target.value as any)}
            className="w-full border border-gray-300 dark:border-slate-700 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
          >
            <option value="all">Todos los Orígenes</option>
            <option value="manual">Registros Manuales</option>
            <option value="transaction">Gastos de Ventas/Compras</option>
          </select>
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-1">Filtrar por Nombre</label>
          <input 
            type="text" 
            placeholder="Buscar por descripción..." 
            value={filterName} 
            onChange={(e) => setFilterName(e.target.value)} 
            className="w-full border border-gray-300 dark:border-slate-700 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100" 
          />
        </div>
        {(startDate !== new Date().toISOString().split('T')[0] || endDate !== new Date().toISOString().split('T')[0] || filterType !== 'all' || filterSource !== 'all' || filterName) && (
          <button onClick={() => { setStartDate(new Date().toISOString().split('T')[0]); setEndDate(new Date().toISOString().split('T')[0]); setFilterType('all'); setFilterSource('all'); setFilterName(''); }} className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium pb-2">
            Limpiar Filtros
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-[#161B22] p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800 flex items-center gap-4">
          <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg">
            <ArrowDownCircle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-slate-500">Total Gastos</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-slate-100">{formatCurrency(totalExpenses)}</p>
          </div>
        </div>
        <div className="bg-white dark:bg-[#161B22] p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800 flex items-center gap-4">
          <div className="p-3 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded-lg">
            <ArrowUpCircle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-slate-500">Total Ingresos Extras</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-slate-100">{formatCurrency(totalIncome)}</p>
          </div>
        </div>
        <div className="bg-white dark:bg-[#161B22] p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800 flex items-center gap-4">
          <div className={`p-3 rounded-lg ${balance >= 0 ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' : 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400'}`}>
            <Wallet className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-slate-500">Balance Neto (Caja)</p>
            <p className={`text-2xl font-bold ${balance >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-orange-600 dark:text-orange-400'}`}>
              {formatCurrency(balance)}
            </p>
          </div>
        </div>
        <div className="bg-white dark:bg-[#161B22] p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800 flex items-center gap-4 md:col-span-3">
          <div className="p-3 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-lg">
            <CreditCard className="w-6 h-6" />
          </div>
          <div className="flex-1 flex justify-between items-center">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-slate-500">Movimientos de Deuda (Abonos/Cobros)</p>
              <p className="text-lg font-bold text-slate-700 dark:text-slate-300">
                {totalDebtMovements >= 0 ? '+' : ''}{formatCurrency(totalDebtMovements)}
              </p>
            </div>
            <div className="text-right text-xs text-gray-400 dark:text-slate-500 max-w-xs">
              Estos movimientos afectan el efectivo pero no se consideran gastos ni ingresos operativos.
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-[#161B22] p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800">
        <h3 className="text-lg font-medium mb-4 text-slate-900 dark:text-slate-100">Registrar Movimiento</h3>
        {!isGuest ? (
          <form onSubmit={handleAdd} className="flex gap-4 items-end flex-wrap">
            <div className="w-48">
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-1">Punto de Venta</label>
              <select
                required
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
                disabled={!!activeStoreId}
                className="w-full border border-gray-300 dark:border-slate-700 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 disabled:bg-gray-100 dark:disabled:bg-slate-800 disabled:cursor-not-allowed"
              >
                <option value="">Seleccionar...</option>
                {stores?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="w-40">
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-1">Tipo</label>
              <select
                required
                value={type}
                onChange={(e) => setType(e.target.value as 'expense' | 'income')}
                className="w-full border border-gray-300 dark:border-slate-700 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
              >
                <option value="expense">Gasto</option>
                <option value="income">Ingreso Extra</option>
              </select>
            </div>
            <div className="w-40">
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-1">Método</label>
              <select
                required
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as 'cash' | 'transfer')}
                className="w-full border border-gray-300 dark:border-slate-700 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
              >
                <option value="cash">Efectivo</option>
                <option value="transfer">Transferencia</option>
              </select>
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-1">Descripción</label>
              <input
                type="text"
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full border border-gray-300 dark:border-slate-700 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                placeholder={type === 'expense' ? "Ej. Pago de luz, limpieza..." : "Ej. Venta de cartón, propina..."}
              />
            </div>
            <div className="w-32">
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-1">Monto</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full border border-gray-300 dark:border-slate-700 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
              />
            </div>
            <button type="submit" className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 transition-colors h-[42px]">
              Registrar
            </button>
          </form>
        ) : (
          <div className="bg-amber-50 border border-amber-100 rounded-2xl p-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center text-amber-600">
              <Lock className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-base font-bold text-amber-900">Modo Lectura Activo</h4>
              <p className="text-sm text-amber-700 font-medium">Como Invitado, puedes visualizar los movimientos pero no tienes permisos para registrar nuevos gastos o ingresos.</p>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-[#161B22] rounded-xl shadow-sm border border-gray-100 dark:border-slate-800 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 dark:bg-slate-800/50 border-b border-gray-200 dark:border-slate-800">
              <th className="px-6 py-3 text-sm font-semibold text-gray-600 dark:text-slate-400">Fecha</th>
              <th className="px-6 py-3 text-sm font-semibold text-gray-600 dark:text-slate-400">Punto de Venta</th>
              <th className="px-6 py-3 text-sm font-semibold text-gray-600 dark:text-slate-400">Tipo</th>
              <th className="px-6 py-3 text-sm font-semibold text-gray-600 dark:text-slate-400">Descripción</th>
              <th className="px-6 py-3 text-sm font-semibold text-gray-600 dark:text-slate-400">Método</th>
              <th className="px-6 py-3 text-sm font-semibold text-gray-600 dark:text-slate-400 text-right">Monto</th>
              <th className="px-6 py-3 text-sm font-semibold text-gray-600 dark:text-slate-400 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filteredExpenses?.map(expense => {
              const isIncome = expense.type === 'income';
              const isDebt = expense.type === 'debt_payment';
              const isCollection = expense.debtType === 'collection';
              
              return (
                <tr key={expense.id} className="border-b border-gray-100 dark:border-slate-800 last:border-0 hover:bg-gray-50 dark:hover:bg-slate-800/30 transition-colors">
                  <td className="px-6 py-4 text-sm text-gray-500 dark:text-slate-500">{formatDate(expense.date)}</td>
                  <td className="px-6 py-4 text-sm text-gray-900 dark:text-slate-100 font-medium">{getStoreName(expense.storeId)}</td>
                  <td className="px-6 py-4 text-sm">
                    {isDebt ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-300">
                        {isCollection ? 'Cobro Deuda' : 'Abono Deuda'}
                      </span>
                    ) : (
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${isIncome ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300'}`}>
                        {isIncome ? 'Ingreso' : 'Gasto'}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900 dark:text-slate-100">
                    <div className="flex flex-col">
                      <span>{expense.description}</span>
                      {(expense.description.includes('en venta #') || expense.description.includes('en compra #') || expense.description.includes('Merma/Rotura')) && (
                        <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider mt-0.5">
                          Transacción
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 dark:text-slate-500">
                    {expense.paymentMethod === 'transfer' ? (
                      <span className="flex items-center gap-1"><CreditCard className="w-4 h-4" /> Transferencia</span>
                    ) : (
                      <span className="flex items-center gap-1"><Banknote className="w-4 h-4" /> Efectivo</span>
                    )}
                  </td>
                  <td className={`px-6 py-4 text-sm font-medium text-right ${isIncome || (isDebt && isCollection) ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {isIncome || (isDebt && isCollection) ? '+' : '-'}{formatCurrency(expense.amount)}
                  </td>
                  <td className="px-6 py-4 text-sm text-right">
                    {!isGuest ? (
                      <div className="flex justify-end gap-2">
                        {!isDebt && (
                          <button
                            onClick={() => setEditingExpense({ ...expense })}
                            className="p-1 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                            title="Editar"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => setDeleteModal({ isOpen: true, id: expense.id })}
                          className="p-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <Lock className="w-4 h-4 text-gray-400 dark:text-slate-600 ml-auto" />
                    )}
                  </td>
                </tr>
              );
            })}
            {filteredExpenses?.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center text-gray-500 dark:text-slate-500">
                  {activeStoreId ? 'No hay movimientos registrados en este punto de venta.' : 'No hay movimientos registrados.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {/* Modal Editar */}
      {editingExpense && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#161B22] rounded-xl shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 border border-transparent dark:border-slate-800">
            <h3 className="text-lg font-bold mb-4 text-slate-900 dark:text-slate-100">Editar Movimiento</h3>
            <form onSubmit={handleUpdate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-1">Fecha</label>
                <input
                  type="datetime-local"
                  required
                  value={toLocalISO(editingExpense.date)}
                  onChange={(e) => setEditingExpense({ ...editingExpense, date: fromLocalISO(e.target.value) })}
                  className="w-full border border-gray-300 dark:border-slate-700 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-1">Descripción</label>
                <input
                  type="text"
                  required
                  value={editingExpense.description}
                  onChange={(e) => setEditingExpense({ ...editingExpense, description: e.target.value })}
                  className="w-full border border-gray-300 dark:border-slate-700 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-1">Monto</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={editingExpense.amount}
                    onChange={(e) => setEditingExpense({ ...editingExpense, amount: e.target.value })}
                    className="w-full border border-gray-300 dark:border-slate-700 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-1">Tipo</label>
                  <select
                    value={editingExpense.type}
                    onChange={(e) => setEditingExpense({ ...editingExpense, type: e.target.value })}
                    className="w-full border border-gray-300 dark:border-slate-700 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                  >
                    <option value="expense">Gasto</option>
                    <option value="income">Ingreso</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-1">Método de Pago</label>
                <select
                  value={editingExpense.paymentMethod}
                  onChange={(e) => setEditingExpense({ ...editingExpense, paymentMethod: e.target.value })}
                  className="w-full border border-gray-300 dark:border-slate-700 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                >
                  <option value="cash">Efectivo</option>
                  <option value="transfer">Transferencia</option>
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setEditingExpense(null)}
                  className="px-4 py-2 text-gray-700 dark:text-slate-400 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-md font-medium transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-md font-medium transition-colors"
                >
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Eliminar */}
      {deleteModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#161B22] rounded-xl shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 border border-transparent dark:border-slate-800">
            <div className="flex items-center gap-3 text-red-600 mb-4">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="text-lg font-bold">Confirmar Eliminación</h3>
            </div>
            <p className="text-gray-600 dark:text-slate-400 mb-6">
              ¿Estás seguro de que deseas eliminar este movimiento? Esta acción es irreversible.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteModal({ isOpen: false })}
                className="px-4 py-2 text-gray-700 dark:text-slate-400 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-md font-medium transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 text-white bg-red-600 hover:bg-red-700 rounded-md font-medium transition-colors"
              >
                Sí, Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
