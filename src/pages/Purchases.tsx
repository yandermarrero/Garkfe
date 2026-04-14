import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { formatCurrency, cn, toLocalISO, fromLocalISO } from '../lib/utils';
import { Trash2, CheckCircle, XCircle, Plus, Lock, Search } from 'lucide-react';
import { useStoreContext } from '../lib/StoreContext';
import { useAuth } from '../lib/AuthContext';

export default function Purchases() {
  const { user } = useAuth();
  const isGuest = user?.role === 'guest';
  const { activeStoreId } = useStoreContext();
  const stores = useLiveQuery(() => db.stores.toArray());
  const products = useLiveQuery(() => db.products.toArray());
  const suppliers = useLiveQuery(() => db.suppliers.toArray());

  const [destStoreId, setDestStoreId] = useState<string>(activeStoreId.toString());
  const [supplierId, setSupplierId] = useState('');
  const [type, setType] = useState<'purchase' | 'consignment'>('purchase');
  const [paymentStatus, setPaymentStatus] = useState<'paid' | 'credit'>('paid');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer'>('cash');
  
  const [cart, setCart] = useState<{ productId: number, quantity: number, costPrice: number }[]>([]);
  const [selectedProduct, setSelectedProduct] = useState('');
  const [selectedQuantity, setSelectedQuantity] = useState('1.00');
  const [selectedCostPrice, setSelectedCostPrice] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString());
  const [productSearch, setProductSearch] = useState('');
  
  const [extraExpense, setExtraExpense] = useState('0');
  const [extraExpenseAccount, setExtraExpenseAccount] = useState<'cash' | 'transfer'>('cash');
  const [extraIncome, setExtraIncome] = useState('0');
  const [extraIncomeAccount, setExtraIncomeAccount] = useState<'cash' | 'transfer'>('cash');
  
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState('');
  const [newSupplierPhone, setNewSupplierPhone] = useState('');

  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // New Product Modal State
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [newProductPrice, setNewProductPrice] = useState('');
  const [newProductCost, setNewProductCost] = useState('');

  useEffect(() => {
    if (activeStoreId) {
      setDestStoreId(activeStoreId.toString());
    } else {
      setDestStoreId('');
    }
  }, [activeStoreId]);

  useEffect(() => {
    if (selectedProduct) {
      const p = products?.find(p => p.id === parseInt(selectedProduct));
      if (p) {
        setSelectedCostPrice(p.costPrice?.toString() || '0');
      }
    }
  }, [selectedProduct, products]);

  const handleAddToCart = () => {
    if (!selectedProduct || !selectedQuantity || !selectedCostPrice) return;
    const pId = parseInt(selectedProduct);
    const qty = parseFloat(selectedQuantity);
    const cost = parseFloat(selectedCostPrice);
    
    if (qty <= 0 || cost < 0) return;

    setCart(prev => {
      const existing = prev.find(item => item.productId === pId);
      if (existing) {
        return prev.map(item => item.productId === pId ? { ...item, quantity: item.quantity + qty, costPrice: cost } : item);
      }
      return [...prev, { productId: pId, quantity: qty, costPrice: cost }];
    });
    setSelectedProduct('');
    setSelectedQuantity('1.00');
    setSelectedCostPrice('');
  };

  const handleRemoveFromCart = (pId: number) => {
    setCart(prev => prev.filter(item => item.productId !== pId));
  };

  const handleAddSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSupplierName.trim()) return;
    
    try {
      const id = await db.suppliers.add({
        name: newSupplierName.trim(),
        phone: newSupplierPhone.trim() || undefined,
        type: 'supplier'
      });
      setSupplierId(id.toString());
      setIsSupplierModalOpen(false);
      setNewSupplierName('');
      setNewSupplierPhone('');
    } catch (error) {
      console.error('Error adding supplier:', error);
    }
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProductName.trim()) return;
    
    const price = newProductPrice ? parseFloat(newProductPrice) : 0;
    const cost = newProductCost ? parseFloat(newProductCost) : 0;
    
    if (isNaN(price) || price < 0 || isNaN(cost) || cost < 0) return;

    try {
      const id = await db.products.add({
        name: newProductName.trim(),
        price: price,
        costPrice: cost
      });
      setSelectedProduct(id.toString());
      setSelectedCostPrice(cost.toString());
      setIsProductModalOpen(false);
      setNewProductName('');
      setNewProductPrice('');
      setNewProductCost('');
    } catch (error) {
      console.error('Error adding product:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!destStoreId || !supplierId || cart.length === 0) return;

    const dId = parseInt(destStoreId);
    const sId = parseInt(supplierId);

    try {
      await db.transaction('rw', [db.inventory, db.purchases, db.debts, db.products, db.expenses], async () => {
        // 1. Add to inventory and update product cost price
        for (const item of cart) {
          const inv = await db.inventory.where({ storeId: dId, productId: item.productId }).toArray();
          const existingBatch = inv.find(i => i.costPrice === item.costPrice);
          
          if (existingBatch) {
            await db.inventory.update(existingBatch.id!, { quantity: existingBatch.quantity + item.quantity });
          } else {
            await db.inventory.add({ 
              storeId: dId, 
              productId: item.productId, 
              quantity: item.quantity,
              costPrice: item.costPrice,
              dateAdded: new Date(purchaseDate).toISOString()
            });
          }
          
          // Update product cost price (latest)
          await db.products.update(item.productId, { costPrice: item.costPrice });
        }

        // 2. Create purchase record
        const totalAmount = cart.reduce((sum, item) => sum + (item.costPrice * item.quantity), 0);
        const exp = parseFloat(extraExpense) || 0;
        const inc = parseFloat(extraIncome) || 0;

        const purchaseId = await db.purchases.add({
          storeId: dId,
          supplierId: sId,
          date: new Date(purchaseDate).toISOString(),
          totalAmount,
          items: cart,
          paymentStatus,
          paymentMethod: paymentStatus === 'paid' ? paymentMethod : undefined,
          extraExpense: exp,
          extraExpenseAccount: exp > 0 ? extraExpenseAccount : undefined,
          extraIncome: inc,
          extraIncomeAccount: inc > 0 ? extraIncomeAccount : undefined,
          type
        });

        if (exp > 0) {
          await db.expenses.add({ storeId: dId, date: new Date(purchaseDate).toISOString(), description: `Gasto extra en compra #${purchaseId}`, amount: exp, type: 'expense', paymentMethod: extraExpenseAccount, purchaseId: purchaseId as number });
        }
        if (inc > 0) {
          await db.expenses.add({ storeId: dId, date: new Date(purchaseDate).toISOString(), description: `Ingreso extra en compra #${purchaseId}`, amount: inc, type: 'income', paymentMethod: extraIncomeAccount, purchaseId: purchaseId as number });
        }

        // 3. Create debt if on credit or consignment
        if (paymentStatus === 'credit' || type === 'consignment') {
          await db.debts.add({
            debtorStoreId: dId,
            supplierId: sId,
            purchaseId: purchaseId as number,
            amount: totalAmount,
            status: 'pending',
            date: new Date(purchaseDate).toISOString(),
            type: 'payable'
          });
        }
      });

      setStatusMessage({ type: 'success', text: 'Compra registrada con éxito' });
      setCart([]);
      setSupplierId('');
      setPaymentStatus('paid');
      setPaymentMethod('cash');
      setExtraExpense('0');
      setExtraIncome('0');
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (error: any) {
      setStatusMessage({ type: 'error', text: error.message });
      setTimeout(() => setStatusMessage(null), 3000);
    }
  };

  const total = cart.reduce((sum, item) => sum + (item.costPrice * item.quantity), 0);
  const getProductName = (id: number) => products?.find(p => p.id === id)?.name || 'Desconocido';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 relative">
      {statusMessage && (
        <div className={`absolute top-0 left-0 right-0 z-10 p-4 rounded-md flex items-center gap-3 shadow-md ${statusMessage.type === 'success' ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300 border border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-800'}`}>
          {statusMessage.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
          <p className="text-sm font-medium">{statusMessage.text}</p>
        </div>
      )}

      {/* Modal Nuevo Proveedor */}
      {isSupplierModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#161B22] rounded-xl shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 border border-transparent dark:border-slate-800">
            <h3 className="text-lg font-bold mb-4 text-slate-900 dark:text-slate-100">Nuevo Proveedor</h3>
            <form onSubmit={handleAddSupplier} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-1">Nombre del Proveedor</label>
                <input
                  type="text"
                  required
                  value={newSupplierName}
                  onChange={(e) => setNewSupplierName(e.target.value)}
                  className="w-full border border-gray-300 dark:border-slate-700 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                  placeholder="Ej. Distribuidora XYZ"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-1">Teléfono (Opcional)</label>
                <input
                  type="tel"
                  value={newSupplierPhone}
                  onChange={(e) => setNewSupplierPhone(e.target.value)}
                  className="w-full border border-gray-300 dark:border-slate-700 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                  placeholder="Ej. +1 234 567 890"
                />
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsSupplierModalOpen(false)}
                  className="px-4 py-2 text-gray-700 dark:text-slate-400 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-md font-medium transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-md font-medium transition-colors"
                >
                  Guardar Proveedor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Nuevo Producto */}
      {isProductModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#161B22] rounded-xl shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 border border-transparent dark:border-slate-800">
            <h3 className="text-lg font-bold mb-4 text-slate-900 dark:text-slate-100">Nuevo Producto</h3>
            <form onSubmit={handleAddProduct} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-1">Nombre del Producto</label>
                <input
                  type="text"
                  required
                  value={newProductName}
                  onChange={(e) => setNewProductName(e.target.value)}
                  className="w-full border border-gray-300 dark:border-slate-700 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                  placeholder="Ej. Camiseta Algodón"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-1">Precio de Venta</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={newProductPrice}
                    onChange={(e) => setNewProductPrice(e.target.value)}
                    className="w-full border border-gray-300 dark:border-slate-700 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-1">Costo (Opcional)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={newProductCost}
                    onChange={(e) => setNewProductCost(e.target.value)}
                    className="w-full border border-gray-300 dark:border-slate-700 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                    placeholder="0.00"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsProductModalOpen(false)}
                  className="px-4 py-2 text-gray-700 dark:text-slate-400 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-md font-medium transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-md font-medium transition-colors"
                >
                  Guardar Producto
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="lg:col-span-2 space-y-6 mt-2">
        {!isGuest ? (
          <div className="bg-white dark:bg-[#161B22] p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800">
            <h3 className="text-lg font-medium mb-4 text-slate-900 dark:text-slate-100">Nueva Compra</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-1">Tipo de Compra</label>
                    <select
                      value={type}
                      onChange={(e) => setType(e.target.value as any)}
                      className="w-full border border-gray-300 dark:border-slate-700 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                    >
                      <option value="purchase">Compra Directa</option>
                      <option value="consignment">Compra por Consignación</option>
                    </select>
                  </div>
                <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-1">Punto de Venta Destino</label>
                    <select
                      required
                      value={destStoreId}
                      onChange={(e) => setDestStoreId(e.target.value)}
                      disabled={!!activeStoreId}
                      className="w-full border border-gray-300 dark:border-slate-700 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 disabled:bg-gray-100 dark:disabled:bg-slate-800 disabled:cursor-not-allowed"
                    >
                      <option value="">Seleccionar...</option>
                      {stores?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between items-center mb-1">
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-400">Proveedor</label>
                      <button
                        type="button"
                        onClick={() => setIsSupplierModalOpen(true)}
                        className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" /> Nuevo
                      </button>
                    </div>
                    <select
                      required
                      value={supplierId}
                      onChange={(e) => setSupplierId(e.target.value)}
                      className="w-full border border-gray-300 dark:border-slate-700 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                    >
                      <option value="">Seleccionar...</option>
                      {suppliers?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  {type === 'purchase' && (
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-1">Estado de Pago</label>
                      <select
                        value={paymentStatus}
                        onChange={(e) => setPaymentStatus(e.target.value as any)}
                        className="w-full border border-gray-300 dark:border-slate-700 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                      >
                        <option value="paid">Pagado (Al contado)</option>
                        <option value="credit">A Crédito (Por Pagar)</option>
                      </select>
                    </div>
                  )}
                  {type === 'purchase' && paymentStatus === 'paid' && (
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-1">Método de Pago</label>
                      <select
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value as any)}
                        className="w-full border border-gray-300 dark:border-slate-700 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                      >
                        <option value="cash">Efectivo</option>
                        <option value="transfer">Transferencia</option>
                      </select>
                    </div>
                  )}
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-1">Fecha de Compra</label>
                    <input
                      type="datetime-local"
                      required
                      value={toLocalISO(purchaseDate)}
                      onChange={(e) => setPurchaseDate(fromLocalISO(e.target.value))}
                      className="w-full border border-gray-300 dark:border-slate-700 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                    />
                  </div>
                </div>

                <div className="border-t border-gray-200 dark:border-slate-800 pt-4 mt-4">
                  <h4 className="text-sm font-medium text-gray-700 dark:text-slate-300 mb-3">Agregar Productos</h4>
                  <div className="flex gap-4 items-end flex-wrap">
                    <div className="flex-1 min-w-[200px]">
                      <div className="flex justify-between items-center mb-1">
                        <label className="block text-xs font-medium text-gray-500 dark:text-slate-500">Producto</label>
                        <div className="flex items-center gap-2">
                          <div className="relative">
                            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 dark:text-slate-500" />
                            <input
                              type="text"
                              placeholder="Filtrar..."
                              value={productSearch}
                              onChange={(e) => setProductSearch(e.target.value)}
                              className="bg-gray-50 dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 rounded-md pl-7 pr-2 py-1 text-[10px] focus:outline-none focus:ring-1 focus:ring-blue-500 w-32 text-slate-900 dark:text-slate-100"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => setIsProductModalOpen(true)}
                            className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium flex items-center gap-1"
                          >
                            <Plus className="w-3 h-3" /> Nuevo
                          </button>
                        </div>
                      </div>
                      <select
                        value={selectedProduct}
                        onChange={(e) => setSelectedProduct(e.target.value)}
                        className="w-full border border-gray-300 dark:border-slate-700 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                      >
                        <option value="">Seleccionar producto...</option>
                        {products?.filter(p => p.name.toLowerCase().includes(productSearch.toLowerCase())).map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="w-24">
                      <label className="block text-xs font-medium text-gray-500 dark:text-slate-500 mb-1">Cantidad</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={selectedQuantity}
                        onChange={(e) => setSelectedQuantity(e.target.value)}
                        className="w-full border border-gray-300 dark:border-slate-700 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                      />
                    </div>
                    <div className="w-32">
                      <label className="block text-xs font-medium text-gray-500 dark:text-slate-500 mb-1">Costo Unitario</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={selectedCostPrice}
                        onChange={(e) => setSelectedCostPrice(e.target.value)}
                        className="w-full border border-gray-300 dark:border-slate-700 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleAddToCart}
                      className="bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 px-6 py-2 rounded-md hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors font-medium h-[42px]"
                    >
                      Añadir
                    </button>
                  </div>
                </div>

                <div className="border-t border-gray-200 dark:border-slate-800 pt-4 mt-4">
                  <h4 className="text-sm font-medium text-gray-700 dark:text-slate-300 mb-3">Gastos / Ingresos Extras</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-1">Gasto Extra</label>
                      <div className="flex gap-2">
                        <input type="number" min="0" step="0.01" value={extraExpense} onChange={(e) => setExtraExpense(e.target.value)} className="flex-1 border border-gray-300 dark:border-slate-700 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100" />
                        <select value={extraExpenseAccount} onChange={(e) => setExtraExpenseAccount(e.target.value as any)} className="w-24 border border-gray-300 dark:border-slate-700 rounded-md px-2 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-xs">
                          <option value="cash">Efectivo</option>
                          <option value="transfer">Transf.</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-1">Ingreso Extra</label>
                      <div className="flex gap-2">
                        <input type="number" min="0" step="0.01" value={extraIncome} onChange={(e) => setExtraIncome(e.target.value)} className="flex-1 border border-gray-300 dark:border-slate-700 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100" />
                        <select value={extraIncomeAccount} onChange={(e) => setExtraIncomeAccount(e.target.value as any)} className="w-24 border border-gray-300 dark:border-slate-700 rounded-md px-2 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-xs">
                          <option value="cash">Efectivo</option>
                          <option value="transfer">Transf.</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

              <div className="border-t border-gray-200 dark:border-slate-800 pt-4 mt-4 flex justify-end">
                <button
                  type="submit"
                  disabled={cart.length === 0 || !destStoreId || !supplierId}
                  className="bg-blue-600 text-white px-8 py-3 rounded-md hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Confirmar Compra
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
              <p className="text-sm text-amber-700 font-medium">Como Invitado, puedes visualizar las compras pero no tienes permisos para registrar nuevas operaciones.</p>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-[#161B22] p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800 flex flex-col h-[calc(100vh-8rem)]">
        <h3 className="text-lg font-medium mb-4 text-slate-900 dark:text-slate-100">Resumen de Compra</h3>
        <div className="flex-1 overflow-auto">
          {cart.length === 0 ? (
            <p className="text-gray-500 dark:text-slate-500 text-center py-8">No hay productos añadidos.</p>
          ) : (
            <ul className="space-y-3">
              {cart.map((item, idx) => (
                <li key={idx} className="flex justify-between items-center bg-gray-50 dark:bg-slate-800/50 p-3 rounded-lg border border-gray-100 dark:border-slate-800">
                  <div>
                    <p className="font-medium text-gray-900 dark:text-slate-100">{getProductName(item.productId)}</p>
                    <p className="text-sm text-gray-500 dark:text-slate-500">{item.quantity.toFixed(2)} x {formatCurrency(item.costPrice)}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <p className="font-medium text-gray-900 dark:text-slate-100">{formatCurrency(item.costPrice * item.quantity)}</p>
                    <button type="button" onClick={() => handleRemoveFromCart(item.productId)} className={cn("text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 p-1 rounded", isGuest && "hidden")}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="border-t border-gray-200 dark:border-slate-800 pt-4 mt-4 space-y-2">
          <div className="flex justify-between items-center text-gray-600 dark:text-slate-400">
            <span>Subtotal Productos:</span>
            <span>{formatCurrency(total)}</span>
          </div>
          <div className="flex justify-between items-center text-gray-600 dark:text-slate-400">
            <span>Ingreso Extra:</span>
            <span className="text-green-500 dark:text-green-400">+{formatCurrency(parseFloat(extraIncome) || 0)}</span>
          </div>
          <div className="flex justify-between items-center text-gray-600 dark:text-slate-400">
            <span>Gasto Extra:</span>
            <span className="text-red-500 dark:text-red-400">+{formatCurrency(parseFloat(extraExpense) || 0)}</span>
          </div>
          <div className="flex justify-between items-center text-lg font-bold text-gray-900 dark:text-slate-100 pt-2 border-t border-gray-100 dark:border-slate-800">
            <span>Total Compra:</span>
            <span>{formatCurrency(total + (parseFloat(extraExpense) || 0) - (parseFloat(extraIncome) || 0))}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
