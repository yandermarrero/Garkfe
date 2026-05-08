import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, Debt } from '../lib/db';
import { formatCurrency, formatDate, toLocalISO, fromLocalISO, cn } from '../lib/utils';
import { CheckCircle2, AlertTriangle, DollarSign, Search, Lock, Trash2, History, Edit2, XCircle } from 'lucide-react';
import { useStoreContext } from '../lib/StoreContext';
import { useAuth } from '../lib/AuthContext';

export default function Debts() {
  const { user } = useAuth();
  const isGuest = user?.role === 'guest';
  const { activeStoreId } = useStoreContext();
  const stores = useLiveQuery(() => db.stores.toArray());
  const suppliers = useLiveQuery(() => db.suppliers.toArray());
  const allDebts = useLiveQuery(() => db.debts.orderBy('date').reverse().toArray());

  const debts = activeStoreId 
    ? allDebts?.filter(d => d.creditorStoreId === activeStoreId || d.debtorStoreId === activeStoreId)
    : allDebts;

  const [paymentModal, setPaymentModal] = useState<{ isOpen: boolean, debt?: Debt }>({ isOpen: false });
  const [cashAmount, setCashAmount] = useState<string>('');
  const [transferAmount, setTransferAmount] = useState<string>('');
  
  const [filterType, setFilterType] = useState<'all' | 'receivable' | 'payable'>('all');
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [manualDebt, setManualDebt] = useState({
    type: 'receivable' as 'receivable' | 'payable',
    entityName: '',
    amount: '',
    description: '',
    date: new Date().toISOString().split('T')[0],
    isStoreTransfer: false,
    otherStoreId: '',
    affectTreasury: true,
    paymentMethod: 'cash' as 'cash' | 'transfer'
  });

  const handleCreateManualDebt = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(manualDebt.amount);
    if (isNaN(amount) || amount <= 0) return;

    let finalEntityName = manualDebt.entityName;
    let creditorStoreId = manualDebt.type === 'receivable' ? activeStoreId : undefined;
    let debtorStoreId = manualDebt.type === 'payable' ? activeStoreId : undefined;

    if (manualDebt.isStoreTransfer && manualDebt.otherStoreId) {
      const otherStore = stores?.find(s => s.id === parseInt(manualDebt.otherStoreId));
      if (otherStore) {
        finalEntityName = otherStore.name;
        if (manualDebt.type === 'receivable') {
          debtorStoreId = otherStore.id;
        } else {
          creditorStoreId = otherStore.id;
        }
      }
    }

    if (!finalEntityName) return;

    await db.transaction('rw', db.debts, db.expenses, async () => {
      const debtId = await db.debts.add({
        amount,
        date: new Date(manualDebt.date).toISOString(),
        status: 'pending',
        type: manualDebt.type,
        debtorName: manualDebt.type === 'receivable' ? finalEntityName : undefined,
        creditorName: manualDebt.type === 'payable' ? finalEntityName : undefined,
        supplierId: manualDebt.type === 'payable' ? 0 : undefined,
        description: manualDebt.description,
        creditorStoreId,
        debtorStoreId,
      });

      if (manualDebt.affectTreasury && activeStoreId) {
        // For receivables (lending): active store has an expense (outflow)
        // For payables (borrowing): active store has an income (inflow)
        const isIncome = manualDebt.type === 'payable';
        
        await db.expenses.add({
          storeId: activeStoreId,
          amount: amount,
          date: new Date(manualDebt.date).toISOString(),
          description: `${isIncome ? 'Ingreso por préstamo recibido' : 'Egreso por préstamo otorgado'} (${finalEntityName}): ${manualDebt.description}`,
          type: isIncome ? 'income' : 'expense',
          paymentMethod: manualDebt.paymentMethod,
          debtId: debtId as number
        });

        // If it's a store transfer, the OTHER store treasury also needs to be affected
        if (manualDebt.isStoreTransfer && manualDebt.otherStoreId) {
          const otherSId = parseInt(manualDebt.otherStoreId);
          const currentStore = stores?.find(s => s.id === activeStoreId);
          // For receivables: other store is getting money (income)
          // For payables: other store is giving money (expense)
          await db.expenses.add({
            storeId: otherSId,
            amount: amount,
            date: new Date(manualDebt.date).toISOString(),
            description: `${isIncome ? 'Egreso por préstamo otorgado' : 'Ingreso por préstamo recibido'} (${currentStore?.name}): ${manualDebt.description}`,
            type: isIncome ? 'expense' : 'income',
            paymentMethod: manualDebt.paymentMethod,
            debtId: debtId as number
          });
        }
      }
    });

    setIsManualModalOpen(false);
    setManualDebt({
      type: 'receivable',
      entityName: '',
      amount: '',
      description: '',
      date: new Date().toISOString().split('T')[0],
      isStoreTransfer: false,
      otherStoreId: '',
      affectTreasury: true,
      paymentMethod: 'cash'
    });
  };
  const [editModal, setEditModal] = useState<{ isOpen: boolean, debt?: Debt }>({ isOpen: false });
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean, id?: number }>({ isOpen: false });
  const [historyModal, setHistoryModal] = useState<{ isOpen: boolean, debt?: Debt }>({ isOpen: false });
  const [editingPayment, setEditingPayment] = useState<{ id: number, amount: string, date: string, paymentMethod: 'cash' | 'transfer' } | null>(null);

  const historyPayments = useLiveQuery(
    () => historyModal.debt?.id ? db.expenses.where('debtId').equals(historyModal.debt.id).toArray() : [],
    [historyModal.debt?.id]
  );

  const handleDeletePayment = async (paymentId: number) => {
    if (!historyModal.debt) return;
    const payment = await db.expenses.get(paymentId);
    if (!payment) return;

    await db.transaction('rw', db.debts, db.expenses, async () => {
      const debt = await db.debts.get(historyModal.debt!.id!);
      if (!debt) return;

      const newPaidAmount = (debt.paidAmount || 0) - payment.amount;
      const newPaidCash = (debt.paidCash || 0) - (payment.paymentMethod === 'cash' ? payment.amount : 0);
      const newPaidTransfer = (debt.paidTransfer || 0) - (payment.paymentMethod === 'transfer' ? payment.amount : 0);
      const newStatus = newPaidAmount >= debt.amount - 0.01 ? 'paid' : 'pending';

      await db.debts.update(debt.id!, {
        paidAmount: Math.max(0, newPaidAmount),
        paidCash: Math.max(0, newPaidCash),
        paidTransfer: Math.max(0, newPaidTransfer),
        status: newStatus
      });

      await db.expenses.delete(paymentId);
      
      // If it was an inter-store transfer, find and delete the corresponding income/expense in the other store
      // This is a bit tricky without a link, but we can search by description and amount and date
      const otherPayments = await db.expenses
        .where('date').equals(payment.date)
        .and(e => e.amount === payment.amount && e.id !== payment.id && e.debtId === debt.id)
        .toArray();
      
      for (const op of otherPayments) {
        await db.expenses.delete(op.id!);
      }
    });
  };

  const handleUpdatePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPayment || !historyModal.debt) return;

    const newAmount = parseFloat(editingPayment.amount);
    if (isNaN(newAmount) || newAmount <= 0) return;

    const oldPayment = await db.expenses.get(editingPayment.id);
    if (!oldPayment) return;

    await db.transaction('rw', db.debts, db.expenses, async () => {
      const debt = await db.debts.get(historyModal.debt!.id!);
      if (!debt) return;

      // Reverse old payment
      let paidAmount = (debt.paidAmount || 0) - oldPayment.amount;
      let paidCash = (debt.paidCash || 0) - (oldPayment.paymentMethod === 'cash' ? oldPayment.amount : 0);
      let paidTransfer = (debt.paidTransfer || 0) - (oldPayment.paymentMethod === 'transfer' ? oldPayment.amount : 0);

      // Apply new payment
      paidAmount += newAmount;
      paidCash += editingPayment.paymentMethod === 'cash' ? newAmount : 0;
      paidTransfer += editingPayment.paymentMethod === 'transfer' ? newAmount : 0;

      const newStatus = paidAmount >= debt.amount - 0.01 ? 'paid' : 'pending';

      await db.debts.update(debt.id!, {
        paidAmount: Math.max(0, paidAmount),
        paidCash: Math.max(0, paidCash),
        paidTransfer: Math.max(0, paidTransfer),
        status: newStatus
      });

      await db.expenses.update(editingPayment.id, {
        amount: newAmount,
        date: new Date(editingPayment.date).toISOString(),
        paymentMethod: editingPayment.paymentMethod,
        type: 'debt_payment',
        debtType: oldPayment.debtType || (oldPayment.type === 'income' ? 'collection' : 'payment')
      });

      // Update corresponding inter-store payment if exists
      const otherPayments = await db.expenses
        .where('date').equals(oldPayment.date)
        .and(e => e.amount === oldPayment.amount && e.id !== oldPayment.id && e.debtId === debt.id)
        .toArray();
      
      for (const op of otherPayments) {
        await db.expenses.update(op.id!, {
          amount: newAmount,
          date: new Date(editingPayment.date).toISOString(),
          paymentMethod: editingPayment.paymentMethod
        });
      }
    });

    setEditingPayment(null);
  };

  const handleUpdateDebt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editModal.debt) return;
    const debt = editModal.debt;

    await db.transaction('rw', db.debts, db.expenses, async () => {
      await db.debts.update(debt.id!, {
        amount: debt.amount,
        date: debt.date,
        description: debt.description,
        debtorName: debt.debtorName,
        creditorName: debt.creditorName
      });

      // Update associated initial expense (the one that recorded the lending/borrowing)
      const associatedExpenses = await db.expenses.where('debtId').equals(debt.id!).toArray();
      const initialExpense = associatedExpenses.find(ex => !['debt_payment'].includes(ex.type || ''));
      
      if (initialExpense) {
        await db.expenses.update(initialExpense.id!, {
          amount: debt.amount,
          date: debt.date,
          description: `${initialExpense.type === 'income' ? 'Ingreso por préstamo recibido' : 'Egreso por préstamo otorgado'} (${isReceivable(debt) ? (debt.debtorName || debt.debtorStoreId) : (debt.creditorName || debt.creditorStoreId)}): ${debt.description}`,
          paymentMethod: debt.paymentMethod
        });
      }
    });

    setEditModal({ isOpen: false });
  };

  const handleDeleteDebt = async () => {
    if (!deleteModal.id) return;
    
    await db.transaction('rw', [db.debts, db.expenses], async () => {
      // Delete the debt
      await db.debts.delete(deleteModal.id!);
      
      // Delete all associated payments/treasury impacts
      const associatedExpenses = await db.expenses.where('debtId').equals(deleteModal.id!).toArray();
      for (const e of associatedExpenses) {
        await db.expenses.delete(e.id!);
      }
    });

    setDeleteModal({ isOpen: false });
  };

  const [filterEntity, setFilterEntity] = useState<string>('');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);

  const executePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentModal.debt) return;

    const cash = parseFloat(cashAmount) || 0;
    const transfer = parseFloat(transferAmount) || 0;
    const totalToPay = cash + transfer;

    if (totalToPay <= 0) return;

    const debt = paymentModal.debt;
    const currentPaid = debt.paidAmount || 0;
    const remaining = debt.amount - currentPaid;

    if (totalToPay > remaining + 0.01) {
      alert('El monto a pagar no puede ser mayor al monto restante.');
      return;
    }

    const newPaidAmount = currentPaid + totalToPay;
    const newPaidCash = (debt.paidCash || 0) + cash;
    const newPaidTransfer = (debt.paidTransfer || 0) + transfer;
    const newStatus = newPaidAmount >= debt.amount - 0.01 ? 'paid' : 'pending';

    await db.transaction('rw', db.debts, db.expenses, async () => {
      await db.debts.update(debt.id!, {
        paidAmount: newPaidAmount,
        paidCash: newPaidCash,
        paidTransfer: newPaidTransfer,
        status: newStatus
      });

      // If it's a transfer between stores, we record both the expense in the debtor store 
      // and the income in the creditor store to keep both treasuries balanced.
      if (debt.creditorStoreId && debt.debtorStoreId) {
        // Record Cash Payment if any
        if (cash > 0) {
          await db.expenses.add({
            storeId: debt.debtorStoreId,
            date: new Date().toISOString(),
            description: `Pago a cuenta (Efectivo) (Inter-sucursal): ${getCreditorName(debt)}`,
            amount: cash,
            type: 'debt_payment',
            debtType: 'payment',
            paymentMethod: 'cash',
            debtId: debt.id
          });
          
          await db.expenses.add({
            storeId: debt.creditorStoreId,
            date: new Date().toISOString(),
            description: `Cobro a cuenta (Efectivo) (Inter-sucursal): ${getDebtorName(debt)}`,
            amount: cash,
            type: 'debt_payment',
            debtType: 'collection',
            paymentMethod: 'cash',
            debtId: debt.id
          });
        }
        
        // Record Transfer Payment if any
        if (transfer > 0) {
          await db.expenses.add({
            storeId: debt.debtorStoreId,
            date: new Date().toISOString(),
            description: `Pago a cuenta (Transferencia) (Inter-sucursal): ${getCreditorName(debt)}`,
            amount: transfer,
            type: 'debt_payment',
            debtType: 'payment',
            paymentMethod: 'transfer',
            debtId: debt.id
          });
          
          await db.expenses.add({
            storeId: debt.creditorStoreId,
            date: new Date().toISOString(),
            description: `Cobro a cuenta (Transferencia) (Inter-sucursal): ${getDebtorName(debt)}`,
            amount: transfer,
            type: 'debt_payment',
            debtType: 'collection',
            paymentMethod: 'transfer',
            debtId: debt.id
          });
        }
      } else {
        // Standard debt payment (to/from external entity)
        let storeIdToRecord = activeStoreId;
        let debtType: 'payment' | 'collection' = 'collection';

        if (isReceivable(debt)) {
          storeIdToRecord = debt.creditorStoreId || activeStoreId;
          debtType = 'collection';
        } else {
          storeIdToRecord = debt.debtorStoreId || activeStoreId;
          debtType = 'payment';
        }

        if (storeIdToRecord) {
          const baseDesc = `${debtType === 'collection' ? 'Cobro' : 'Abono'} a cuenta: ${isReceivable(debt) ? getDebtorName(debt) : getCreditorName(debt)}`;
          
          if (cash > 0) {
            await db.expenses.add({
              storeId: storeIdToRecord,
              date: new Date().toISOString(),
              description: `${baseDesc} (Efectivo)`,
              amount: cash,
              type: 'debt_payment',
              debtType: debtType,
              paymentMethod: 'cash',
              debtId: debt.id
            });
          }
          
          if (transfer > 0) {
            await db.expenses.add({
              storeId: storeIdToRecord,
              date: new Date().toISOString(),
              description: `${baseDesc} (Transferencia)`,
              amount: transfer,
              type: 'debt_payment',
              debtType: debtType,
              paymentMethod: 'transfer',
              debtId: debt.id
            });
          }
        }
      }
    });

    setPaymentModal({ isOpen: false });
    setCashAmount('');
    setTransferAmount('');
  };

  const openPaymentModal = (debt: Debt) => {
    const remaining = debt.amount - (debt.paidAmount || 0);
    setPaymentModal({ isOpen: true, debt });
    setCashAmount(remaining.toString());
    setTransferAmount('0');
  };

  const getStoreName = (id?: number) => stores?.find(s => s.id === id)?.name || 'Desconocido';
  const getSupplierName = (id?: number) => suppliers?.find(s => s.id === id)?.name || 'Proveedor Externo';

  const getCreditorName = (debt: Debt) => {
    return debt.creditorName || (debt.creditorStoreId ? getStoreName(debt.creditorStoreId) : (debt.supplierId && debt.supplierId !== 0 ? getSupplierName(debt.supplierId) : 'Proveedor Externo'));
  };

  const getDebtorName = (debt: Debt) => {
    return debt.debtorName || (debt.debtorStoreId ? getStoreName(debt.debtorStoreId) : 'Desconocido');
  };

  const isReceivable = (debt: Debt) => {
    if (activeStoreId) return debt.creditorStoreId === activeStoreId;
    return debt.type === 'receivable' || !!debt.creditorStoreId;
  };

  const isPayable = (debt: Debt) => {
    if (activeStoreId) return debt.debtorStoreId === activeStoreId;
    return debt.type === 'payable' || !!debt.debtorStoreId || !!debt.supplierId;
  };

  const filteredDebts = debts?.filter(debt => {
    if (filterType === 'receivable' && !isReceivable(debt)) return false;
    if (filterType === 'payable' && !isPayable(debt)) return false;

    if (startDate) {
      const start = new Date(startDate + 'T00:00:00');
      if (new Date(debt.date) < start) return false;
    }
    if (endDate) {
      const end = new Date(endDate + 'T23:59:59.999');
      if (new Date(debt.date) > end) return false;
    }

    if (filterEntity) {
      const search = filterEntity.toLowerCase();
      const creditor = getCreditorName(debt).toLowerCase();
      const debtor = getDebtorName(debt).toLowerCase();
      if (!creditor.includes(search) && !debtor.includes(search)) {
        return false;
      }
    }

    return true;
  });

  const totalAmount = filteredDebts?.reduce((sum, d) => sum + d.amount, 0) || 0;
  const totalPaid = filteredDebts?.reduce((sum, d) => sum + (d.paidAmount || 0), 0) || 0;
  const totalRemaining = totalAmount - totalPaid;

  const [editingDate, setEditingDate] = useState<{ id: number, date: string } | null>(null);

  const handleUpdateDate = async (id: number, newDate: string) => {
    await db.debts.update(id, { date: newDate });
    setEditingDate(null);
  };

  return (
    <div className="space-y-6 relative">
      {editModal.isOpen && editModal.debt && (
        <div className="fixed inset-0 bg-slate-900/40 dark:bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-md w-full p-8 border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95">
            <h3 className="text-lg font-bold mb-6 text-slate-900 dark:text-slate-100">Editar Cuenta</h3>
            <form onSubmit={handleUpdateDebt} className="space-y-6">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 ml-1">Nombre</label>
                <input
                  type="text"
                  required
                  value={isReceivable(editModal.debt) ? getDebtorName(editModal.debt) : getCreditorName(editModal.debt)}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (isReceivable(editModal.debt)) {
                      setEditModal({ ...editModal, debt: { ...editModal.debt!, debtorName: val } });
                    } else {
                      setEditModal({ ...editModal, debt: { ...editModal.debt!, creditorName: val } });
                    }
                  }}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 ml-1">Monto Total</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={editModal.debt.amount}
                  onChange={(e) => setEditModal({ ...editModal, debt: { ...editModal.debt!, amount: parseFloat(e.target.value) } })}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 ml-1">Fecha</label>
                <input
                  type="datetime-local"
                  required
                  value={toLocalISO(editModal.debt.date)}
                  onChange={(e) => setEditModal({ ...editModal, debt: { ...editModal.debt!, date: fromLocalISO(e.target.value) } })}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 ml-1">Descripción</label>
                <textarea
                  value={editModal.debt.description || ''}
                  onChange={(e) => setEditModal({ ...editModal, debt: { ...editModal.debt!, description: e.target.value } })}
                  className="input-field"
                  rows={2}
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 ml-1 text-indigo-600 dark:text-indigo-400">Método de Tesorería</label>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => setEditModal({ ...editModal, debt: { ...editModal.debt!, paymentMethod: 'cash' } })}
                    className={cn(
                      "px-4 py-2 rounded-xl text-xs font-bold transition-all border",
                      editModal.debt.paymentMethod === 'cash' 
                        ? "bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-600/20" 
                        : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:border-indigo-400"
                    )}
                  >
                    Efectivo
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditModal({ ...editModal, debt: { ...editModal.debt!, paymentMethod: 'transfer' } })}
                    className={cn(
                      "px-4 py-2 rounded-xl text-xs font-bold transition-all border",
                      editModal.debt.paymentMethod === 'transfer' 
                        ? "bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-600/20" 
                        : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:border-indigo-400"
                    )}
                  >
                    Transferencia
                  </button>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setEditModal({ isOpen: false })}
                  className="btn-secondary px-6"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn-primary px-6"
                >
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteModal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/40 dark:bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-md w-full p-8 border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400 mb-4">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="text-lg font-bold">Confirmar Eliminación</h3>
            </div>
            <p className="text-slate-600 dark:text-slate-400 mb-8 text-sm leading-relaxed">
              ¿Estás seguro de que deseas eliminar esta cuenta? Esta acción no se puede deshacer y afectará el historial de deudas.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteModal({ isOpen: false })}
                className="btn-secondary px-6"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteDebt}
                className="px-6 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-xs uppercase tracking-widest transition-all shadow-lg shadow-rose-600/20"
              >
                Eliminar Cuenta
              </button>
            </div>
          </div>
        </div>
      )}

      {editingDate && (
        <div className="fixed inset-0 bg-slate-900/40 dark:bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-sm w-full p-8 border border-slate-200 dark:border-slate-800">
            <h3 className="text-lg font-bold mb-6 text-slate-900 dark:text-slate-100">Modificar Fecha</h3>
            <input
              type="datetime-local"
              value={toLocalISO(editingDate.date)}
              onChange={(e) => setEditingDate({ ...editingDate, date: fromLocalISO(e.target.value) })}
              className="input-field mb-6"
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setEditingDate(null)}
                className="btn-secondary px-6"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleUpdateDate(editingDate.id, editingDate.date)}
                className="btn-primary px-6"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {paymentModal.isOpen && paymentModal.debt && (
        <div className="fixed inset-0 bg-slate-900/40 dark:bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-md w-full p-8 border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 text-indigo-600 dark:text-indigo-400 mb-6">
              <DollarSign className="w-6 h-6" />
              <h3 className="text-lg font-bold">Registrar Pago / Abono</h3>
            </div>
            
            <div className="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-2xl mb-8 space-y-3 text-sm border border-slate-100 dark:border-slate-800">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Monto Total:</span>
                <span className="font-bold text-slate-900 dark:text-slate-100 tabular-nums">{formatCurrency(paymentModal.debt.amount)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Pagado hasta ahora:</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{formatCurrency(paymentModal.debt.paidAmount || 0)}</span>
              </div>
              <div className="flex justify-between items-center pt-3 border-t border-slate-200 dark:border-slate-700">
                <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Restante por pagar:</span>
                <span className="text-lg font-black text-amber-600 dark:text-amber-400 tabular-nums">{formatCurrency(paymentModal.debt.amount - (paymentModal.debt.paidAmount || 0))}</span>
              </div>
            </div>

            <form onSubmit={executePayment} className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 ml-1">
                    Monto Efectivo
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 font-bold text-sm">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={cashAmount}
                      onChange={(e) => setCashAmount(e.target.value)}
                      className="input-field pl-8"
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 ml-1">
                    Monto Transferencia
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 font-bold text-sm">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={transferAmount}
                      onChange={(e) => setTransferAmount(e.target.value)}
                      className="input-field pl-8"
                      placeholder="0.00"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-2xl flex justify-between items-center border border-indigo-100 dark:border-indigo-900/30">
                <span className="text-[10px] font-bold text-indigo-700 dark:text-indigo-300 uppercase tracking-widest">Total a abonar:</span>
                <span className="text-xl font-black text-indigo-800 dark:text-indigo-200 tabular-nums">
                  {formatCurrency((parseFloat(cashAmount) || 0) + (parseFloat(transferAmount) || 0))}
                </span>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setPaymentModal({ isOpen: false })}
                  className="btn-secondary px-6"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn-primary px-6"
                >
                  Confirmar Pago
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {historyModal.isOpen && historyModal.debt && (
        <div className="fixed inset-0 bg-slate-900/40 dark:bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-2xl w-full p-8 border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3 text-indigo-600 dark:text-indigo-400">
                <History className="w-6 h-6" />
                <h3 className="text-lg font-bold">Historial de Pagos</h3>
              </div>
              <button onClick={() => setHistoryModal({ isOpen: false })} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all">
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-2xl mb-8 flex flex-wrap gap-8 text-sm border border-slate-100 dark:border-slate-800">
              <div>
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1">Cliente/Proveedor</span>
                <span className="font-bold text-slate-900 dark:text-slate-100">{isReceivable(historyModal.debt) ? getDebtorName(historyModal.debt) : getCreditorName(historyModal.debt)}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1">Monto Total</span>
                <span className="font-bold text-slate-900 dark:text-slate-100 tabular-nums">{formatCurrency(historyModal.debt.amount)}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1">Total Pagado</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{formatCurrency(historyModal.debt.paidAmount || 0)}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1">Restante</span>
                <span className="font-bold text-amber-600 dark:text-amber-400 tabular-nums">{formatCurrency(historyModal.debt.amount - (historyModal.debt.paidAmount || 0))}</span>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 pr-2 custom-scrollbar">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800">
                    <th className="py-4 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Fecha</th>
                    <th className="py-4 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Método</th>
                    <th className="py-4 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Monto</th>
                    <th className="py-4 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                  {historyPayments?.map(payment => (
                    <tr key={payment.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="py-4 text-sm text-slate-600 dark:text-slate-400">{formatDate(payment.date)}</td>
                      <td className="py-4 text-sm text-slate-600 dark:text-slate-400 capitalize">{payment.paymentMethod}</td>
                      <td className="py-4 text-sm font-bold text-slate-900 dark:text-slate-100 tabular-nums">{formatCurrency(payment.amount)}</td>
                      <td className="py-4 text-sm text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setEditingPayment({
                              id: payment.id!,
                              amount: payment.amount.toString(),
                              date: payment.date.split('T')[0],
                              paymentMethod: payment.paymentMethod || 'cash'
                            })}
                            className="p-2 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-xl transition-all"
                            title="Editar Pago"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeletePayment(payment.id!)}
                            className="p-2 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-xl transition-all"
                            title="Eliminar Pago"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {historyPayments?.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-12 text-center text-slate-500 dark:text-slate-500 italic text-sm">No hay pagos registrados para esta cuenta.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {editingPayment && (
        <div className="fixed inset-0 bg-slate-900/40 dark:bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-md w-full p-8 border border-slate-200 dark:border-slate-800">
            <h3 className="text-lg font-bold mb-6 text-slate-900 dark:text-slate-100">Editar Pago Parcial</h3>
            <form onSubmit={handleUpdatePayment} className="space-y-6">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 ml-1">Monto</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={editingPayment.amount}
                  onChange={(e) => setEditingPayment({ ...editingPayment, amount: e.target.value })}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 ml-1">Fecha</label>
                <input
                  type="date"
                  required
                  value={editingPayment.date}
                  onChange={(e) => setEditingPayment({ ...editingPayment, date: e.target.value })}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 ml-1">Método de Pago</label>
                <select
                  value={editingPayment.paymentMethod}
                  onChange={(e) => setEditingPayment({ ...editingPayment, paymentMethod: e.target.value as any })}
                  className="input-field"
                >
                  <option value="cash">Efectivo</option>
                  <option value="transfer">Transferencia</option>
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setEditingPayment(null)}
                  className="btn-secondary px-6"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn-primary px-6"
                >
                  Actualizar Pago
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-[#161B22] rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden">
          <div className="p-8 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row gap-6 justify-between items-start sm:items-center">
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Cuentas por Cobrar / Pagar</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Compromisos de pago generados por ventas en consignación o compras a crédito.
            </p>
          </div>
          
          <button
            onClick={() => setIsManualModalOpen(true)}
            disabled={isGuest}
            className="btn-primary px-6 flex items-center gap-2"
          >
            {isGuest && <Lock className="w-4 h-4" />}
            Nueva Cuenta Manual
          </button>
        </div>

        {isManualModalOpen && (
          <div className="fixed inset-0 bg-slate-900/40 dark:bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-md w-full p-8 border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95">
              <h3 className="text-lg font-bold mb-6 text-slate-900 dark:text-slate-100">Nueva Cuenta Manual</h3>
              <form onSubmit={handleCreateManualDebt} className="space-y-6">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 ml-1">Tipo</label>
                  <select
                    value={manualDebt.type}
                    onChange={(e) => setManualDebt({...manualDebt, type: e.target.value as any})}
                    className="input-field"
                  >
                    <option value="receivable">Por Cobrar (Cliente)</option>
                    <option value="payable">Por Pagar (Proveedor)</option>
                  </select>
                </div>
                <div>
                  <label className="flex items-center gap-3 text-sm font-bold text-slate-700 dark:text-slate-300 mb-1 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={manualDebt.isStoreTransfer}
                      onChange={(e) => setManualDebt({...manualDebt, isStoreTransfer: e.target.checked})}
                      className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500 bg-white dark:bg-slate-900"
                    />
                    <span className="group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">¿Es una deuda entre puntos de venta?</span>
                  </label>
                </div>

                {manualDebt.isStoreTransfer ? (
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 ml-1">Punto de Venta Relacionado</label>
                    <select
                      required
                      value={manualDebt.otherStoreId}
                      onChange={(e) => setManualDebt({...manualDebt, otherStoreId: e.target.value})}
                      className="input-field"
                    >
                      <option value="">Seleccionar punto de venta...</option>
                      {stores?.filter(s => s.id !== activeStoreId).map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 ml-1">
                      {manualDebt.type === 'receivable' ? 'Nombre del Cliente' : 'Nombre del Proveedor'}
                    </label>
                    <input
                      type="text"
                      required
                      value={manualDebt.entityName}
                      onChange={(e) => setManualDebt({...manualDebt, entityName: e.target.value})}
                      className="input-field"
                      placeholder={manualDebt.type === 'receivable' ? "Ej: Juan Perez" : "Ej: Distribuidora XYZ"}
                    />
                  </div>
                )}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 ml-1">Monto</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={manualDebt.amount}
                    onChange={(e) => setManualDebt({...manualDebt, amount: e.target.value})}
                    className="input-field"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 ml-1">Fecha</label>
                  <input
                    type="date"
                    required
                    value={manualDebt.date}
                    onChange={(e) => setManualDebt({...manualDebt, date: e.target.value})}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 ml-1">Descripción (Opcional)</label>
                  <textarea
                    value={manualDebt.description}
                    onChange={(e) => setManualDebt({...manualDebt, description: e.target.value})}
                    className="input-field"
                    rows={2}
                  />
                </div>

                <div className="space-y-4 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <label className="flex items-center gap-3 text-sm font-bold text-slate-700 dark:text-slate-300 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={manualDebt.affectTreasury}
                      onChange={(e) => setManualDebt({...manualDebt, affectTreasury: e.target.checked})}
                      className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500 bg-white dark:bg-slate-900"
                    />
                    <span className="group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                      {manualDebt.type === 'receivable' ? 'Descontar monto de Tesorería' : 'Sumar monto a Tesorería'}
                    </span>
                  </label>

                  {manualDebt.affectTreasury && (
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 ml-1 text-indigo-600 dark:text-indigo-400">Método de Tesorería</label>
                        <div className="grid grid-cols-2 gap-4">
                          <button
                            type="button"
                            onClick={() => setManualDebt({...manualDebt, paymentMethod: 'cash'})}
                            className={cn(
                              "px-4 py-2 rounded-xl text-xs font-bold transition-all border",
                              manualDebt.paymentMethod === 'cash' 
                                ? "bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-600/20" 
                                : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:border-indigo-400"
                            )}
                          >
                            Efectivo
                          </button>
                          <button
                            type="button"
                            onClick={() => setManualDebt({...manualDebt, paymentMethod: 'transfer'})}
                            className={cn(
                              "px-4 py-2 rounded-xl text-xs font-bold transition-all border",
                              manualDebt.paymentMethod === 'transfer' 
                                ? "bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-600/20" 
                                : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:border-indigo-400"
                            )}
                          >
                            Transferencia
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                <div className="flex justify-end gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setIsManualModalOpen(false)}
                    className="btn-secondary px-6"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="btn-primary px-6"
                  >
                    Crear Cuenta
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
        
        <div className="p-8 border-b border-slate-100 dark:border-slate-800 flex flex-col lg:flex-row gap-6 justify-between items-start lg:items-center">
          <div className="flex flex-col sm:flex-row gap-4 w-full lg:w-auto">
            <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700">
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Desde:</span>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="bg-transparent text-sm font-bold text-slate-700 dark:text-slate-300 focus:outline-none" />
            </div>
            <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700">
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Hasta:</span>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="bg-transparent text-sm font-bold text-slate-700 dark:text-slate-300 focus:outline-none" />
            </div>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as any)}
              className="input-field py-2.5 min-w-[160px]"
            >
              <option value="all">Todas las cuentas</option>
              <option value="receivable">Por Cobrar</option>
              <option value="payable">Por Pagar</option>
            </select>
            
            <div className="relative flex-1 sm:flex-none">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-slate-400 dark:text-slate-500" />
              </div>
              <input
                type="text"
                placeholder="Buscar cliente o proveedor..."
                value={filterEntity}
                onChange={(e) => setFilterEntity(e.target.value)}
                className="input-field pl-11 w-full sm:w-64"
              />
            </div>
          </div>
        </div>
        <div className="bg-slate-50/50 dark:bg-slate-800/30 p-6 border-b border-slate-100 dark:border-slate-800 flex flex-wrap gap-8 items-center">
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">Total Deuda</span>
            <span className="text-xl font-black text-slate-900 dark:text-slate-100 tabular-nums">{formatCurrency(totalAmount)}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">Total Pagado</span>
            <span className="text-xl font-black text-emerald-600 dark:text-emerald-400 tabular-nums">{formatCurrency(totalPaid)}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">Total Restante</span>
            <span className="text-xl font-black text-amber-600 dark:text-amber-400 tabular-nums">{formatCurrency(totalRemaining)}</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Fecha</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Acreedor (Cobrar)</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Deudor (Pagar)</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Total</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Pagado</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Restante</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Estado</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
              {filteredDebts?.map(debt => {
                const paid = debt.paidAmount || 0;
                const remaining = debt.amount - paid;
                
                return (
                  <tr key={debt.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-500">
                      <button
                        onClick={() => !isGuest && setEditingDate({ id: debt.id!, date: debt.date.split('T')[0] })}
                        className={`hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors font-medium ${!isGuest ? 'cursor-pointer underline decoration-dotted' : 'cursor-default'}`}
                        title={!isGuest ? "Click para editar fecha" : ""}
                      >
                        {formatDate(debt.date)}
                      </button>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-900 dark:text-slate-100 font-bold">
                      {getCreditorName(debt)}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-900 dark:text-slate-100">
                      <div>
                        <span className="font-bold">{getDebtorName(debt)}</span>
                        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tight block mt-0.5">
                          {debt.debtorStoreId ? 'Punto de Venta' : 'Cliente Externo'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm font-bold text-slate-900 dark:text-slate-100 tabular-nums">{formatCurrency(debt.amount)}</td>
                    <td className="px-6 py-4 text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{formatCurrency(paid)}</td>
                    <td className="px-6 py-4 text-sm font-bold text-amber-600 dark:text-amber-400 tabular-nums">{formatCurrency(remaining)}</td>
                    <td className="px-6 py-4 text-sm">
                      <span className={cn(
                        "inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-tight",
                        debt.status === 'paid' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400' : 
                        paid > 0 ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400' : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400'
                      )}>
                        {debt.status === 'paid' ? 'Pagado' : paid > 0 ? 'Pago Parcial' : 'Pendiente'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-right">
                      <div className="flex items-center justify-end gap-2">
                        {debt.status === 'pending' && !isGuest && (
                          <button
                            onClick={() => openPaymentModal(debt)}
                            className="p-2 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-xl transition-all"
                            title="Abonar"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                        )}
                        {!isGuest && (
                          <>
                            <button
                              onClick={() => setHistoryModal({ isOpen: true, debt })}
                              className="p-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all"
                              title="Ver Historial de Pagos"
                            >
                              <History className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setEditModal({ isOpen: true, debt: { ...debt } })}
                              className="p-2 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded-xl transition-all"
                              title="Editar"
                            >
                              <DollarSign className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setDeleteModal({ isOpen: true, id: debt.id })}
                              className="p-2 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-xl transition-all"
                              title="Eliminar"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        {isGuest && (
                          <span className="text-slate-400 dark:text-slate-600 flex items-center justify-end gap-1 text-[10px] font-bold uppercase tracking-wider">
                            <Lock className="w-3 h-3" /> Solo lectura
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredDebts?.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-500 dark:text-slate-500 italic text-sm">
                    No se encontraron cuentas que coincidan con los filtros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
