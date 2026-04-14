import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { Plus, Trash2, Edit2, AlertTriangle, Lock } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';

export default function Suppliers() {
  const { user } = useAuth();
  const isGuest = user?.role === 'guest';
  const suppliers = useLiveQuery(() => db.suppliers.toArray());
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<{name: string, contact: string, phone: string, type: 'supplier' | 'customer'}>({ name: '', contact: '', phone: '', type: 'supplier' });
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean, id?: number }>({ isOpen: false });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    if (editingId) {
      await db.suppliers.update(editingId, formData);
    } else {
      await db.suppliers.add(formData);
    }

    setFormData({ name: '', contact: '', phone: '', type: 'supplier' });
    setIsAdding(false);
    setEditingId(null);
  };

  const handleEdit = (supplier: any) => {
    setFormData({ name: supplier.name, contact: supplier.contact || '', phone: supplier.phone || '', type: supplier.type || 'supplier' });
    setEditingId(supplier.id!);
    setIsAdding(true);
  };

  const executeDelete = async () => {
    if (deleteModal.id) {
      await db.suppliers.delete(deleteModal.id);
      setDeleteModal({ isOpen: false });
    }
  };

  return (
    <div className="space-y-6 relative">
      {deleteModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#161B22] rounded-xl shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 border border-transparent dark:border-slate-800">
            <div className="flex items-center gap-3 text-red-600 mb-4">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="text-lg font-bold">Eliminar Entidad</h3>
            </div>
            <p className="text-gray-600 dark:text-slate-400 mb-6">
              ¿Estás seguro de que deseas eliminar este registro? Esta acción no se puede deshacer.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteModal({ isOpen: false })}
                className="px-4 py-2 text-gray-700 dark:text-slate-400 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-md font-medium transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={executeDelete}
                className="px-4 py-2 text-white bg-red-600 hover:bg-red-700 rounded-md font-medium transition-colors"
              >
                Sí, Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-slate-100">Proveedores y Clientes</h2>
        {!isGuest && (
          <button
            onClick={() => {
              setIsAdding(true);
              setEditingId(null);
              setFormData({ name: '', contact: '', phone: '', type: 'supplier' });
            }}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Nueva Entidad
          </button>
        )}
      </div>

      {isGuest && (
        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-6 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center text-amber-600">
            <Lock className="w-6 h-6" />
          </div>
          <div>
            <h4 className="text-base font-bold text-amber-900">Modo Lectura Activo</h4>
            <p className="text-sm text-amber-700 font-medium">Como Invitado, puedes visualizar los proveedores y clientes pero no tienes permisos para realizar modificaciones.</p>
          </div>
        </div>
      )}

      {isAdding && (
        <div className="bg-white dark:bg-[#161B22] p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800">
          <h3 className="text-lg font-medium mb-4 text-slate-900 dark:text-slate-100">{editingId ? 'Editar Entidad' : 'Nueva Entidad'}</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-1">Tipo</label>
                <select
                  required
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value as 'supplier' | 'customer' })}
                  className="w-full border border-gray-300 dark:border-slate-700 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                >
                  <option value="supplier">Proveedor</option>
                  <option value="customer">Cliente</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-1">Nombre</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full border border-gray-300 dark:border-slate-700 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-1">Contacto</label>
                <input
                  type="text"
                  value={formData.contact}
                  onChange={(e) => setFormData({ ...formData, contact: e.target.value })}
                  className="w-full border border-gray-300 dark:border-slate-700 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-1">Teléfono</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full border border-gray-300 dark:border-slate-700 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="px-4 py-2 text-gray-700 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-md transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 transition-colors"
              >
                Guardar
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white dark:bg-[#161B22] rounded-xl shadow-sm border border-gray-100 dark:border-slate-800 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 dark:bg-slate-800/50 border-b border-gray-200 dark:border-slate-800">
              <th className="px-6 py-3 text-sm font-semibold text-gray-600 dark:text-slate-400">Nombre</th>
              <th className="px-6 py-3 text-sm font-semibold text-gray-600 dark:text-slate-400">Tipo</th>
              <th className="px-6 py-3 text-sm font-semibold text-gray-600 dark:text-slate-400">Contacto</th>
              <th className="px-6 py-3 text-sm font-semibold text-gray-600 dark:text-slate-400">Teléfono</th>
              <th className="px-6 py-3 text-sm font-semibold text-gray-600 dark:text-slate-400 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {suppliers?.map(supplier => (
              <tr key={supplier.id} className="border-b border-gray-100 dark:border-slate-800 last:border-0 hover:bg-gray-50 dark:hover:bg-slate-800/30 transition-colors">
                <td className="px-6 py-4 text-sm text-gray-900 dark:text-slate-100 font-medium">{supplier.name}</td>
                <td className="px-6 py-4 text-sm text-gray-500 dark:text-slate-500">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${supplier.type === 'customer' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300'}`}>
                    {supplier.type === 'customer' ? 'Cliente' : 'Proveedor'}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-gray-500 dark:text-slate-500">{supplier.contact || '-'}</td>
                <td className="px-6 py-4 text-sm text-gray-500 dark:text-slate-500">{supplier.phone || '-'}</td>
                <td className="px-6 py-4 text-sm text-right">
                  {!isGuest && (
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => handleEdit(supplier)}
                        className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeleteModal({ isOpen: true, id: supplier.id! })}
                        className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {suppliers?.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-gray-500 dark:text-slate-500">No hay proveedores ni clientes registrados.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
