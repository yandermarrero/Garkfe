import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { useAuth } from '../lib/AuthContext';
import { Lock, Store, Trash2, AlertTriangle, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function Stores() {
  const { user } = useAuth();
  const isGuest = user?.role === 'guest';
  const stores = useLiveQuery(() => db.stores.toArray());
  const [name, setName] = useState('');
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; storeId: number | null; storeName: string }>({
    isOpen: false,
    storeId: null,
    storeName: ''
  });

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || isGuest) return;
    await db.stores.add({ name: name.trim() });
    setName('');
  };

  const handleDeleteStore = async () => {
    if (!deleteModal.storeId || isGuest) return;

    const sId = deleteModal.storeId;

    try {
      await db.transaction('rw', [
        db.stores, 
        db.inventory, 
        db.transactions, 
        db.expenses, 
        db.debts, 
        db.purchases, 
        db.treasury, 
        db.storePrices
      ], async () => {
        // 1. Delete associated data
        await db.inventory.where({ storeId: sId }).delete();
        await db.transactions.where('fromStoreId').equals(sId).delete();
        await db.transactions.where('toStoreId').equals(sId).delete();
        await db.expenses.where({ storeId: sId }).delete();
        await db.debts.where('creditorStoreId').equals(sId).delete();
        await db.debts.where('debtorStoreId').equals(sId).delete();
        await db.purchases.where({ storeId: sId }).delete();
        await db.treasury.where({ storeId: sId }).delete();
        await db.storePrices.where({ storeId: sId }).delete();

        // 2. Delete the store itself
        await db.stores.delete(sId);
      });
      
      setDeleteModal({ isOpen: false, storeId: null, storeName: '' });
    } catch (error) {
      console.error("Error deleting store:", error);
      alert("Error al eliminar el punto de venta y sus datos asociados.");
    }
  };

  return (
    <div className="space-y-6">
      {!isGuest ? (
        <div className="bg-white dark:bg-[#161B22] p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800">
          <div className="flex items-center gap-2 mb-4">
            <Store className="w-5 h-5 text-slate-400" />
            <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100">Agregar Punto de Venta</h3>
          </div>
          <form onSubmit={handleAdd} className="flex gap-4">
            <input
              type="text"
              placeholder="Nombre del punto de venta"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="flex-1 border border-gray-300 dark:border-slate-700 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
            />
            <button type="submit" className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 transition-colors">
              Agregar
            </button>
          </form>
        </div>
      ) : (
        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-6 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center text-amber-600">
            <Lock className="w-6 h-6" />
          </div>
          <div>
            <h4 className="text-base font-bold text-amber-900">Modo Lectura Activo</h4>
            <p className="text-sm text-amber-700 font-medium">Como Invitado, puedes visualizar los puntos de venta pero no tienes permisos para agregar nuevos.</p>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-[#161B22] rounded-xl shadow-sm border border-gray-100 dark:border-slate-800 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 dark:bg-slate-800/50 border-b border-gray-200 dark:border-slate-800">
              <th className="px-6 py-3 text-sm font-semibold text-gray-600 dark:text-slate-400">ID</th>
              <th className="px-6 py-3 text-sm font-semibold text-gray-600 dark:text-slate-400">Nombre</th>
              {!isGuest && <th className="px-6 py-3 text-sm font-semibold text-gray-600 dark:text-slate-400 text-right">Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {stores?.map(store => (
              <tr key={store.id} className="border-b border-gray-100 dark:border-slate-800 last:border-0 hover:bg-gray-50 dark:hover:bg-slate-800/30 transition-colors">
                <td className="px-6 py-4 text-sm text-gray-500 dark:text-slate-500">#{store.id}</td>
                <td className="px-6 py-4 text-sm text-gray-900 dark:text-slate-100 font-medium">{store.name}</td>
                {!isGuest && (
                  <td className="px-6 py-4 text-sm text-right">
                    <button
                      onClick={() => setDeleteModal({ isOpen: true, storeId: store.id!, storeName: store.name })}
                      className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors"
                      title="Eliminar Punto de Venta"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {stores?.length === 0 && (
              <tr>
                <td colSpan={isGuest ? 2 : 3} className="px-6 py-8 text-center text-gray-500 dark:text-slate-500">No hay puntos de venta registrados.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteModal.isOpen && (
          <div className="fixed inset-0 bg-slate-900/40 dark:bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white dark:bg-[#161B22] rounded-3xl shadow-2xl max-w-md w-full p-8 border border-slate-200 dark:border-slate-800"
            >
              <div className="flex items-center gap-4 mb-6 text-rose-600">
                <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-900/20 flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">¿Eliminar Punto de Venta?</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Esta acción es irreversible.</p>
                </div>
              </div>

              <div className="bg-rose-50 dark:bg-rose-900/10 border border-rose-100 dark:border-rose-900/20 rounded-2xl p-4 mb-8">
                <p className="text-sm text-rose-800 dark:text-rose-300 font-medium leading-relaxed">
                  Se eliminará permanentemente el punto de venta <span className="font-bold">"{deleteModal.storeName}"</span> y <span className="font-bold underline">TODA</span> su información asociada:
                </p>
                <ul className="mt-3 space-y-1 text-xs text-rose-700 dark:text-rose-400 list-disc list-inside">
                  <li>Inventario y existencias</li>
                  <li>Ventas y transacciones</li>
                  <li>Compras y gastos</li>
                  <li>Deudas y cobros</li>
                  <li>Precios configurados</li>
                </ul>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={() => setDeleteModal({ isOpen: false, storeId: null, storeName: '' })}
                  className="flex-1 py-3 px-4 rounded-xl font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDeleteStore}
                  className="flex-1 py-3 px-4 rounded-xl font-bold text-white bg-rose-600 hover:bg-rose-700 shadow-lg shadow-rose-600/20 transition-all active:scale-95"
                >
                  Eliminar Todo
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
