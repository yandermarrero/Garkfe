import React, { useState, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { useStoreContext } from '../lib/StoreContext';
import { formatCurrency, cn } from '../lib/utils';
import { Package, TrendingUp, Plus, History, Lock, Trash2, X, Save, Edit2, Search, Store, AlertTriangle, Eye, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../lib/AuthContext';
import { InventoryItem, Transaction, Purchase } from '../lib/db';

export default function Inventory() {
  const { user } = useAuth();
  const isGuest = user?.role === 'guest';
  const { activeStoreId } = useStoreContext();
  const stores = useLiveQuery(() => db.stores.toArray());
  const products = useLiveQuery(() => db.products.toArray());
  const inventory = useLiveQuery(() => db.inventory.toArray());
  const storePrices = useLiveQuery(() => db.storePrices.toArray());

  const [storeId, setStoreId] = useState<string>(activeStoreId.toString());
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [adjustmentType, setAdjustmentType] = useState<'add' | 'remove'>('add');

  const [isNewProductModalOpen, setIsNewProductModalOpen] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [newProductPrice, setNewProductPrice] = useState('');
  const [newProductCostPrice, setNewProductCostPrice] = useState('');

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [editCostPrice, setEditCostPrice] = useState('');
  const [editProductName, setEditProductName] = useState('');
  const [editSellingPrice, setEditSellingPrice] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [productSearch, setProductSearch] = useState('');

  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [historyProductId, setHistoryProductId] = useState<number | null>(null);
  const [productHistory, setProductHistory] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  useEffect(() => {
    if (isHistoryModalOpen && historyProductId) {
      loadProductHistory(historyProductId);
    }
  }, [isHistoryModalOpen, historyProductId]);

  const loadProductHistory = async (pId: number) => {
    setIsLoadingHistory(true);
    try {
      const productTransactions = await db.transactions
        .filter(t => t.items.some(item => Number(item.productId) === Number(pId)))
        .toArray();
      
      const productPurchases = await db.purchases
        .filter(p => p.items.some(item => Number(item.productId) === Number(pId)))
        .toArray();

      const productAdjustments = await db.inventoryAdjustments
        .where('productId')
        .equals(pId)
        .toArray();

      const history = [
        ...productTransactions.map(t => ({
          id: t.id,
          date: t.date,
          type: t.type === 'sale' ? 'Venta' : 'Consignación (Salida)',
          storeId: t.fromStoreId,
          store: stores?.find(s => s.id === t.fromStoreId)?.name || 'Desconocido',
          quantity: -t.items.filter(i => Number(i.productId) === Number(pId)).reduce((sum, i) => sum + i.quantity, 0),
          reference: `Venta #${t.id}`,
          link: `/transactions`,
          color: 'text-rose-600 dark:text-rose-400',
          bgColor: 'bg-rose-50 dark:bg-rose-900/20'
        })),
        ...productTransactions.filter(t => t.toStoreId).map(t => ({
          id: t.id,
          date: t.date,
          type: 'Transferencia (Entrada)',
          storeId: t.toStoreId!,
          store: stores?.find(s => s.id === t.toStoreId)?.name || 'Desconocido',
          quantity: t.items.filter(i => Number(i.productId) === Number(pId)).reduce((sum, i) => sum + i.quantity, 0),
          reference: `Venta/Transf #${t.id}`,
          link: `/transactions`,
          color: 'text-emerald-600 dark:text-emerald-400',
          bgColor: 'bg-emerald-50 dark:bg-emerald-900/20'
        })),
        ...productPurchases.map(p => ({
          id: p.id,
          date: p.date,
          type: p.type === 'purchase' ? 'Compra' : 'Consignación (Entrada)',
          storeId: p.storeId,
          store: stores?.find(s => s.id === p.storeId)?.name || 'Desconocido',
          quantity: p.items.filter(i => Number(i.productId) === Number(pId)).reduce((sum, i) => sum + i.quantity, 0),
          reference: `Compra #${p.id}`,
          link: `/purchases`,
          color: 'text-emerald-600 dark:text-emerald-400',
          bgColor: 'bg-emerald-50 dark:bg-emerald-900/20'
        })),
        ...productAdjustments.map(a => ({
          id: a.id,
          date: a.date,
          type: a.type === 'add' ? 'Ajuste (Entrada)' : 'Ajuste (Salida)',
          storeId: a.storeId,
          store: stores?.find(s => s.id === a.storeId)?.name || 'Desconocido',
          quantity: a.quantity,
          reference: a.reason || 'Ajuste manual',
          link: '#',
          color: a.quantity > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400',
          bgColor: a.quantity > 0 ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-rose-50 dark:bg-rose-900/20'
        }))
      ].sort((a, b) => {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        if (dateA !== dateB) return dateA - dateB;
        return (a.id || 0) - (b.id || 0);
      });

      // Calculate running balance per store
      const storeBalances: Record<number, number> = {};
      const historyWithBalance = history.map(item => {
        const sId = item.storeId;
        storeBalances[sId] = (storeBalances[sId] || 0) + item.quantity;
        return { ...item, balanceAfter: storeBalances[sId] };
      });

      setProductHistory(historyWithBalance.reverse());
    } catch (error) {
      console.error("Error loading history:", error);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (activeStoreId) {
      setStoreId(activeStoreId.toString());
    } else {
      setStoreId('');
    }
  }, [activeStoreId]);

  useEffect(() => {
    if (productId) {
      const product = products?.find(p => p.id === parseInt(productId));
      if (product) {
        setCostPrice(product.costPrice?.toString() || '0');
      }
    } else {
      setCostPrice('');
    }
  }, [productId, products]);

  const handleAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeId || !productId || !quantity || (adjustmentType === 'add' && !costPrice)) return;

    const sId = parseInt(storeId);
    const pId = parseInt(productId);
    const qty = parseFloat(quantity);
    const cost = parseFloat(costPrice || '0');

    if (adjustmentType === 'add') {
      const existingBatches = await db.inventory.where({ storeId: sId, productId: pId }).toArray();
      const existing = existingBatches.find(b => b.costPrice === cost);
      if (existing) {
        await db.inventory.update(existing.id!, { quantity: existing.quantity + qty });
      } else {
        await db.inventory.add({ 
          storeId: sId, 
          productId: pId, 
          quantity: qty,
          costPrice: cost,
          dateAdded: new Date().toISOString()
        });
      }
      // Record adjustment
      await db.inventoryAdjustments.add({
        storeId: sId,
        productId: pId,
        quantity: qty,
        type: 'add',
        date: new Date().toISOString(),
        costPrice: cost,
        reason: 'Ajuste manual (Entrada)'
      });
    } else {
      // FIFO Removal: Deduct from the oldest batches first
      const batches = await db.inventory
        .where({ storeId: sId, productId: pId })
        .toArray();
      
      // Sort by dateAdded (oldest first)
      // If dateAdded is missing, treat it as very old (0)
      const sortedBatches = batches.sort((a, b) => {
        const dateA = a.dateAdded ? new Date(a.dateAdded).getTime() : 0;
        const dateB = b.dateAdded ? new Date(b.dateAdded).getTime() : 0;
        return dateA - dateB;
      });

      const totalStock = sortedBatches.reduce((sum, b) => sum + b.quantity, 0);
      if (totalStock < qty) {
        alert('No hay suficiente stock total para retirar esa cantidad.');
        return;
      }

      let remainingToRemove = qty;
      for (const batch of sortedBatches) {
        if (remainingToRemove <= 0) break;

        if (batch.quantity <= remainingToRemove) {
          remainingToRemove -= batch.quantity;
          await db.inventory.delete(batch.id!);
        } else {
          await db.inventory.update(batch.id!, { quantity: batch.quantity - remainingToRemove });
          remainingToRemove = 0;
        }
      }

      // Record adjustment
      await db.inventoryAdjustments.add({
        storeId: sId,
        productId: pId,
        quantity: -qty,
        type: 'remove',
        date: new Date().toISOString(),
        reason: 'Ajuste manual (Salida)'
      });
    }

    setQuantity('');
  };

  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; itemId: number | null; productName: string }>({
    isOpen: false,
    itemId: null,
    productName: ''
  });

  const handleDeleteItem = async () => {
    if (!deleteModal.itemId || isGuest) return;
    await db.inventory.delete(deleteModal.itemId);
    setDeleteModal({ isOpen: false, itemId: null, productName: '' });
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProductName.trim() || !newProductCostPrice) return;
    
    const finalPrice = newProductPrice ? parseFloat(newProductPrice) : 0;
    const finalCost = parseFloat(newProductCostPrice);

    const id = await db.products.add({
      name: newProductName.trim(),
      price: finalPrice,
      costPrice: finalCost
    });

    setProductId(id.toString());
    setIsNewProductModalOpen(false);
    setNewProductName('');
    setNewProductPrice('');
    setNewProductCostPrice('');
  };

  const handleEditItem = (item: InventoryItem) => {
    const product = products?.find(p => p.id === item.productId);
    const storePrice = storePrices?.find(sp => sp.productId === item.productId && sp.storeId === item.storeId);
    
    setEditingItem(item);
    setEditProductName(product?.name || '');
    setEditCostPrice((item.costPrice || product?.costPrice || 0).toString());
    setEditSellingPrice((storePrice?.price || product?.price || 0).toString());
    setIsEditModalOpen(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem || !editCostPrice || !editProductName) return;

    const newCost = parseFloat(editCostPrice);
    const newPrice = editSellingPrice ? parseFloat(editSellingPrice) : 0;

    // 0. Update Product Name
    await db.products.update(editingItem.productId, { name: editProductName });

    // 1. Update Inventory Item Cost
    const otherBatch = await db.inventory
      .where({ storeId: editingItem.storeId, productId: editingItem.productId })
      .filter(b => b.costPrice === newCost && b.id !== editingItem.id)
      .first();

    if (otherBatch) {
      // Merge with existing batch
      await db.inventory.update(otherBatch.id!, { quantity: otherBatch.quantity + editingItem.quantity });
      await db.inventory.delete(editingItem.id!);
    } else {
      // Just update cost
      await db.inventory.update(editingItem.id!, { costPrice: newCost });
    }

    // 2. Update Store Price
    const existingStorePrice = await db.storePrices
      .where({ storeId: editingItem.storeId, productId: editingItem.productId })
      .first();

    if (existingStorePrice) {
      await db.storePrices.update(existingStorePrice.id!, { price: newPrice });
    } else {
      await db.storePrices.add({
        storeId: editingItem.storeId,
        productId: editingItem.productId,
        price: newPrice
      });
    }

    setIsEditModalOpen(false);
    setEditingItem(null);
  };

  const getStoreName = (id: number) => stores?.find(s => s.id === id)?.name || 'Desconocido';
  const getProduct = (id: number) => products?.find(p => p.id === id);
  const getProductName = (id: number) => getProduct(id)?.name || 'Desconocido';

  const filteredInventory = useMemo(() => {
    if (!inventory || !products) return [];
    
    const search = searchTerm.trim().toLowerCase();
    const storeIdFilter = activeStoreId !== '' ? Number(activeStoreId) : null;

    if (storeIdFilter === null) return [];

    return inventory.filter(item => {
      // 1. Filtro por Punto de Venta
      if (item.storeId !== storeIdFilter) {
        return false;
      }

      // 2. Filtro por Nombre de Producto (Búsqueda por palabras)
      if (search) {
        const product = products.find(p => String(p.id) === String(item.productId));
        const name = (product?.name || 'Desconocido').toLowerCase();
        const searchWords = search.split(/\s+/).filter(w => w.length > 0);
        
        // Debe contener todas las palabras buscadas
        if (!searchWords.every(word => name.includes(word))) {
          return false;
        }
      }

      return true;
    });
  }, [inventory, products, activeStoreId, searchTerm]);

  // Calculate totals
  const totalCost = filteredInventory?.reduce((sum, item) => {
    const product = getProduct(item.productId);
    const cost = item.costPrice !== undefined ? item.costPrice : (product?.costPrice || 0);
    return sum + (cost * item.quantity);
  }, 0) || 0;

  const totalEstimatedProfit = filteredInventory?.reduce((sum, item) => {
    const product = getProduct(item.productId);
    const cost = item.costPrice !== undefined ? item.costPrice : (product?.costPrice || 0);
    const storePrice = storePrices?.find(sp => sp.productId === item.productId && sp.storeId === item.storeId);
    const price = storePrice ? storePrice.price : (product?.price || 0);
    return sum + ((price - cost) * item.quantity);
  }, 0) || 0;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Inventario</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Gestión de existencias y ajustes</p>
        </div>
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
          <input
            type="text"
            placeholder="Buscar en el inventario..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input-field pl-10 pr-10 py-3 text-sm shadow-sm bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card p-6 flex items-center gap-5">
          <div className="w-14 h-14 rounded-2xl bg-slate-900 dark:bg-slate-100 flex items-center justify-center text-white dark:text-slate-900 shadow-xl">
            <Package className="w-7 h-7" />
          </div>
          <div>
            <p className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">Costo Total Inventario</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{formatCurrency(totalCost)}</p>
          </div>
        </div>
        <div className="card p-6 flex items-center gap-5">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500 flex items-center justify-center text-white shadow-xl">
            <TrendingUp className="w-7 h-7" />
          </div>
          <div>
            <p className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">Ganancia Estimada Total</p>
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(totalEstimatedProfit)}</p>
          </div>
        </div>
      </div>

      {!isGuest ? (
        <div className="card p-6">
          <div className="flex items-center gap-2 mb-6">
            <History className="w-5 h-5 text-slate-400 dark:text-slate-500" />
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">Ajuste Manual de Inventario</h3>
          </div>
          <form onSubmit={handleAdjustment} className="grid grid-cols-1 md:grid-cols-12 gap-6 items-end">
            <div className="md:col-span-2">
              <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 ml-1">Tipo Ajuste</label>
              <select
                value={adjustmentType}
                onChange={(e) => setAdjustmentType(e.target.value as 'add' | 'remove')}
                className="input-field"
              >
                <option value="add">Entrada (+)</option>
                <option value="remove">Salida (-)</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 ml-1">Punto de Venta</label>
              <select
                required
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
                disabled={!!activeStoreId}
                className="input-field disabled:bg-slate-50 dark:disabled:bg-slate-900 disabled:cursor-not-allowed"
              >
                <option value="">Seleccionar...</option>
                {stores?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <div className="flex justify-between items-center mb-2 ml-1">
                <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Producto</label>
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 dark:text-slate-500" />
                  <input
                    type="text"
                    placeholder="Filtrar..."
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg pl-7 pr-2 py-1 text-[10px] focus:outline-none focus:ring-1 focus:ring-indigo-500 w-24 text-slate-700 dark:text-slate-300"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <select
                  required
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
                  className="input-field flex-1"
                >
                  <option value="">Seleccionar...</option>
                  {products?.filter(p => {
                    const matchesSearch = p.name.toLowerCase().includes(productSearch.toLowerCase());
                    if (!matchesSearch) return false;
                    
                    const sId = parseInt(storeId);
                    if (!sId) return true;

                    // Solo mostrar productos que ya tienen existencia en este punto de venta
                    return inventory?.some(i => i.storeId === sId && i.productId === p.id && i.quantity > 0);
                  }).map(p => {
                    const sId = parseInt(storeId);
                    const stock = inventory?.filter(i => i.storeId === sId && i.productId === p.id).reduce((sum, b) => sum + b.quantity, 0) || 0;
                    return <option key={p.id} value={p.id}>{p.name} (Stock: {stock})</option>;
                  })}
                </select>
                <button
                  type="button"
                  onClick={() => setIsNewProductModalOpen(true)}
                  className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors text-slate-600 dark:text-slate-400"
                  title="Nuevo Producto"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 ml-1">Costo Unitario</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 font-bold text-sm">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required={adjustmentType === 'add'}
                  value={costPrice}
                  onChange={(e) => setCostPrice(e.target.value)}
                  className="input-field pl-8"
                />
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 ml-1">Cantidad</label>
              <input
                type="number"
                step="0.01"
                required
                placeholder="0.00"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="input-field"
              />
            </div>
            <div className="md:col-span-2">
              <button 
                type="submit" 
                className={cn(
                  "btn-primary w-full flex items-center justify-center gap-2 p-3",
                  adjustmentType === 'remove' ? "bg-rose-600 hover:bg-rose-700 dark:bg-rose-600 dark:hover:bg-rose-700 dark:text-white" : ""
                )}
              >
                {adjustmentType === 'add' ? <Plus className="w-5 h-5" /> : <History className="w-5 h-5" />}
                <span>{adjustmentType === 'add' ? 'Agregar' : 'Quitar'}</span>
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-6 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center text-amber-600">
            <Lock className="w-6 h-6" />
          </div>
          <div>
            <h4 className="text-base font-bold text-amber-900">Modo Lectura Activo</h4>
            <p className="text-sm text-amber-700 font-medium">Como Invitado, puedes visualizar el inventario pero no tienes permisos para realizar ajustes manuales.</p>
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">Existencias en Inventario</h3>
        </div>
        <div className="overflow-x-auto">
          {activeStoreId === '' ? (
            <div className="p-12 text-center">
              <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                <Store className="w-8 h-8 text-slate-300 dark:text-slate-600" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-1">Seleccione un Punto de Venta</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Por favor, seleccione un punto de venta en el menú superior para ver su inventario.</p>
            </div>
          ) : filteredInventory.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                <Search className="w-8 h-8 text-slate-300 dark:text-slate-600" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-1">No se encontraron productos</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">No hay productos que coincidan con su búsqueda en este punto de venta.</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/30 dark:bg-slate-800/30 border-b border-slate-100 dark:border-slate-800">
                  <th className="px-6 py-4 text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Punto de Venta</th>
                  <th className="px-6 py-4 text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Producto</th>
                  <th className="px-6 py-4 text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-right">Costo Unitario</th>
                  <th className="px-6 py-4 text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Cantidad</th>
                  <th className="px-6 py-4 text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-right">Costo Total</th>
                  <th className="px-6 py-4 text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-right">Ganancia Est.</th>
                  {!isGuest && <th className="px-6 py-4 text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-right">Acciones</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                {filteredInventory?.map(item => {
                  const product = getProduct(item.productId);
                  const costPrice = item.costPrice !== undefined ? item.costPrice : (product?.costPrice || 0);
                  const storePrice = storePrices?.find(sp => sp.productId === item.productId && sp.storeId === item.storeId);
                  const sellingPrice = storePrice ? storePrice.price : (product?.price || 0);
                  const itemTotalCost = costPrice * item.quantity;
                  const itemEstimatedProfit = (sellingPrice - costPrice) * item.quantity;

                  return (
                    <tr key={item.id} className="group hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="px-6 py-4 text-sm text-slate-700 dark:text-slate-300 font-bold">{getStoreName(item.storeId)}</td>
                      <td className="px-6 py-4 text-sm text-slate-800 dark:text-slate-200 font-medium">{product?.name || 'Desconocido'}</td>
                      <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400 text-right">{formatCurrency(costPrice)}</td>
                      <td className="px-6 py-4 text-sm">
                        <span className={cn(
                          "inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-tight",
                          item.quantity > 10 ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/30" : "bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-400 border border-rose-100 dark:border-rose-900/30"
                        )}>
                          {item.quantity.toFixed(2)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-900 dark:text-slate-100 text-right font-bold">
                        {formatCurrency(itemTotalCost)}
                      </td>
                      <td className="px-6 py-4 text-sm text-emerald-600 dark:text-emerald-400 text-right font-bold">
                        {formatCurrency(itemEstimatedProfit)}
                      </td>
                      {!isGuest && (
                        <td className="px-6 py-4 text-sm text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => {
                                setHistoryProductId(item.productId);
                                setIsHistoryModalOpen(true);
                              }}
                              className="p-2 text-slate-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors"
                              title="Ver historial"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleEditItem(item)}
                              className="p-2 text-slate-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                              title="Editar precios"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => {
                                setStoreId(item.storeId.toString());
                                setProductId(item.productId.toString());
                                setAdjustmentType('remove');
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                              }}
                              className="p-2 text-slate-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors"
                              title="Quitar cantidad"
                            >
                              <History className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setDeleteModal({ 
                                isOpen: true, 
                                itemId: item.id!, 
                                productName: product?.name || 'Desconocido' 
                              })}
                              className="p-2 text-slate-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors"
                              title="Eliminar lote"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Edit Inventory Modal */}
      <AnimatePresence>
        {isEditModalOpen && editingItem && (
          <div className="fixed inset-0 bg-slate-900/40 dark:bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white dark:bg-[#161B22] rounded-3xl shadow-2xl max-w-lg w-full p-8 border border-slate-200 dark:border-slate-800"
            >
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Editar Producto</h3>
                  <p className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                    {getStoreName(editingItem.storeId)}
                  </p>
                </div>
                <button onClick={() => setIsEditModalOpen(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
                  <X className="w-5 h-5 text-slate-400 dark:text-slate-500" />
                </button>
              </div>
              
              <form onSubmit={handleSaveEdit} className="space-y-6">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 ml-1">Nombre del Producto</label>
                  <input
                    type="text"
                    required
                    value={editProductName}
                    onChange={(e) => setEditProductName(e.target.value)}
                    className="input-field"
                  />
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 ml-1">Precio de Costo</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 font-bold text-sm">$</span>
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={editCostPrice}
                        onChange={(e) => setEditCostPrice(e.target.value)}
                        className="input-field pl-8"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 ml-1">Precio Venta (Punto)</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 font-bold text-sm">$</span>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={editSellingPrice}
                        onChange={(e) => setEditSellingPrice(e.target.value)}
                        className="input-field pl-8"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex gap-4 mt-8">
                  <button
                    type="button"
                    onClick={() => setIsEditModalOpen(false)}
                    className="btn-secondary flex-1 py-3"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="btn-primary flex-1 py-3 flex items-center justify-center gap-2"
                  >
                    <Save className="w-5 h-5" />
                    <span>Guardar Cambios</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* New Product Modal */}
      <AnimatePresence>
        {isNewProductModalOpen && (
          <div className="fixed inset-0 bg-slate-900/40 dark:bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white dark:bg-[#161B22] rounded-3xl shadow-2xl max-w-lg w-full p-8 border border-slate-200 dark:border-slate-800"
            >
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Crear Nuevo Producto</h3>
                  <p className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Añadir al catálogo base</p>
                </div>
                <button onClick={() => setIsNewProductModalOpen(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
                  <X className="w-5 h-5 text-slate-400 dark:text-slate-500" />
                </button>
              </div>
              
              <form onSubmit={handleCreateProduct} className="space-y-6">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 ml-1">Nombre del Producto</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Arroz 1kg"
                    value={newProductName}
                    onChange={(e) => setNewProductName(e.target.value)}
                    className="input-field"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 ml-1">Precio de Costo</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 font-bold text-sm">$</span>
                      <input
                        type="number"
                        step="0.01"
                        required
                        placeholder="0.00"
                        value={newProductCostPrice}
                        onChange={(e) => setNewProductCostPrice(e.target.value)}
                        className="input-field pl-8"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 ml-1">Precio Venta (Base)</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 font-bold text-sm">$</span>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={newProductPrice}
                        onChange={(e) => setNewProductPrice(e.target.value)}
                        className="input-field pl-8"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex gap-4 mt-8">
                  <button
                    type="button"
                    onClick={() => setIsNewProductModalOpen(false)}
                    className="btn-secondary flex-1 py-3"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="btn-primary flex-1 py-3 flex items-center justify-center gap-2"
                  >
                    <Save className="w-5 h-5" />
                    <span>Guardar Producto</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Product History Modal */}
      <AnimatePresence>
        {isHistoryModalOpen && historyProductId && (
          <div className="fixed inset-0 bg-slate-900/40 dark:bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white dark:bg-[#161B22] rounded-3xl shadow-2xl max-w-4xl w-full p-8 border border-slate-200 dark:border-slate-800 flex flex-col max-h-[90vh]"
            >
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">Historial de Movimientos</h3>
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                    {getProductName(historyProductId)}
                  </p>
                </div>
                <button 
                  onClick={() => setIsHistoryModalOpen(false)} 
                  className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                >
                  <X className="w-5 h-5 text-slate-400 dark:text-slate-500" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                {isLoadingHistory ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-4">
                    <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Cargando historial...</p>
                  </div>
                ) : productHistory.length === 0 ? (
                  <div className="text-center py-20">
                    <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                      <History className="w-8 h-8 text-slate-300 dark:text-slate-600" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-1">Sin movimientos registrados</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Este producto aún no tiene compras ni ventas registradas.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                          <th className="px-4 py-3 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Fecha</th>
                          <th className="px-4 py-3 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Tipo</th>
                          <th className="px-4 py-3 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Punto de Venta</th>
                          <th className="px-4 py-3 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-right">Cantidad</th>
                          <th className="px-4 py-3 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-right">Stock Resultante</th>
                          <th className="px-4 py-3 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Referencia</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                        {productHistory.map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                            <td className="px-4 py-4 text-sm text-slate-500 dark:text-slate-500">
                              {new Date(item.date).toLocaleString()}
                            </td>
                            <td className="px-4 py-4 text-sm">
                              <span className={cn(
                                "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-tight",
                                item.bgColor,
                                item.color
                              )}>
                                {item.type}
                              </span>
                            </td>
                            <td className="px-4 py-4 text-sm text-slate-700 dark:text-slate-300 font-medium">
                              {item.store}
                            </td>
                            <td className={cn(
                              "px-4 py-4 text-sm text-right font-bold",
                              item.quantity > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                            )}>
                              {item.quantity > 0 ? '+' : ''}{item.quantity.toFixed(2)}
                            </td>
                            <td className="px-4 py-4 text-sm text-right font-bold text-slate-900 dark:text-slate-100">
                              {item.balanceAfter.toFixed(2)}
                            </td>
                            <td className="px-4 py-4 text-sm">
                              <div className="flex items-center gap-2">
                                <span className="text-slate-600 dark:text-slate-400">{item.reference}</span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                <button
                  onClick={() => setIsHistoryModalOpen(false)}
                  className="px-6 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold rounded-xl transition-all"
                >
                  Cerrar
                </button>
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
                  <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">¿Eliminar Lote?</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Esta acción eliminará la existencia seleccionada.</p>
                </div>
              </div>

              <div className="bg-rose-50 dark:bg-rose-900/10 border border-rose-100 dark:border-rose-900/20 rounded-2xl p-4 mb-8">
                <p className="text-sm text-rose-800 dark:text-rose-300 font-medium leading-relaxed">
                  ¿Estás seguro de que deseas eliminar este lote de <span className="font-bold">"{deleteModal.productName}"</span> del inventario?
                </p>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={() => setDeleteModal({ isOpen: false, itemId: null, productName: '' })}
                  className="flex-1 py-3 px-4 rounded-xl font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDeleteItem}
                  className="flex-1 py-3 px-4 rounded-xl font-bold text-white bg-rose-600 hover:bg-rose-700 shadow-lg shadow-rose-600/20 transition-all active:scale-95"
                >
                  Eliminar Lote
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
