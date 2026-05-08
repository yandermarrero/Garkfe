import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { formatCurrency, cn } from '../lib/utils';
import { Pencil, X, Store as StoreIcon, Plus, Save, Lock, Search, Trash2, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../lib/AuthContext';

export default function Products() {
  const { user } = useAuth();
  const isGuest = user?.role === 'guest';
  const products = useLiveQuery(() => db.products.toArray());
  const stores = useLiveQuery(() => db.stores.toArray());
  const storePrices = useLiveQuery(() => db.storePrices.toArray());

  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  const [isPriceModalOpen, setIsPriceModalOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [tempPrices, setTempPrices] = useState<{ [storeId: number]: string }>({});

  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; productId: number | null; productName: string }>({
    isOpen: false,
    productId: null,
    productName: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !costPrice) return;
    
    const finalPrice = price ? parseFloat(price) : 0;
    const finalCost = parseFloat(costPrice);

    if (editingId) {
      await db.products.update(editingId, {
        name: name.trim(),
        price: finalPrice,
        costPrice: finalCost
      });
    } else {
      await db.products.add({ 
        name: name.trim(), 
        price: finalPrice,
        costPrice: finalCost
      });
    }
    
    resetForm();
  };

  const handleDeleteProduct = async () => {
    if (!deleteModal.productId || isGuest) return;

    const pId = deleteModal.productId;

    try {
      await db.transaction('rw', [db.products, db.inventory, db.storePrices], async () => {
        // 1. Delete associated data
        await db.inventory.where({ productId: pId }).delete();
        await db.storePrices.where({ productId: pId }).delete();

        // 2. Delete the product itself
        await db.products.delete(pId);
      });
      
      setDeleteModal({ isOpen: false, productId: null, productName: '' });
    } catch (error) {
      console.error("Error deleting product:", error);
      alert("Error al eliminar el producto y sus datos asociados.");
    }
  };

  const handleEdit = (product: any) => {
    setEditingId(product.id);
    setName(product.name);
    setPrice(product.price.toString());
    setCostPrice((product.costPrice || 0).toString());
  };

  const handleOpenPriceModal = (productId: number) => {
    setSelectedProductId(productId);
    const prices: { [storeId: number]: string } = {};
    stores?.forEach(store => {
      const sp = storePrices?.find(p => p.productId === productId && p.storeId === store.id);
      prices[store.id!] = sp ? sp.price.toString() : '';
    });
    setTempPrices(prices);
    setIsPriceModalOpen(true);
  };

  const handleSaveStorePrices = async () => {
    if (!selectedProductId) return;

    for (const storeIdStr in tempPrices) {
      const storeId = parseInt(storeIdStr);
      const priceVal = parseFloat(tempPrices[storeId]);

      const existing = storePrices?.find(sp => sp.productId === selectedProductId && sp.storeId === storeId);

      if (isNaN(priceVal) || priceVal === 0) {
        if (existing) {
          await db.storePrices.delete(existing.id!);
        }
      } else {
        if (existing) {
          await db.storePrices.update(existing.id!, { price: priceVal });
        } else {
          await db.storePrices.add({
            productId: selectedProductId,
            storeId: storeId,
            price: priceVal
          });
        }
      }
    }
    setIsPriceModalOpen(false);
  };

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setPrice('');
    setCostPrice('');
  };

  const selectedProduct = products?.find(p => p.id === selectedProductId);

  const filteredProducts = products?.filter(p => 
    (showArchived ? true : !p.archived) &&
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      {!isGuest && (
        <div className="card p-6">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">{editingId ? 'Editar Producto' : 'Nuevo Producto'}</h3>
              <p className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Gestión de catálogo base</p>
            </div>
            {editingId && (
              <button onClick={resetForm} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-12 gap-6 items-end">
            <div className="md:col-span-5">
              <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 ml-1">Nombre del Producto</label>
              <input
                type="text"
                required
                placeholder="Ej. Arroz 1kg"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input-field"
              />
            </div>
            <div className="md:col-span-3">
              <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 ml-1">Precio de Costo</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 font-bold text-sm">$</span>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="0.00"
                  value={costPrice}
                  onChange={(e) => setCostPrice(e.target.value)}
                  className="input-field pl-8"
                />
              </div>
            </div>
            <div className="md:col-span-3">
              <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 ml-1">Precio Venta (Base)</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 font-bold text-sm">$</span>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="input-field pl-8"
                />
              </div>
            </div>
            <div className="md:col-span-1">
              <button type="submit" className="btn-primary w-full flex items-center justify-center p-3">
                {editingId ? <Save className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
              </button>
            </div>
          </form>
        </div>
      )}

      {isGuest && (
        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex items-center gap-3">
          <Lock className="w-5 h-5 text-amber-600" />
          <p className="text-sm font-bold text-amber-800">Modo Lectura: No tienes permisos para realizar cambios.</p>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">Catálogo de Productos</h3>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Ver Archivados</label>
              <button
                type="button"
                onClick={() => setShowArchived(!showArchived)}
                className={cn(
                  "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none",
                  showArchived ? "bg-indigo-600" : "bg-slate-200 dark:bg-slate-700"
                )}
              >
                <span
                  className={cn(
                    "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                    showArchived ? "translate-x-6" : "translate-x-1"
                  )}
                />
              </button>
            </div>
            <div className="relative w-full md:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
              <input
                type="text"
                placeholder="Buscar producto..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input-field pl-10 py-2 text-sm"
              />
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/30 dark:bg-slate-800/30 border-b border-slate-100 dark:border-slate-800">
                <th className="px-6 py-4 text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">ID</th>
                <th className="px-6 py-4 text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Nombre</th>
                <th className="px-6 py-4 text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Precio Costo</th>
                <th className="px-6 py-4 text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Precio Venta (Base)</th>
                <th className="px-6 py-4 text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
              {filteredProducts?.map(product => (
                <tr key={product.id} className="group hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="px-6 py-4 text-xs font-bold text-slate-400 dark:text-slate-500">#{product.id}</td>
                  <td className="px-6 py-4 text-sm text-slate-800 dark:text-slate-200 font-bold">{product.name}</td>
                  <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">{formatCurrency(product.costPrice || 0)}</td>
                  <td className="px-6 py-4 text-sm text-slate-900 dark:text-slate-100 font-bold">{formatCurrency(product.price)}</td>
                  <td className="px-6 py-4 text-sm text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => handleOpenPriceModal(product.id!)}
                        className="p-2 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-xl transition-all active:scale-90 border border-transparent hover:border-amber-100 dark:hover:border-amber-900/30"
                        title="Precios por Punto de Venta"
                      >
                        <StoreIcon className="w-4 h-4" />
                      </button>
                      {!isGuest && (
                        <>
                          <button
                            onClick={() => handleEdit(product)}
                            className="p-2 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-xl transition-all active:scale-90 border border-transparent hover:border-indigo-100 dark:hover:border-indigo-900/30"
                            title="Editar producto"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeleteModal({ isOpen: true, productId: product.id!, productName: product.name })}
                            className="p-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-xl transition-all active:scale-90 border border-transparent hover:border-rose-100 dark:hover:border-rose-900/30"
                            title="Eliminar producto"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {products?.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-400 dark:text-slate-500 font-medium">No hay productos registrados.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Store Prices Modal */}
      <AnimatePresence>
        {isPriceModalOpen && (
          <div className="fixed inset-0 bg-slate-900/40 dark:bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white dark:bg-[#161B22] rounded-3xl shadow-2xl max-w-lg w-full p-8 border border-slate-200 dark:border-slate-800"
            >
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Precios por Punto de Venta</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">{selectedProduct?.name}</p>
                </div>
                <button onClick={() => setIsPriceModalOpen(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
                  <X className="w-5 h-5 text-slate-400 dark:text-slate-500" />
                </button>
              </div>
              
              <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
                <div className="grid grid-cols-2 gap-4 px-2">
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Punto de Venta</span>
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Precio Especial</span>
                </div>
                {stores?.map(store => (
                  <div key={store.id} className="grid grid-cols-2 gap-4 items-center p-3 rounded-2xl bg-slate-50/50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 group hover:border-slate-200 dark:hover:border-slate-700 transition-colors">
                    <span className="text-sm text-slate-700 dark:text-slate-300 font-bold">{store.name}</span>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 font-bold text-xs">$</span>
                      <input
                        type="number"
                        step="0.01"
                        placeholder={formatCurrency(selectedProduct?.price || 0).replace('$', '')}
                        value={tempPrices[store.id!] || ''}
                        onChange={(e) => setTempPrices({ ...tempPrices, [store.id!]: e.target.value })}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl pl-7 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-900/10 text-sm font-bold text-slate-900 dark:text-slate-100 placeholder:text-slate-300 dark:placeholder:text-slate-700 transition-all"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-4 mt-8">
                <button
                  type="button"
                  onClick={() => setIsPriceModalOpen(false)}
                  className="btn-secondary flex-1 py-3"
                >
                  {isGuest ? 'Cerrar' : 'Cancelar'}
                </button>
                {!isGuest && (
                  <button
                    type="button"
                    onClick={handleSaveStorePrices}
                    className="btn-primary flex-1 py-3"
                  >
                    Guardar Cambios
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
                  <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">¿Eliminar Producto?</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Esta acción es irreversible.</p>
                </div>
              </div>

              <div className="bg-rose-50 dark:bg-rose-900/10 border border-rose-100 dark:border-rose-900/20 rounded-2xl p-4 mb-8">
                <p className="text-sm text-rose-800 dark:text-rose-300 font-medium leading-relaxed">
                  Se eliminará permanentemente el producto <span className="font-bold">"{deleteModal.productName}"</span> del catálogo y <span className="font-bold underline">TODA</span> su información de inventario asociada en todos los puntos de venta.
                </p>
                <p className="mt-2 text-xs text-rose-700 dark:text-rose-400 italic">
                  Nota: Los registros históricos de ventas y compras permanecerán, pero el producto aparecerá como "Desconocido".
                </p>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={() => setDeleteModal({ isOpen: false, productId: null, productName: '' })}
                  className="flex-1 py-3 px-4 rounded-xl font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDeleteProduct}
                  className="flex-1 py-3 px-4 rounded-xl font-bold text-white bg-rose-600 hover:bg-rose-700 shadow-lg shadow-rose-600/20 transition-all active:scale-95"
                >
                  Eliminar Producto
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
