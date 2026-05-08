import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { formatCurrency, cn, toLocalISO, fromLocalISO, formatNumber } from '../lib/utils';
import { Trash2, CheckCircle, XCircle, Plus, ShoppingBag, UserPlus, PackagePlus, CreditCard, Wallet, ArrowRight, History, Store, ShoppingCart, Lock, Search, AlertTriangle } from 'lucide-react';
import { useStoreContext } from '../lib/StoreContext';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../lib/AuthContext';

export default function Sales() {
  const { user } = useAuth();
  const isGuest = user?.role === 'guest';
  const { activeStoreId } = useStoreContext();
  const stores = useLiveQuery(() => db.stores.toArray());
  const products = useLiveQuery(() => db.products.toArray());
  const inventory = useLiveQuery(() => db.inventory.toArray());
  const customers = useLiveQuery(() => db.suppliers.where('type').equals('customer').toArray());
  const storePrices = useLiveQuery(() => db.storePrices.toArray());

  const [type, setType] = useState<'sale' | 'consignment'>('sale');
  const [targetType, setTargetType] = useState<'customer' | 'store'>('customer');
  const [originStoreId, setOriginStoreId] = useState<string>(activeStoreId.toString());
  const [destStoreId, setDestStoreId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');

  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [newProductCategory, setNewProductCategory] = useState('');
  const [newProductPrice, setNewProductPrice] = useState('0');
  const [newProductCostPrice, setNewProductCostPrice] = useState('0');
  const [newProductMinStock, setNewProductMinStock] = useState('0');
  
  const [extraExpense, setExtraExpense] = useState('0');
  const [extraExpenseAccount, setExtraExpenseAccount] = useState<'cash' | 'transfer'>('cash');
  const [extraIncome, setExtraIncome] = useState('0');
  const [extraIncomeAccount, setExtraIncomeAccount] = useState<'cash' | 'transfer'>('cash');
  const [creditClients, setCreditClients] = useState<{ name: string, amount: string }[]>([]);
  const [cashAmount, setCashAmount] = useState('0');
  const [transferAmount, setTransferAmount] = useState('0');
  const [shrinkage, setShrinkage] = useState('0');
  const [cashierName, setCashierName] = useState('');

  const [cart, setCart] = useState<{ productId: number, quantity: number, price: number, costPrice: number }[]>([]);
  const [shrinkageCart, setShrinkageCart] = useState<{ productId: number, quantity: number, price: number, costPrice: number }[]>([]);
  const [selectedProduct, setSelectedProduct] = useState('');
  const [selectedQuantity, setSelectedQuantity] = useState('1.00');
  const [selectedShrinkageProduct, setSelectedShrinkageProduct] = useState('');
  const [selectedShrinkageQuantity, setSelectedShrinkageQuantity] = useState('1.00');
  const [saleDate, setSaleDate] = useState(new Date().toISOString());
  const [productSearch, setProductSearch] = useState('');
  const [shrinkageProductSearch, setShrinkageProductSearch] = useState('');
  
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // Persistence logic
  useEffect(() => {
    const savedData = localStorage.getItem('pending_sale');
    if (savedData) {
      try {
        const { data, timestamp } = JSON.parse(savedData);
        const now = new Date().getTime();
        const fourHours = 4 * 60 * 60 * 1000;

        if (now - timestamp < fourHours) {
          setType(data.type || 'sale');
          setTargetType(data.targetType || 'customer');
          setCustomerName(data.customerName || '');
          setCart(data.cart || []);
          setShrinkageCart(data.shrinkageCart || []);
          setExtraExpense(data.extraExpense || '0');
          setExtraIncome(data.extraIncome || '0');
          setCashAmount(data.cashAmount || '0');
          setTransferAmount(data.transferAmount || '0');
          setShrinkage(data.shrinkage || '0');
          setCashierName(data.cashierName || '');
          setCreditClients(data.creditClients || []);
        } else {
          localStorage.removeItem('pending_sale');
        }
      } catch (e) {
        console.error('Error restoring sale data:', e);
      }
    }
  }, []);

  useEffect(() => {
    const saleData = {
      type,
      targetType,
      customerName,
      cart,
      shrinkageCart,
      extraExpense,
      extraIncome,
      cashAmount,
      transferAmount,
      shrinkage,
      cashierName,
      creditClients
    };
    
    if (cart.length > 0 || shrinkageCart.length > 0 || customerName || cashierName) {
      localStorage.setItem('pending_sale', JSON.stringify({
        data: saleData,
        timestamp: new Date().getTime()
      }));
    } else {
      localStorage.removeItem('pending_sale');
    }
  }, [type, targetType, customerName, cart, shrinkageCart, extraExpense, extraIncome, cashAmount, transferAmount, shrinkage, cashierName, creditClients]);

  useEffect(() => {
    if (activeStoreId) {
      setOriginStoreId(activeStoreId.toString());
    } else {
      setOriginStoreId('');
    }
  }, [activeStoreId]);

  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustomerName.trim()) return;
    
    try {
      await db.suppliers.add({
        name: newCustomerName.trim(),
        phone: newCustomerPhone.trim() || undefined,
        type: 'customer'
      });
      setCustomerName(newCustomerName.trim());
      setIsCustomerModalOpen(false);
      setNewCustomerName('');
      setNewCustomerPhone('');
    } catch (error) {
      console.error('Error adding customer:', error);
    }
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProductName.trim()) return;
    
    try {
      const id = await db.products.add({
        name: newProductName.trim(),
        category: newProductCategory.trim() || 'General',
        price: parseFloat(newProductPrice) || 0,
        costPrice: parseFloat(newProductCostPrice) || 0,
        minStock: parseInt(newProductMinStock) || 0,
        unit: 'unit'
      });
      setSelectedProduct(id.toString());
      setIsProductModalOpen(false);
      setNewProductName('');
      setNewProductCategory('');
      setNewProductPrice('0');
      setNewProductCostPrice('0');
      setNewProductMinStock('0');
    } catch (error) {
      console.error('Error adding product:', error);
    }
  };

  const handleAddToCart = () => {
    if (!selectedProduct || !selectedQuantity) return;
    const pId = parseInt(selectedProduct);
    const qty = parseFloat(selectedQuantity);
    const product = products?.find(p => p.id === pId);
    if (!product) return;

    // Get store-specific price if available
    const storePrice = storePrices?.find(sp => sp.productId === pId && sp.storeId === parseInt(originStoreId));
    const finalPrice = storePrice ? storePrice.price : product.price;

    setCart(prev => {
      const existing = prev.find(item => item.productId === pId);
      if (existing) {
        return prev.map(item => item.productId === pId ? { ...item, quantity: item.quantity + qty } : item);
      }
      return [...prev, { productId: pId, quantity: qty, price: finalPrice, costPrice: product.costPrice || 0 }];
    });
    setSelectedProduct('');
    setSelectedQuantity('1.00');
  };

  const handleRemoveFromCart = (pId: number) => {
    setCart(prev => prev.filter(item => item.productId !== pId));
  };
  
  const handleAddToShrinkageCart = () => {
    if (!selectedShrinkageProduct || !selectedShrinkageQuantity) return;
    const pId = parseInt(selectedShrinkageProduct);
    const qty = parseFloat(selectedShrinkageQuantity);
    const product = products?.find(p => p.id === pId);
    if (!product) return;

    setShrinkageCart(prev => {
      const existing = prev.find(item => item.productId === pId);
      if (existing) {
        return prev.map(item => item.productId === pId ? { ...item, quantity: item.quantity + qty } : item);
      }
      return [...prev, { productId: pId, quantity: qty, price: product.price, costPrice: product.costPrice || 0 }];
    });
    setSelectedShrinkageProduct('');
    setSelectedShrinkageQuantity('1.00');
  };

  const handleRemoveFromShrinkageCart = (pId: number) => {
    setShrinkageCart(prev => prev.filter(item => item.productId !== pId));
  };

  const handleAddCreditClient = () => {
    setCreditClients([...creditClients, { name: '', amount: '0' }]);
  };

  const handleCreditClientChange = (index: number, field: 'name' | 'amount', value: string) => {
    const newClients = [...creditClients];
    newClients[index][field] = value;
    setCreditClients(newClients);
  };

  const handleRemoveCreditClient = (index: number) => {
    setCreditClients(creditClients.filter((_, i) => i !== index));
  };

  const totalCreditAmount = creditClients.reduce((sum, c) => sum + (parseFloat(c.amount) || 0), 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!originStoreId || cart.length === 0) return;
    if (targetType === 'store' && !destStoreId) return;
    if (type === 'consignment' && targetType === 'customer' && !customerName.trim()) return;
    if (targetType === 'store' && originStoreId === destStoreId) {
      setStatusMessage({ type: 'error', text: 'El punto de venta origen y destino no pueden ser el mismo.' });
      setTimeout(() => setStatusMessage(null), 3000);
      return;
    }

    const oId = parseInt(originStoreId);
    const dId = destStoreId ? parseInt(destStoreId) : undefined;

    try {
      await db.transaction('rw', [db.inventory, db.transactions, db.debts, db.expenses, db.products], async () => {
        const transactionItems: { productId: number, quantity: number, price: number, costPrice: number, type?: 'sale' | 'shrinkage' }[] = [];

        // 1. Process Sale Cart (FIFO)
        for (const item of cart) {
          const batches = await db.inventory.where({ storeId: oId, productId: item.productId }).toArray();
          batches.sort((a, b) => (a.dateAdded ? new Date(a.dateAdded).getTime() : 0) - (b.dateAdded ? new Date(b.dateAdded).getTime() : 0));

          const totalAvailable = batches.reduce((sum, b) => sum + b.quantity, 0);
          if (totalAvailable < item.quantity) {
            throw new Error(`Inventario insuficiente para: ${products?.find(p => p.id === item.productId)?.name}`);
          }

          let remaining = item.quantity;
          for (const batch of batches) {
            if (remaining <= 0) break;
            const deduct = Math.min(batch.quantity, remaining);
            if (deduct > 0) {
              if (batch.quantity === deduct) await db.inventory.delete(batch.id!);
              else await db.inventory.update(batch.id!, { quantity: batch.quantity - deduct });

              if (targetType === 'store' && dId) {
                const destBatches = await db.inventory.where({ storeId: dId, productId: item.productId }).toArray();
                const destBatch = destBatches.find(b => b.costPrice === item.price);
                if (destBatch) await db.inventory.update(destBatch.id!, { quantity: destBatch.quantity + deduct });
                else await db.inventory.add({ storeId: dId, productId: item.productId, quantity: deduct, costPrice: item.price, dateAdded: new Date().toISOString() });
              }

              transactionItems.push({
                productId: item.productId,
                quantity: deduct,
                price: item.price,
                costPrice: batch.costPrice || products?.find(p => p.id === item.productId)?.costPrice || 0,
                type: 'sale'
              });
              remaining -= deduct;
            }
          }
        }

        // 2. Process Shrinkage Cart (FIFO)
        let calculatedShrinkageValue = 0;
        for (const item of shrinkageCart) {
          const batches = await db.inventory.where({ storeId: oId, productId: item.productId }).toArray();
          batches.sort((a, b) => (a.dateAdded ? new Date(a.dateAdded).getTime() : 0) - (b.dateAdded ? new Date(b.dateAdded).getTime() : 0));

          const totalAvailable = batches.reduce((sum, b) => sum + b.quantity, 0);
          if (totalAvailable < item.quantity) {
            throw new Error(`Inventario insuficiente para merma: ${products?.find(p => p.id === item.productId)?.name}`);
          }

          let remaining = item.quantity;
          for (const batch of batches) {
            if (remaining <= 0) break;
            const deduct = Math.min(batch.quantity, remaining);
            if (deduct > 0) {
              if (batch.quantity === deduct) await db.inventory.delete(batch.id!);
              else await db.inventory.update(batch.id!, { quantity: batch.quantity - deduct });

              transactionItems.push({
                productId: item.productId,
                quantity: deduct,
                price: item.price,
                costPrice: batch.costPrice || products?.find(p => p.id === item.productId)?.costPrice || 0,
                type: 'shrinkage'
              });
              calculatedShrinkageValue += ((batch.costPrice || products?.find(p => p.id === item.productId)?.costPrice || 0) * deduct);
              remaining -= deduct;
            }
          }
        }

        // Auto-archive products that reached 0 stock
        const allImpactedIds = Array.from(new Set([...cart.map(i => i.productId), ...shrinkageCart.map(i => i.productId)]));
        for (const pId of allImpactedIds) {
          const totalStockAfter = await db.inventory.where('productId').equals(pId).toArray();
          if (totalStockAfter.reduce((sum, b) => sum + b.quantity, 0) <= 0) {
            await db.products.update(pId, { archived: true });
          }
        }

        // 3. Create transaction
        const totalAmount = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const exp = parseFloat(extraExpense) || 0;
        const inc = parseFloat(extraIncome) || 0;
        const cred = totalCreditAmount;
        const cash = parseFloat(cashAmount) || 0;
        const trans = parseFloat(transferAmount) || 0;
        const shrink = shrinkageCart.length > 0 ? calculatedShrinkageValue : (parseFloat(shrinkage) || 0);

        let shortage = 0, surplus = 0;
        if (type === 'sale') {
          // Merma does not affect expected cash from sales.
          const expectedTotal = totalAmount + inc - exp;
          const collectedTotal = cash + trans + cred;
          const difference = expectedTotal - collectedTotal;
          if (difference > 0) shortage = difference;
          else if (difference < 0) surplus = Math.abs(difference);
        }

        const txId = await db.transactions.add({
          type,
          date: new Date(saleDate).toISOString(),
          fromStoreId: oId,
          toStoreId: targetType === 'store' ? dId : undefined,
          customerName: targetType === 'customer' ? customerName.trim() : undefined,
          totalAmount,
          items: transactionItems,
          cashAmount: cash,
          transferAmount: trans,
          creditAmount: cred,
          extraExpense: exp,
          extraExpenseAccount: exp > 0 ? extraExpenseAccount : undefined,
          extraIncome: inc,
          extraIncomeAccount: inc > 0 ? extraIncomeAccount : undefined,
          shortage,
          surplus,
          shrinkage: shrink
        });

        if (type === 'sale') {
          if (exp > 0) {
            await db.expenses.add({ storeId: oId, date: new Date(saleDate).toISOString(), description: `Gasto extra en venta #${txId}`, amount: exp, type: 'expense', paymentMethod: extraExpenseAccount, transactionId: txId as number });
          }
          if (inc > 0) {
            await db.expenses.add({ storeId: oId, date: new Date(saleDate).toISOString(), description: `Ingreso extra en venta #${txId}`, amount: inc, type: 'income', paymentMethod: extraIncomeAccount, transactionId: txId as number });
          }
          if (surplus > 0) {
            await db.expenses.add({ storeId: oId, date: new Date(saleDate).toISOString(), description: `Sobrante en caja (Venta #${txId})`, amount: surplus, type: 'income', paymentMethod: 'cash', transactionId: txId as number });
          }
          if (shrink > 0) {
            await db.expenses.add({ storeId: oId, date: new Date(saleDate).toISOString(), description: `Merma/Rotura (Costo) en venta #${txId}`, amount: shrink, type: 'expense', transactionId: txId as number });
          }
          if (shortage > 0) {
            await db.debts.add({ creditorStoreId: oId, debtorName: cashierName.trim() || 'Cajero (Faltante)', transactionId: txId as number, amount: shortage, status: 'pending', date: new Date(saleDate).toISOString(), type: 'receivable' });
          }
          for (const client of creditClients) {
            const amt = parseFloat(client.amount) || 0;
            if (amt > 0) {
              await db.debts.add({ creditorStoreId: oId, debtorName: client.name.trim() || 'Cliente', transactionId: txId as number, amount: amt, status: 'pending', date: new Date(saleDate).toISOString(), type: 'receivable' });
            }
          }
        }

        // 4. Create debt if consignment
        if (type === 'consignment') {
          await db.debts.add({
            creditorStoreId: oId,
            debtorStoreId: targetType === 'store' ? dId : undefined,
            debtorName: targetType === 'customer' ? customerName.trim() : undefined,
            transactionId: txId as number,
            amount: totalAmount,
            status: 'pending',
            date: new Date(saleDate).toISOString(),
            type: 'receivable'
          });
        }
      });

      setStatusMessage({ type: 'success', text: 'Operación registrada con éxito' });
      setCart([]);
      setDestStoreId('');
      setCustomerName('');
      setExtraExpense('0');
      setExtraIncome('0');
      setCreditClients([]);
      setCashAmount('0');
      setTransferAmount('0');
      setShrinkage('0');
      setCashierName('');
      localStorage.removeItem('pending_sale');
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (error: any) {
      setStatusMessage({ type: 'error', text: error.message });
      setTimeout(() => setStatusMessage(null), 3000);
    }
  };

  const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const shrinkValue = shrinkageCart.reduce((sum, item) => sum + (item.price * item.quantity), 0) || (parseFloat(shrinkage) || 0);
  // Merma does NOT reduce expected cash.
  const expectedTotal = total + (parseFloat(extraIncome) || 0) - (parseFloat(extraExpense) || 0);
  const collectedTotal = (parseFloat(cashAmount) || 0) + (parseFloat(transferAmount) || 0) + totalCreditAmount;
  const getProductName = (id: number) => products?.find(p => p.id === id)?.name || 'Desconocido';

  const getRemainingStock = (pId: number) => {
    const sId = parseInt(originStoreId);
    if (!sId || !inventory) return 0;
    const stock = inventory
      .filter(i => i.storeId === sId && i.productId === pId)
      .reduce((sum, b) => sum + b.quantity, 0);
    const cartItem = cart.find(item => item.productId === pId);
    const shrinkItem = shrinkageCart.find(item => item.productId === pId);
    return stock - (cartItem?.quantity || 0) - (shrinkItem?.quantity || 0);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="grid grid-cols-1 lg:grid-cols-3 gap-8 relative"
    >
      <AnimatePresence>
        {statusMessage && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={cn(
              "absolute top-0 left-0 right-0 z-50 p-4 rounded-2xl flex items-center gap-3 shadow-xl border backdrop-blur-md",
              statusMessage.type === 'success' ? 'bg-emerald-50/90 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800' : 'bg-rose-50/90 dark:bg-rose-900/40 text-rose-800 dark:text-rose-200 border-rose-200 dark:border-rose-800'
            )}
          >
            {statusMessage.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
            <p className="text-sm font-bold">{statusMessage.text}</p>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="lg:col-span-2 space-y-8">
        {!isGuest ? (
          <div className="card p-8">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-10 h-10 rounded-xl bg-slate-900 dark:bg-slate-100 flex items-center justify-center text-white dark:text-slate-900">
                <ShoppingBag className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">Nueva Operación</h3>
                <p className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Registro de ventas y consignaciones</p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-3">
                  <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.1em] ml-1">Tipo de Operación</label>
                  <div className="segmented-control">
                    <button
                      type="button"
                      onClick={() => setType('sale')}
                      className={cn(
                        "segmented-item",
                        type === 'sale' ? "segmented-item-active" : "segmented-item-inactive"
                      )}
                    >
                      Venta Directa
                    </button>
                    <button
                      type="button"
                      onClick={() => setType('consignment')}
                      className={cn(
                        "segmented-item",
                        type === 'consignment' ? "segmented-item-active" : "segmented-item-inactive"
                      )}
                    >
                      Consignación
                    </button>
                  </div>
                </div>
                <div className="space-y-3">
                  <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.1em] ml-1">Punto de Venta Origen</label>
                  <div className="relative">
                    <Store className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
                    <select
                      required
                      value={originStoreId}
                      onChange={(e) => setOriginStoreId(e.target.value)}
                      disabled={!!activeStoreId}
                      className="input-field pl-11 disabled:bg-slate-50 dark:disabled:bg-slate-900 disabled:cursor-not-allowed"
                    >
                      <option value="">Seleccionar...</option>
                      {stores?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="space-y-3">
                  <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.1em] ml-1">Destino de la Operación</label>
                  <div className="segmented-control">
                    <button
                      type="button"
                      onClick={() => setTargetType('customer')}
                      className={cn(
                        "segmented-item",
                        targetType === 'customer' ? "segmented-item-active" : "segmented-item-inactive"
                      )}
                    >
                      Cliente Externo
                    </button>
                    <button
                      type="button"
                      onClick={() => setTargetType('store')}
                      className={cn(
                        "segmented-item",
                        targetType === 'store' ? "segmented-item-active" : "segmented-item-inactive"
                      )}
                    >
                      Otro Punto
                    </button>
                  </div>
                </div>
                {targetType === 'store' && (
                  <div className="space-y-3">
                    <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.1em] ml-1">Punto de Venta Destino</label>
                    <div className="relative">
                      <ArrowRight className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
                      <select
                        required
                        value={destStoreId}
                        onChange={(e) => setDestStoreId(e.target.value)}
                        className="input-field pl-11"
                      >
                        <option value="">Seleccionar...</option>
                        {stores?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                  </div>
                )}
                {targetType === 'customer' && (
                  <div className="space-y-3">
                    <div className="flex justify-between items-center ml-1">
                      <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.1em]">Cliente {type === 'sale' ? '(Opcional)' : ''}</label>
                      <button
                        type="button"
                        onClick={() => setIsCustomerModalOpen(true)}
                        className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 uppercase tracking-wider flex items-center gap-1.5"
                      >
                        <UserPlus className="w-3.5 h-3.5" /> Nuevo
                      </button>
                    </div>
                    <div className="relative">
                      <UserPlus className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
                      <select
                        required={type === 'consignment'}
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        className="input-field pl-11"
                      >
                        <option value="">Seleccionar...</option>
                        {customers?.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                        {customerName && !customers?.find(c => c.name === customerName) && (
                          <option value={customerName}>{customerName}</option>
                        )}
                      </select>
                    </div>
                  </div>
                )}
                <div className="space-y-3">
                  <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.1em] ml-1">Fecha de Operación</label>
                  <div className="relative">
                    <History className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
                    <input
                      type="datetime-local"
                      required
                      value={toLocalISO(saleDate)}
                      onChange={(e) => setSaleDate(fromLocalISO(e.target.value))}
                      className="input-field pl-11"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-8 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                    <PackagePlus className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                  </div>
                  <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 uppercase tracking-[0.15em]">Agregar Productos</h4>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                  <div className="md:col-span-8 space-y-3">
                    <div className="flex justify-between items-center ml-1">
                      <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.1em]">Producto</label>
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 dark:text-slate-500" />
                          <input
                            type="text"
                            placeholder="Filtrar..."
                            value={productSearch}
                            onChange={(e) => setProductSearch(e.target.value)}
                            className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg pl-7 pr-2 py-1 text-[10px] focus:outline-none focus:ring-1 focus:ring-indigo-500 w-32 text-slate-700 dark:text-slate-300"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsProductModalOpen(true)}
                          className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 uppercase tracking-wider flex items-center gap-1.5"
                        >
                          <Plus className="w-3.5 h-3.5" /> Nuevo
                        </button>
                      </div>
                    </div>
                    <div className="relative">
                      <ShoppingCart className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
                      <select
                        value={selectedProduct}
                        onChange={(e) => setSelectedProduct(e.target.value)}
                        className="input-field pl-11"
                      >
                        <option value="">Seleccionar producto...</option>
                        {products?.filter(p => !p.archived).filter(p => {
                          const matchesSearch = p.name.toLowerCase().includes(productSearch.toLowerCase());
                          if (!matchesSearch) return false;
                          
                          const sId = parseInt(originStoreId);
                          if (!sId) return false;

                          const invBatches = inventory?.filter(i => i.storeId === sId && i.productId === p.id) || [];
                          const stock = invBatches.reduce((sum, b) => sum + b.quantity, 0);
                          return stock > 0;
                        }).map(p => {
                          const sId = parseInt(originStoreId);
                          const invBatches = inventory?.filter(i => i.storeId === sId && i.productId === p.id) || [];
                          const stock = invBatches.reduce((sum, b) => sum + b.quantity, 0);
                          const storePrice = storePrices?.find(sp => sp.productId === p.id && sp.storeId === sId);
                          const displayPrice = storePrice ? storePrice.price : p.price;
                          return <option key={p.id} value={p.id}>{p.name} (Stock: {stock}) - {formatCurrency(displayPrice)}</option>;
                        })}
                      </select>
                    </div>
                  </div>
                  <div className="md:col-span-2 space-y-3">
                    <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.1em] ml-1">Cantidad</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={selectedQuantity}
                      onChange={(e) => setSelectedQuantity(e.target.value)}
                      className="input-field"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <button
                      type="button"
                      onClick={handleAddToCart}
                      className="btn-secondary w-full py-3 flex items-center justify-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Añadir</span>
                    </button>
                  </div>
                </div>
              </div>

              {type === 'sale' && (
                <div className="pt-8 border-t border-slate-100 dark:border-slate-800 space-y-8">
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                    <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 uppercase tracking-widest">Detalles de Pago y Ajustes</h4>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 ml-1">Efectivo Recibido</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 font-bold text-sm">$</span>
                        <input type="number" min="0" step="0.01" value={cashAmount} onChange={(e) => setCashAmount(e.target.value)} className="input-field pl-8" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 ml-1">Transferencia</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 font-bold text-sm">$</span>
                        <input type="number" min="0" step="0.01" value={transferAmount} onChange={(e) => setTransferAmount(e.target.value)} className="input-field pl-8" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 ml-1">Gasto Extra</label>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 font-bold text-sm">$</span>
                          <input type="number" min="0" step="0.01" value={extraExpense} onChange={(e) => setExtraExpense(e.target.value)} className="input-field pl-8" />
                        </div>
                        <select value={extraExpenseAccount} onChange={(e) => setExtraExpenseAccount(e.target.value as any)} className="w-28 input-field text-[10px] font-bold uppercase">
                          <option value="cash">Efectivo</option>
                          <option value="transfer">Transf.</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 ml-1">Ingreso Extra</label>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 font-bold text-sm">$</span>
                          <input type="number" min="0" step="0.01" value={extraIncome} onChange={(e) => setExtraIncome(e.target.value)} className="input-field pl-8" />
                        </div>
                        <select value={extraIncomeAccount} onChange={(e) => setExtraIncomeAccount(e.target.value as any)} className="w-28 input-field text-[10px] font-bold uppercase">
                          <option value="cash">Efectivo</option>
                          <option value="transfer">Transf.</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between items-center mb-2 ml-1">
                        <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Merma / Rotura (Itemizado)</label>
                      </div>
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end bg-slate-50/50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                          <div className="md:col-span-5 space-y-1.5">
                            <div className="relative">
                              <input
                                type="text"
                                placeholder="Filtrar producto..."
                                value={shrinkageProductSearch}
                                onChange={(e) => setShrinkageProductSearch(e.target.value)}
                                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg pl-3 pr-2 py-1 text-[10px] focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-700 dark:text-slate-300 mb-1"
                              />
                              <select
                                value={selectedShrinkageProduct}
                                onChange={(e) => setSelectedShrinkageProduct(e.target.value)}
                                className="input-field py-2 text-sm"
                              >
                                <option value="">Seleccionar...</option>
                                {products?.filter(p => !p.archived).filter(p => p.name.toLowerCase().includes(shrinkageProductSearch.toLowerCase())).map(p => (
                                  <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                          <div className="md:col-span-4 space-y-1.5">
                            <input
                              type="number"
                              step="0.01"
                              min="0.01"
                              value={selectedShrinkageQuantity}
                              onChange={(e) => setSelectedShrinkageQuantity(e.target.value)}
                              className="input-field py-2 text-sm font-bold"
                              placeholder="Cantidad"
                            />
                          </div>
                          <div className="md:col-span-3">
                            <button
                              type="button"
                              onClick={handleAddToShrinkageCart}
                              className="btn-secondary w-full py-2.5 text-[10px] font-bold uppercase tracking-wider"
                            >
                              Agregar
                            </button>
                          </div>
                        </div>

                        {shrinkageCart.length > 0 && (
                          <div className="space-y-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                            {shrinkageCart.map((item, idx) => (
                              <div key={idx} className="flex items-center justify-between bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-100 dark:border-slate-800 text-[11px] font-medium">
                                <span className="text-slate-700 dark:text-slate-300 truncate flex-1">{getProductName(item.productId)}</span>
                                <span className="text-slate-500 dark:text-slate-500 mx-2">{formatNumber(item.quantity)} u</span>
                                <button type="button" onClick={() => handleRemoveFromShrinkageCart(item.productId)} className="p-1 text-slate-300 hover:text-rose-500">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        {shrinkageCart.length === 0 && (
                          <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 font-bold text-sm">$</span>
                            <input type="number" min="0" step="0.01" value={shrinkage} onChange={(e) => setShrinkage(e.target.value)} className="input-field pl-10 py-2.5 text-sm font-bold" placeholder="Valor de ajuste manual" />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-slate-50/50 dark:bg-slate-800/50 p-6 rounded-2xl border border-slate-100 dark:border-slate-800">
                    <div className="flex justify-between items-center mb-4">
                      <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider ml-1">Ventas a Crédito (Fraccionar)</label>
                      <button type="button" onClick={handleAddCreditClient} className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 uppercase tracking-wider flex items-center gap-1">
                        <Plus className="w-3 h-3" /> Añadir Cliente
                      </button>
                    </div>
                    <div className="space-y-3">
                      {creditClients.map((client, idx) => (
                        <div key={idx} className="flex gap-3 items-center">
                          <input type="text" placeholder="Nombre del cliente" value={client.name} onChange={(e) => handleCreditClientChange(idx, 'name', e.target.value)} className="flex-1 input-field py-2 text-sm" />
                          <div className="relative w-32">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 font-bold text-xs">$</span>
                            <input type="number" min="0" step="0.01" placeholder="Monto" value={client.amount} onChange={(e) => handleCreditClientChange(idx, 'amount', e.target.value)} className="w-full input-field py-2 pl-6 text-sm" />
                          </div>
                          <button type="button" onClick={() => handleRemoveCreditClient(idx)} className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-xl transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                    {creditClients.length > 0 && (
                      <div className="text-right text-xs font-bold text-slate-500 dark:text-slate-400 mt-4 uppercase tracking-wider">
                        Total a crédito: <span className="text-slate-900 dark:text-slate-100 ml-1">{formatCurrency(totalCreditAmount)}</span>
                      </div>
                    )}
                  </div>

                  {((parseFloat(cashAmount) || 0) + (parseFloat(transferAmount) || 0) + totalCreditAmount) - (total - (parseFloat(shrinkage) || 0) + (parseFloat(extraIncome) || 0) - (parseFloat(extraExpense) || 0)) < 0 && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="p-6 bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-900/30 rounded-2xl"
                    >
                      <label className="block text-[10px] font-bold text-rose-800 dark:text-rose-400 uppercase tracking-wider mb-3 ml-1">Faltante detectado. Nombre del Cajero:</label>
                      <input type="text" value={cashierName} onChange={(e) => setCashierName(e.target.value)} placeholder="Nombre del cajero responsable" className="w-full bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-800 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-rose-500/20 text-sm font-bold text-slate-900 dark:text-slate-100" />
                    </motion.div>
                  )}
                </div>
              )}

              <div className="pt-8 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                <button
                  type="submit"
                  disabled={cart.length === 0 || !originStoreId || (targetType === 'store' && !destStoreId) || (type === 'consignment' && targetType === 'customer' && !customerName.trim())}
                  className="btn-primary px-10 py-4 flex items-center gap-3 shadow-xl shadow-slate-900/10 dark:shadow-none"
                >
                  <CheckCircle className="w-5 h-5" />
                  <span>Confirmar Operación</span>
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/30 rounded-2xl p-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-amber-600 dark:text-amber-400">
              <Lock className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-base font-bold text-amber-900 dark:text-amber-100">Modo Lectura Activo</h4>
              <p className="text-sm text-amber-700 dark:text-amber-400 font-medium">Como Invitado, puedes visualizar todas las operaciones pero no tienes permisos para registrar nuevas ventas o consignaciones.</p>
            </div>
          </div>
        )}
      </div>

      <div className="card p-8 flex flex-col h-fit sticky top-8">
        <div className="flex items-center gap-2 mb-6">
          <ShoppingBag className="w-5 h-5 text-slate-400 dark:text-slate-500" />
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">Resumen de Venta</h3>
        </div>
        <div className="flex-1 space-y-4 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar mb-8">
          {cart.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                <ShoppingBag className="w-8 h-8 text-slate-200 dark:text-slate-600" />
              </div>
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">Carrito vacío</p>
            </div>
          ) : (
            <div className="space-y-3">
              {cart.map((item, idx) => (
                <motion.div 
                  layout
                  key={idx} 
                  className="group bg-slate-50/50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-white dark:hover:bg-slate-800 hover:shadow-sm transition-all"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate leading-tight">{getProductName(item.productId)}</p>
                      <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mt-1">{formatNumber(item.quantity)} unidades × {formatCurrency(item.price)}</p>
                      <p className={cn(
                        "text-[10px] font-bold uppercase tracking-wider mt-1.5 flex items-center gap-1",
                        getRemainingStock(item.productId) < 0 ? "text-rose-500 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"
                      )}>
                        <span className="opacity-60">Quedarán:</span>
                        <span>{formatNumber(getRemainingStock(item.productId))} en stock</span>
                      </p>
                    </div>
                    <button type="button" onClick={() => handleRemoveFromCart(item.productId)} className={cn("p-2 text-slate-300 dark:text-slate-600 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-xl transition-all", !isGuest && "opacity-0 group-hover:opacity-100", isGuest && "hidden")}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex justify-between items-center pt-3 border-t border-slate-200/60 dark:border-slate-700/60">
                    <div className="relative w-28">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 font-bold text-[10px]">$</span>
                      <input
                        type="number"
                        step="0.01"
                        value={item.price}
                        disabled={isGuest}
                        onChange={(e) => {
                          const newPrice = parseFloat(e.target.value) || 0;
                          setCart(prev => prev.map((cartItem, i) => i === idx ? { ...cartItem, price: newPrice } : cartItem));
                        }}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl pl-6 pr-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-4 focus:ring-slate-900/5 focus:border-slate-900 dark:focus:border-slate-600 disabled:bg-slate-50 dark:disabled:bg-slate-950 disabled:cursor-not-allowed"
                      />
                    </div>
                    <p className="text-sm font-bold text-slate-900 dark:text-slate-100 tabular-nums">{formatCurrency(item.price * item.quantity)}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
        <div className="space-y-3 pt-6 border-t border-slate-100 dark:border-slate-800">
          <div className="flex justify-between items-center text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            <span>Subtotal:</span>
            <span className="text-slate-600 dark:text-slate-300">{formatCurrency(total)}</span>
          </div>
          {type === 'sale' && (
            <div className="space-y-2">
              <div className="flex justify-between items-center text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                <span>Merma:</span>
                <span className="text-rose-500 dark:text-rose-400">-{formatCurrency(shrinkValue)}</span>
              </div>
              <div className="flex justify-between items-center text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                <span>Ingreso Extra:</span>
                <span className="text-emerald-500 dark:text-emerald-400">+{formatCurrency(parseFloat(extraIncome) || 0)}</span>
              </div>
              <div className="flex justify-between items-center text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                <span>Gasto Extra:</span>
                <span className="text-rose-500 dark:text-rose-400">-{formatCurrency(parseFloat(extraExpense) || 0)}</span>
              </div>
              <div className="flex justify-between items-center pt-4 border-t border-slate-100 dark:border-slate-800">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-100 uppercase tracking-widest">Total Esperado:</span>
                <span className="text-xl font-black text-slate-900 dark:text-slate-100 tabular-nums">{formatCurrency(expectedTotal)}</span>
              </div>
              <div className="pt-4 space-y-2">
                <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  <span>Recaudado:</span>
                  <span className="text-slate-900 dark:text-slate-100 tabular-nums">{formatCurrency(collectedTotal)}</span>
                </div>
                {expectedTotal - collectedTotal > 0 ? (
                  <div className="flex justify-between items-center p-2 rounded-lg bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-400 text-[10px] font-bold uppercase tracking-wider">
                    <span>Faltante:</span>
                    <span className="tabular-nums">{formatCurrency(expectedTotal - collectedTotal)}</span>
                  </div>
                ) : expectedTotal - collectedTotal < 0 ? (
                  <div className="flex justify-between items-center p-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold uppercase tracking-wider">
                    <span>Sobrante:</span>
                    <span className="tabular-nums">{formatCurrency(Math.abs(expectedTotal - collectedTotal))}</span>
                  </div>
                ) : null}
              </div>
            </div>
          )}
          {!(type === 'sale') && (
            <div className="flex justify-between items-center pt-4 border-t border-slate-100 dark:border-slate-800">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-100 uppercase tracking-widest">Total:</span>
              <span className="text-xl font-black text-slate-900 dark:text-slate-100 tabular-nums">{formatCurrency(total)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {isCustomerModalOpen && (
          <div className="fixed inset-0 bg-slate-900/40 dark:bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-md w-full p-8 border border-slate-200 dark:border-slate-800"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Nuevo Cliente</h3>
                <button onClick={() => setIsCustomerModalOpen(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
                  <XCircle className="w-5 h-5 text-slate-400 dark:text-slate-500" />
                </button>
              </div>
              <form onSubmit={handleAddCustomer} className="space-y-6">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 ml-1">Nombre Completo</label>
                  <input
                    type="text"
                    required
                    value={newCustomerName}
                    onChange={(e) => setNewCustomerName(e.target.value)}
                    className="input-field"
                    placeholder="Ej. Juan Pérez"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 ml-1">Teléfono (Opcional)</label>
                  <input
                    type="text"
                    value={newCustomerPhone}
                    onChange={(e) => setNewCustomerPhone(e.target.value)}
                    className="input-field"
                    placeholder="Ej: +53 55555555"
                  />
                </div>
                <div className="flex gap-4 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsCustomerModalOpen(false)}
                    className="btn-secondary flex-1 py-3"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="btn-primary flex-1 py-3"
                  >
                    Guardar
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {isProductModalOpen && (
          <div className="fixed inset-0 bg-slate-900/40 dark:bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-md w-full p-8 border border-slate-200 dark:border-slate-800"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Nuevo Producto</h3>
                <button onClick={() => setIsProductModalOpen(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
                  <XCircle className="w-5 h-5 text-slate-400 dark:text-slate-500" />
                </button>
              </div>
              <form onSubmit={handleAddProduct} className="space-y-6">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 ml-1">Nombre</label>
                  <input
                    type="text"
                    required
                    value={newProductName}
                    onChange={(e) => setNewProductName(e.target.value)}
                    className="input-field"
                    placeholder="Nombre del producto"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 ml-1">Categoría</label>
                    <input
                      type="text"
                      value={newProductCategory}
                      onChange={(e) => setNewProductCategory(e.target.value)}
                      className="input-field"
                      placeholder="General"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 ml-1">Stock Mínimo</label>
                    <input
                      type="number"
                      value={newProductMinStock}
                      onChange={(e) => setNewProductMinStock(e.target.value)}
                      className="input-field"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 ml-1">Precio Venta</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={newProductPrice}
                      onChange={(e) => setNewProductPrice(e.target.value)}
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 ml-1">Precio Costo</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={newProductCostPrice}
                      onChange={(e) => setNewProductCostPrice(e.target.value)}
                      className="input-field"
                    />
                  </div>
                </div>
                <div className="flex gap-4 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsProductModalOpen(false)}
                    className="btn-secondary flex-1 py-3"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="btn-primary flex-1 py-3"
                  >
                    Guardar
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
