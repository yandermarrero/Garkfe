import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { formatCurrency, formatNumber, toLocalISO, fromLocalISO, cn } from '../lib/utils';
import { Trash2, AlertTriangle, CheckCircle, XCircle, Filter, Edit, Lock, Search } from 'lucide-react';
import { useStoreContext } from '../lib/StoreContext';
import { useAuth } from '../lib/AuthContext';

export default function Transactions() {
  const { user } = useAuth();
  const isGuest = user?.role === 'guest';
  const { activeStoreId } = useStoreContext();
  const allTransactions = useLiveQuery(() => db.transactions.toArray());
  const allPurchases = useLiveQuery(() => db.purchases.toArray());
  const stores = useLiveQuery(() => db.stores.toArray());
  const products = useLiveQuery(() => db.products.toArray());
  const suppliers = useLiveQuery(() => db.suppliers.toArray());

  const transactions = activeStoreId 
    ? allTransactions?.filter(tx => tx.fromStoreId === activeStoreId || tx.toStoreId === activeStoreId)
    : allTransactions;

  const purchases = activeStoreId
    ? allPurchases?.filter(p => p.storeId === activeStoreId)
    : allPurchases;

  const [filterType, setFilterType] = useState<'all' | 'sale' | 'consignment' | 'purchase'>('all');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean, type: 'single' | 'all', id?: number, opType?: 'transaction' | 'purchase' }>({ isOpen: false, type: 'single' });
  const [editModal, setEditModal] = useState<{ isOpen: boolean, opType?: 'transaction' | 'purchase', data?: any }>({ isOpen: false });
  const [adjustModal, setAdjustModal] = useState<{ isOpen: boolean, purchaseId?: number, items?: any[] }>({ isOpen: false });
  const [adjustingItemIndex, setAdjustingItemIndex] = useState<number | null>(null);
  const [newCostPrice, setNewCostPrice] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const getStoreName = (id?: number) => stores?.find(s => s.id === id)?.name || 'N/A';
  const getProductName = (id: number) => products?.find(p => p.id === id)?.name || 'Desconocido';
  const getSupplierName = (id?: number) => suppliers?.find(s => s.id === id)?.name || 'N/A';

  const operations = useMemo(() => {
    let ops: any[] = [];
    
    if (transactions) {
      ops = [...ops, ...transactions.map(tx => ({
        id: `tx-${tx.id}`,
        originalId: tx.id,
        opType: 'transaction',
        date: tx.date,
        type: tx.type,
        origin: getStoreName(tx.fromStoreId),
        destination: tx.toStoreId ? getStoreName(tx.toStoreId) : (tx.customerName || '-'),
        items: tx.items,
        totalAmount: tx.totalAmount,
        extraExpense: tx.extraExpense,
        extraExpenseAccount: tx.extraExpenseAccount,
        extraIncome: tx.extraIncome,
        extraIncomeAccount: tx.extraIncomeAccount
      }))];
    }

    if (purchases) {
      ops = [...ops, ...purchases.map(p => ({
        id: `pur-${p.id}`,
        originalId: p.id,
        opType: 'purchase',
        date: p.date,
        type: 'purchase',
        origin: getSupplierName(p.supplierId),
        destination: getStoreName(p.storeId),
        items: p.items,
        totalAmount: p.totalAmount,
        paymentStatus: p.paymentStatus,
        paymentMethod: p.paymentMethod,
        extraExpense: p.extraExpense,
        extraExpenseAccount: p.extraExpenseAccount,
        extraIncome: p.extraIncome,
        extraIncomeAccount: p.extraIncomeAccount
      }))];
    }

    if (filterType !== 'all') {
      ops = ops.filter(op => op.type === filterType);
    }

    if (startDate) {
      const start = new Date(startDate + 'T00:00:00');
      ops = ops.filter(op => new Date(op.date) >= start);
    }
    if (endDate) {
      const end = new Date(endDate + 'T23:59:59.999');
      ops = ops.filter(op => new Date(op.date) <= end);
    }

    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      ops = ops.filter(op => 
        op.items.some((item: any) => getProductName(item.productId).toLowerCase().includes(search))
      );
    }

    return ops.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, purchases, filterType, startDate, endDate, stores, suppliers, searchTerm, products]);

  const totalFilteredAmount = operations.reduce((sum, op) => sum + op.totalAmount, 0);

  const handleAdjustCost = async (purchaseId: number, itemIndex: number, oldCostPrice: number, quantity: number, productId: number) => {
    const newCost = parseFloat(newCostPrice);
    if (isNaN(newCost) || newCost < 0) return;

    try {
      await db.transaction('rw', [db.inventory, db.purchases, db.debts, db.products], async () => {
        const purchase = await db.purchases.get(purchaseId);
        if (!purchase) throw new Error('Compra no encontrada');

        // Find inventory batch
        const batches = await db.inventory.where({ storeId: purchase.storeId, productId }).toArray();
        const batch = batches.find(b => b.costPrice === oldCostPrice);
        
        const qtyToAdjust = Math.min(quantity, batch ? batch.quantity : 0);
        
        if (qtyToAdjust === 0) {
          throw new Error('No hay stock restante de este producto con el precio de costo original.');
        }

        const qtySold = quantity - qtyToAdjust;

        // 1. Update inventory
        if (batch) {
          if (batch.quantity === qtyToAdjust) {
            await db.inventory.delete(batch.id!);
          } else {
            await db.inventory.update(batch.id!, { quantity: batch.quantity - qtyToAdjust });
          }
          
          // Add new batch or update existing with new cost
          const existingNewBatch = batches.find(b => b.costPrice === newCost);
          if (existingNewBatch) {
            await db.inventory.update(existingNewBatch.id!, { quantity: existingNewBatch.quantity + qtyToAdjust });
          } else {
            await db.inventory.add({
              storeId: purchase.storeId,
              productId,
              quantity: qtyToAdjust,
              costPrice: newCost,
              dateAdded: new Date().toISOString()
            });
          }
        }

        // 2. Update purchase items
        const newItems = [...purchase.items];
        if (qtySold > 0) {
          newItems[itemIndex] = { ...newItems[itemIndex], quantity: qtySold };
          newItems.push({ ...newItems[itemIndex], quantity: qtyToAdjust, costPrice: newCost });
        } else {
          newItems[itemIndex] = { ...newItems[itemIndex], costPrice: newCost };
        }
        
        const newTotalAmount = newItems.reduce((sum, item) => sum + (item.costPrice * item.quantity), 0);
        await db.purchases.update(purchaseId, { items: newItems, totalAmount: newTotalAmount });

        // 3. Update debt if it exists
        const debts = await db.debts.where('purchaseId').equals(purchaseId).toArray();
        if (debts.length > 0) {
          const debt = debts[0];
          const difference = qtyToAdjust * (newCost - oldCostPrice);
          const newAmount = debt.amount + difference;
          const newStatus = (debt.paidAmount || 0) >= newAmount ? 'paid' : 'pending';
          await db.debts.update(debt.id!, { amount: newAmount, status: newStatus });
        }

        // 4. Update product costPrice (latest)
        await db.products.update(productId, { costPrice: newCost });
      });

      setStatusMessage({ type: 'success', text: 'Costo ajustado correctamente. El inventario y la deuda han sido actualizados.' });
      setAdjustingItemIndex(null);
      setNewCostPrice('');
      setAdjustModal({ isOpen: false });
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (error: any) {
      setStatusMessage({ type: 'error', text: error.message || 'Error al ajustar costo.' });
      setTimeout(() => setStatusMessage(null), 3000);
    }
  };

  const handleUpdateOperation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editModal.data || !editModal.opType) return;

    const { opType, data } = editModal;
    const originalId = data.originalId;

    try {
      await db.transaction('rw', [db.inventory, db.transactions, db.purchases, db.debts, db.expenses], async () => {
        if (opType === 'transaction') {
          const oldTx = await db.transactions.get(originalId);
          if (!oldTx) throw new Error('Operación no encontrada');

          // 1. Revert old inventory
          for (const item of oldTx.items || []) {
            const originBatches = await db.inventory.where({ storeId: oldTx.fromStoreId, productId: item.productId }).toArray();
            const originBatch = originBatches.find(b => b.costPrice === item.costPrice);
            if (originBatch) {
              await db.inventory.update(originBatch.id!, { quantity: originBatch.quantity + item.quantity });
            } else {
              await db.inventory.add({ storeId: oldTx.fromStoreId, productId: item.productId, quantity: item.quantity, costPrice: item.costPrice, dateAdded: new Date().toISOString() });
            }
            if (oldTx.toStoreId) {
              const destBatches = await db.inventory.where({ storeId: oldTx.toStoreId, productId: item.productId }).toArray();
              const destCostPrice = item.price;
              destBatches.sort((a, b) => (a.costPrice === destCostPrice ? -1 : 1));
              let toDeduct = item.quantity;
              for (const b of destBatches) {
                if (toDeduct <= 0) break;
                const amt = Math.min(b.quantity, toDeduct);
                if (b.quantity === amt) await db.inventory.delete(b.id!);
                else await db.inventory.update(b.id!, { quantity: b.quantity - amt });
                toDeduct -= amt;
              }
            }
          }

          // 2. Update transaction
          const updatedTx = {
            ...oldTx,
            date: data.date,
            customerName: data.customerName,
            totalAmount: parseFloat(data.totalAmount),
            extraExpense: parseFloat(data.extraExpense) || 0,
            extraExpenseAccount: data.extraExpenseAccount,
            extraIncome: parseFloat(data.extraIncome) || 0,
            extraIncomeAccount: data.extraIncomeAccount,
            items: data.items.map((item: any) => ({
              ...item,
              quantity: parseFloat(item.quantity),
              price: parseFloat(item.price)
            }))
          };
          await db.transactions.update(originalId, updatedTx);

          // 3. Apply new inventory
          for (const item of updatedTx.items) {
            const originBatches = await db.inventory.where({ storeId: updatedTx.fromStoreId, productId: item.productId }).toArray();
            const originBatch = originBatches.find(b => b.costPrice === item.costPrice);
            if (!originBatch || originBatch.quantity < item.quantity) throw new Error(`Stock insuficiente para ${getProductName(item.productId)}`);
            await db.inventory.update(originBatch.id!, { quantity: originBatch.quantity - item.quantity });

            if (updatedTx.toStoreId) {
              const destBatches = await db.inventory.where({ storeId: updatedTx.toStoreId, productId: item.productId }).toArray();
              const destBatch = destBatches.find(b => b.costPrice === item.price);
              if (destBatch) await db.inventory.update(destBatch.id!, { quantity: destBatch.quantity + item.quantity });
              else await db.inventory.add({ storeId: updatedTx.toStoreId, productId: item.productId, quantity: item.quantity, costPrice: item.price, dateAdded: new Date().toISOString() });
            }
          }

          // 4. Update associated debts and expenses
          const debts = await db.debts.where('transactionId').equals(originalId).toArray();
          for (const d of debts) {
            if (updatedTx.type === 'consignment') {
              // For consignments, the debt IS the total amount
              await db.debts.update(d.id!, { amount: updatedTx.totalAmount, date: updatedTx.date });
            } else {
              // For sales, we only update the date. 
              // We DON'T update the amount because it could be a shortage or a specific credit client amount
              // which are not currently editable in the modal and would be overwritten incorrectly.
              await db.debts.update(d.id!, { date: updatedTx.date });
            }
          }
          
          // Update associated expenses/incomes correctly
          const associatedExps = await db.expenses.where('transactionId').equals(originalId).toArray();
          for (const e of associatedExps) {
            const updates: any = { date: updatedTx.date };
            
            // Only update amounts if they are the specific extra expense/income records
            if (e.description.includes('Gasto extra')) {
              updates.amount = updatedTx.extraExpense;
              updates.paymentMethod = updatedTx.extraExpenseAccount;
            } else if (e.description.includes('Ingreso extra')) {
              updates.amount = updatedTx.extraIncome;
              updates.paymentMethod = updatedTx.extraIncomeAccount;
            }
            // For other expenses like 'Merma' or 'Sobrante', we only update the date
            
            await db.expenses.update(e.id!, updates);
          }
        } else if (opType === 'purchase') {
          const oldP = await db.purchases.get(originalId);
          if (!oldP) throw new Error('Compra no encontrada');

          // 1. Revert old inventory
          for (const item of oldP.items || []) {
            const batches = await db.inventory.where({ storeId: oldP.storeId, productId: item.productId }).toArray();
            const batch = batches.find(b => b.costPrice === item.costPrice);
            if (batch) {
              if (batch.quantity <= item.quantity) await db.inventory.delete(batch.id!);
              else await db.inventory.update(batch.id!, { quantity: batch.quantity - item.quantity });
            }
          }

          // 2. Update purchase
          const updatedP = {
            ...oldP,
            date: data.date,
            totalAmount: parseFloat(data.totalAmount),
            paymentStatus: data.paymentStatus,
            paymentMethod: data.paymentStatus === 'paid' ? (data.paymentMethod || 'cash') : undefined,
            supplierId: data.supplierId,
            extraExpense: parseFloat(data.extraExpense) || 0,
            extraExpenseAccount: data.extraExpenseAccount,
            extraIncome: parseFloat(data.extraIncome) || 0,
            extraIncomeAccount: data.extraIncomeAccount,
            items: data.items.map((item: any) => ({
              ...item,
              quantity: parseFloat(item.quantity),
              costPrice: parseFloat(item.costPrice)
            }))
          };
          await db.purchases.update(originalId, updatedP);

          // 3. Apply new inventory
          for (const item of updatedP.items) {
            const batches = await db.inventory.where({ storeId: updatedP.storeId, productId: item.productId }).toArray();
            const batch = batches.find(b => b.costPrice === item.costPrice);
            if (batch) await db.inventory.update(batch.id!, { quantity: batch.quantity + item.quantity });
            else await db.inventory.add({ storeId: updatedP.storeId, productId: item.productId, quantity: item.quantity, costPrice: item.costPrice, dateAdded: updatedP.date });
          }

          // 4. Update associated debts and expenses
          const debts = await db.debts.where('purchaseId').equals(originalId).toArray();
          
          if (updatedP.paymentStatus === 'credit') {
            if (debts.length > 0) {
              // Update existing debt
              for (const d of debts) {
                await db.debts.update(d.id!, { 
                  amount: updatedP.totalAmount, 
                  date: updatedP.date,
                  supplierId: updatedP.supplierId
                });
              }
            } else {
              // Create new debt
              await db.debts.add({
                debtorStoreId: updatedP.storeId,
                supplierId: updatedP.supplierId,
                purchaseId: originalId,
                amount: updatedP.totalAmount,
                status: 'pending',
                date: updatedP.date,
                type: 'payable'
              });
            }
          } else {
            // It's now 'paid', delete any associated debts
            for (const d of debts) {
              await db.debts.delete(d.id!);
              // Also find and delete payments for this debt
              const debtPayments = await db.expenses.where('debtId').equals(d.id!).toArray();
              for (const dp of debtPayments) {
                await db.expenses.delete(dp.id!);
              }
            }
          }

          // Handle main purchase expense (Treasury)
          const mainExps = await db.expenses.where('purchaseId').equals(originalId).toArray();
          const mainPurchaseExp = mainExps.find(e => e.description.includes('Pago de compra al contado'));
          
          if (updatedP.paymentStatus === 'paid') {
            if (mainPurchaseExp) {
              await db.expenses.update(mainPurchaseExp.id!, {
                amount: updatedP.totalAmount,
                date: updatedP.date,
                paymentMethod: updatedP.paymentMethod
              });
            } else {
              await db.expenses.add({
                storeId: updatedP.storeId,
                date: updatedP.date,
                description: `Pago de compra al contado #${originalId}`,
                amount: updatedP.totalAmount,
                type: 'expense',
                paymentMethod: updatedP.paymentMethod,
                purchaseId: originalId
              });
            }
          } else {
            // If it's now credit/consignment, remove the main expense if it existed
            if (mainPurchaseExp) {
              await db.expenses.delete(mainPurchaseExp.id!);
            }
          }

          const exps = await db.expenses.where('purchaseId').equals(originalId).toArray();
          for (const e of exps) {
            if (e.type === 'expense') {
              await db.expenses.update(e.id!, { 
                date: updatedP.date,
                amount: updatedP.extraExpense,
                paymentMethod: updatedP.extraExpenseAccount
              });
            } else if (e.type === 'income') {
              await db.expenses.update(e.id!, { 
                date: updatedP.date,
                amount: updatedP.extraIncome,
                paymentMethod: updatedP.extraIncomeAccount
              });
            } else {
              await db.expenses.update(e.id!, { date: updatedP.date });
            }
          }
        }
      });
      setStatusMessage({ type: 'success', text: 'Operación actualizada con éxito' });
      setEditModal({ isOpen: false });
    } catch (error: any) {
      setStatusMessage({ type: 'error', text: 'Error al actualizar: ' + error.message });
    }
    setTimeout(() => setStatusMessage(null), 3000);
  };
  const executeDelete = async () => {
    if (deleteModal.type === 'single' && deleteModal.id && deleteModal.opType) {
      try {
        await db.transaction('rw', [db.inventory, db.transactions, db.purchases, db.debts, db.expenses], async () => {
          if (deleteModal.opType === 'transaction') {
            const tx = await db.transactions.get(deleteModal.id!);
            if (!tx) throw new Error('Operación no encontrada');

            // 1. Revert inventory
            for (const item of tx.items || []) {
              // Add back to origin store
              const originBatches = await db.inventory.where({ storeId: tx.fromStoreId, productId: item.productId }).toArray();
              const originBatch = originBatches.find(b => b.costPrice === item.costPrice);
              
              if (originBatch) {
                await db.inventory.update(originBatch.id!, { quantity: originBatch.quantity + item.quantity });
              } else {
                await db.inventory.add({ 
                  storeId: tx.fromStoreId, 
                  productId: item.productId, 
                  quantity: item.quantity,
                  costPrice: item.costPrice,
                  dateAdded: new Date().toISOString()
                });
              }

              // If target is another store, deduct from destination store
              if (tx.toStoreId) {
                const destBatches = await db.inventory.where({ storeId: tx.toStoreId, productId: item.productId }).toArray();
                
                // The cost price added to the destination store was the transaction price
                const destCostPrice = item.price;
                
                // Sort batches: try to deduct from the exact cost price first, then FIFO
                destBatches.sort((a, b) => {
                  if (a.costPrice === destCostPrice && b.costPrice !== destCostPrice) return -1;
                  if (a.costPrice !== destCostPrice && b.costPrice === destCostPrice) return 1;
                  const dateA = a.dateAdded ? new Date(a.dateAdded).getTime() : 0;
                  const dateB = b.dateAdded ? new Date(b.dateAdded).getTime() : 0;
                  return dateA - dateB;
                });

                let remainingToDeduct = item.quantity;
                
                for (const batch of destBatches) {
                  if (remainingToDeduct <= 0) break;
                  
                  const deductAmount = Math.min(batch.quantity, remainingToDeduct);
                  
                  if (deductAmount > 0) {
                    if (batch.quantity === deductAmount) {
                      await db.inventory.delete(batch.id!);
                    } else {
                      await db.inventory.update(batch.id!, { quantity: batch.quantity - deductAmount });
                    }
                    remainingToDeduct -= deductAmount;
                  }
                }
              }
            }

          // 2. Delete associated debts
          const associatedDebts = await db.debts.where('transactionId').equals(deleteModal.id!).toArray();
          for (const debt of associatedDebts) {
            await db.debts.delete(debt.id!);
          }

          // 3. Delete associated expenses
          const associatedExpenses = await db.expenses.where('transactionId').equals(deleteModal.id!).toArray();
          for (const exp of associatedExpenses) {
            await db.expenses.delete(exp.id!);
          }

            // 4. Delete transaction
            await db.transactions.delete(deleteModal.id!);
          } else if (deleteModal.opType === 'purchase') {
            const p = await db.purchases.get(deleteModal.id!);
            if (!p) throw new Error('Compra no encontrada');

            // 1. Revert inventory
            for (const item of p.items || []) {
              const batches = await db.inventory.where({ storeId: p.storeId, productId: item.productId }).toArray();
              const batch = batches.find(b => b.costPrice === item.costPrice);
              
              if (batch) {
                if (batch.quantity <= item.quantity) {
                   await db.inventory.delete(batch.id!);
                } else {
                   await db.inventory.update(batch.id!, { quantity: batch.quantity - item.quantity });
                }
              }
            }

          // 2. Delete associated debts
          const associatedDebts = await db.debts.where('purchaseId').equals(deleteModal.id!).toArray();
          for (const debt of associatedDebts) {
            await db.debts.delete(debt.id!);
          }

          // 3. Delete associated expenses
          const associatedExpenses = await db.expenses.where('purchaseId').equals(deleteModal.id!).toArray();
          for (const exp of associatedExpenses) {
            await db.expenses.delete(exp.id!);
          }

            // 4. Delete purchase
            await db.purchases.delete(deleteModal.id!);
          }
        });
        setStatusMessage({ type: 'success', text: 'Operación eliminada con éxito' });
      } catch (error: any) {
        setStatusMessage({ type: 'error', text: 'Error al eliminar la operación: ' + error.message });
      }
    } else if (deleteModal.type === 'all') {
      try {
        await db.transaction('rw', [db.inventory, db.transactions, db.purchases, db.debts, db.expenses], async () => {
          for (const op of operations) {
            if (op.opType === 'transaction') {
              const tx = await db.transactions.get(op.originalId);
              if (!tx) continue;

              // 1. Revert inventory
              for (const item of tx.items || []) {
                const originBatches = await db.inventory.where({ storeId: tx.fromStoreId, productId: item.productId }).toArray();
                const originBatch = originBatches.find(b => b.costPrice === item.costPrice);
                
                if (originBatch) {
                  await db.inventory.update(originBatch.id!, { quantity: originBatch.quantity + item.quantity });
                } else {
                  await db.inventory.add({ 
                    storeId: tx.fromStoreId, 
                    productId: item.productId, 
                    quantity: item.quantity,
                    costPrice: item.costPrice,
                    dateAdded: new Date().toISOString()
                  });
                }
                
                // Unarchive if it was archived
                await db.products.update(item.productId, { archived: false });

                if (tx.toStoreId) {
                  const destBatches = await db.inventory.where({ storeId: tx.toStoreId, productId: item.productId }).toArray();
                  const destCostPrice = item.price;
                  destBatches.sort((a, b) => {
                    if (a.costPrice === destCostPrice && b.costPrice !== destCostPrice) return -1;
                    if (a.costPrice !== destCostPrice && b.costPrice === destCostPrice) return 1;
                    const dateA = a.dateAdded ? new Date(a.dateAdded).getTime() : 0;
                    const dateB = b.dateAdded ? new Date(b.dateAdded).getTime() : 0;
                    return dateA - dateB;
                  });

                  let remainingToDeduct = item.quantity;
                  for (const batch of destBatches) {
                    if (remainingToDeduct <= 0) break;
                    const deductAmount = Math.min(batch.quantity, remainingToDeduct);
                    if (deductAmount > 0) {
                      if (batch.quantity === deductAmount) {
                        await db.inventory.delete(batch.id!);
                      } else {
                        await db.inventory.update(batch.id!, { quantity: batch.quantity - deductAmount });
                      }
                      remainingToDeduct -= deductAmount;
                    }
                  }
                }
              }

              // 2. Delete associated debts
              const associatedDebts = await db.debts.where('transactionId').equals(tx.id!).toArray();
              for (const debt of associatedDebts) {
                await db.debts.delete(debt.id!);
              }

              // 3. Delete associated expenses
              const associatedExpenses = await db.expenses.where('transactionId').equals(tx.id!).toArray();
              for (const exp of associatedExpenses) {
                await db.expenses.delete(exp.id!);
              }

              // 4. Delete transaction
              await db.transactions.delete(tx.id!);
            } else if (op.opType === 'purchase') {
              const p = await db.purchases.get(op.originalId);
              if (!p) continue;

              // 1. Revert inventory
              for (const item of p.items || []) {
                const batches = await db.inventory.where({ storeId: p.storeId, productId: item.productId }).toArray();
                const batch = batches.find(b => b.costPrice === item.costPrice);
                if (batch) {
                  if (batch.quantity <= item.quantity) {
                     await db.inventory.delete(batch.id!);
                  } else {
                     await db.inventory.update(batch.id!, { quantity: batch.quantity - item.quantity });
                  }
                }

                // Check for auto-archiving (purchase deleted, stock might be 0)
                const totalStockAfter = await db.inventory.where('productId').equals(item.productId).toArray();
                const totalQty = totalStockAfter.reduce((sum, b) => sum + b.quantity, 0);
                if (totalQty <= 0) {
                  await db.products.update(item.productId, { archived: true });
                }
              }

              // 2. Delete associated debts
              const associatedDebts = await db.debts.where('purchaseId').equals(p.id!).toArray();
              for (const debt of associatedDebts) {
                await db.debts.delete(debt.id!);
              }

              // 3. Delete associated expenses
              const associatedExpenses = await db.expenses.where('purchaseId').equals(p.id!).toArray();
              for (const exp of associatedExpenses) {
                await db.expenses.delete(exp.id!);
              }

              // 4. Delete purchase
              await db.purchases.delete(p.id!);
            }
          }
        });
        setStatusMessage({ type: 'success', text: 'Las operaciones han sido eliminadas con éxito' });
      } catch (error: any) {
        setStatusMessage({ type: 'error', text: 'Error al eliminar las operaciones: ' + error.message });
      }
    }
    
    setDeleteModal({ isOpen: false, type: 'single' });
    setTimeout(() => setStatusMessage(null), 3000);
  };

  return (
    <div className="space-y-6 relative">
      {statusMessage && (
        <div className={cn(
          "p-4 rounded-xl flex items-center gap-3 border shadow-sm",
          statusMessage.type === 'success' 
            ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800' 
            : 'bg-rose-50 dark:bg-rose-900/20 text-rose-800 dark:text-rose-200 border-rose-200 dark:border-rose-800'
        )}>
          {statusMessage.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
          <p className="text-sm font-bold">{statusMessage.text}</p>
        </div>
      )}

      {editModal.isOpen && editModal.data && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white dark:bg-[#161B22] rounded-2xl shadow-2xl max-w-2xl w-full p-8 my-8 border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95">
            <h3 className="text-xl font-bold mb-6 text-slate-900 dark:text-slate-100">Editar {editModal.opType === 'transaction' ? 'Operación' : 'Compra'}</h3>
            <form onSubmit={handleUpdateOperation} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Fecha</label>
                  <input
                    type="datetime-local"
                    required
                    value={toLocalISO(editModal.data.date)}
                    onChange={(e) => setEditModal({ ...editModal, data: { ...editModal.data, date: fromLocalISO(e.target.value) } })}
                    className="input-field"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">
                    {editModal.opType === 'transaction' ? 'Cliente' : 'Proveedor'}
                  </label>
                  {editModal.opType === 'transaction' ? (
                    <input
                      type="text"
                      value={editModal.data.customerName || ''}
                      onChange={(e) => setEditModal({ ...editModal, data: { ...editModal.data, customerName: e.target.value } })}
                      className="input-field"
                    />
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <select
                        value={editModal.data.supplierId}
                        onChange={(e) => setEditModal({ ...editModal, data: { ...editModal.data, supplierId: parseInt(e.target.value) } })}
                        className="input-field"
                      >
                        {suppliers?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                      <select
                        value={editModal.data.paymentStatus}
                        onChange={(e) => setEditModal({ ...editModal, data: { ...editModal.data, paymentStatus: e.target.value } })}
                        className="input-field"
                      >
                        <option value="paid">Pagado (Contado)</option>
                        <option value="credit">Crédito (Por Pagar)</option>
                      </select>
                    </div>
                  )}
                </div>
              </div>

              {editModal.opType === 'purchase' && editModal.data.paymentStatus === 'paid' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Método de Pago Principal</label>
                    <div className="grid grid-cols-2 gap-4">
                      <button
                        type="button"
                        onClick={() => setEditModal({ ...editModal, data: { ...editModal.data, paymentMethod: 'cash' } })}
                        className={cn(
                          "p-3 rounded-xl text-xs font-bold transition-all border",
                          editModal.data.paymentMethod === 'cash'
                            ? "bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-600/20"
                            : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:border-indigo-400"
                        )}
                      >
                        Efectivo
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditModal({ ...editModal, data: { ...editModal.data, paymentMethod: 'transfer' } })}
                        className={cn(
                          "p-3 rounded-xl text-xs font-bold transition-all border",
                          editModal.data.paymentMethod === 'transfer'
                            ? "bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-600/20"
                            : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:border-indigo-400"
                        )}
                      >
                        Transferencia
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1 text-rose-500">Gasto Extra</label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          step="0.01"
                          value={editModal.data.extraExpense || 0}
                          onChange={(e) => setEditModal({ ...editModal, data: { ...editModal.data, extraExpense: e.target.value } })}
                          className="input-field flex-1"
                        />
                        <select
                          value={editModal.data.extraExpenseAccount || 'cash'}
                          onChange={(e) => setEditModal({ ...editModal, data: { ...editModal.data, extraExpenseAccount: e.target.value } })}
                          className="w-24 input-field text-[10px]"
                        >
                          <option value="cash">Efectivo</option>
                          <option value="transfer">Transf.</option>
                        </select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1 text-emerald-500">Ingreso Extra</label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          step="0.01"
                          value={editModal.data.extraIncome || 0}
                          onChange={(e) => setEditModal({ ...editModal, data: { ...editModal.data, extraIncome: e.target.value } })}
                          className="input-field flex-1"
                        />
                        <select
                          value={editModal.data.extraIncomeAccount || 'cash'}
                          onChange={(e) => setEditModal({ ...editModal, data: { ...editModal.data, extraIncomeAccount: e.target.value } })}
                          className="w-24 input-field text-[10px]"
                        >
                          <option value="cash">Efectivo</option>
                          <option value="transfer">Transf.</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {editModal.opType === 'transaction' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                   <div className="space-y-2">
                      <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1 text-rose-500">Gasto Extra</label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          step="0.01"
                          value={editModal.data.extraExpense || 0}
                          onChange={(e) => setEditModal({ ...editModal, data: { ...editModal.data, extraExpense: e.target.value } })}
                          className="input-field flex-1"
                        />
                        <select
                          value={editModal.data.extraExpenseAccount || 'cash'}
                          onChange={(e) => setEditModal({ ...editModal, data: { ...editModal.data, extraExpenseAccount: e.target.value } })}
                          className="w-24 input-field text-[10px]"
                        >
                          <option value="cash">Efectivo</option>
                          <option value="transfer">Transf.</option>
                        </select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1 text-emerald-500">Ingreso Extra</label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          step="0.01"
                          value={editModal.data.extraIncome || 0}
                          onChange={(e) => setEditModal({ ...editModal, data: { ...editModal.data, extraIncome: e.target.value } })}
                          className="input-field flex-1"
                        />
                        <select
                          value={editModal.data.extraIncomeAccount || 'cash'}
                          onChange={(e) => setEditModal({ ...editModal, data: { ...editModal.data, extraIncomeAccount: e.target.value } })}
                          className="w-24 input-field text-[10px]"
                        >
                          <option value="cash">Efectivo</option>
                          <option value="transfer">Transf.</option>
                        </select>
                      </div>
                    </div>
                </div>
              )}

              <div className="space-y-3">
                <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Productos</label>
                <div className="max-h-64 overflow-y-auto border border-slate-100 dark:border-slate-800 rounded-2xl p-3 space-y-3 custom-scrollbar">
                  {editModal.data.items.map((item: any, idx: number) => (
                    <div key={idx} className="flex flex-col sm:flex-row sm:items-center gap-3 bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex-1 truncate">{getProductName(item.productId)}</span>
                      <div className="flex items-center gap-3">
                        <div className="relative w-24">
                          <input
                            type="number"
                            step="0.01"
                            value={item.quantity}
                            onChange={(e) => {
                              const newItems = [...editModal.data.items];
                              newItems[idx] = { ...item, quantity: e.target.value };
                              const newTotal = newItems.reduce((sum, it) => sum + (parseFloat(it.quantity) * parseFloat(it.price || it.costPrice)), 0);
                              setEditModal({ ...editModal, data: { ...editModal.data, items: newItems, totalAmount: newTotal } });
                            }}
                            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            placeholder="Cant"
                          />
                        </div>
                        <div className="relative w-28">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 font-bold text-[10px]">$</span>
                          <input
                            type="number"
                            step="0.01"
                            value={item.price || item.costPrice}
                            onChange={(e) => {
                              const newItems = [...editModal.data.items];
                              const val = e.target.value;
                              if (item.price !== undefined) newItems[idx] = { ...item, price: val };
                              else newItems[idx] = { ...item, costPrice: val };
                              const newTotal = newItems.reduce((sum, it) => sum + (parseFloat(it.quantity) * parseFloat(it.price || it.costPrice)), 0);
                              setEditModal({ ...editModal, data: { ...editModal.data, items: newItems, totalAmount: newTotal } });
                            }}
                            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg pl-5 pr-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            placeholder="Precio"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Total Final</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 font-bold text-sm">$</span>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={editModal.data.totalAmount}
                    onChange={(e) => setEditModal({ ...editModal, data: { ...editModal.data, totalAmount: e.target.value } })}
                    className="input-field pl-8 font-black text-lg"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-6">
                <button
                  type="button"
                  onClick={() => setEditModal({ isOpen: false })}
                  className="px-6 py-2.5 text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 uppercase tracking-widest transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn-primary px-8 py-2.5 text-xs"
                >
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteModal.isOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#161B22] rounded-2xl shadow-2xl max-w-md w-full p-8 border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-4 text-rose-500 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-900/20 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold dark:text-slate-100">Confirmar Eliminación</h3>
            </div>
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-8 leading-relaxed">
              {deleteModal.type === 'all' 
                ? (activeStoreId ? '¿Estás seguro de que deseas eliminar TODAS las operaciones de este punto de venta? Esta acción es irreversible, revertirá todo el inventario afectado y eliminará las deudas asociadas.' : '¿Estás seguro de que deseas eliminar TODAS las operaciones? Esta acción es irreversible, revertirá todo el inventario afectado y eliminará las deudas asociadas.')
                : '¿Estás seguro de que deseas eliminar esta operación? Esta acción revertirá el inventario y eliminará las deudas asociadas.'}
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteModal({ isOpen: false, type: 'single' })}
                className="px-6 py-2.5 text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 uppercase tracking-widest transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={executeDelete}
                className="bg-rose-500 hover:bg-rose-600 text-white px-8 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all shadow-lg shadow-rose-500/20"
              >
                Sí, Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {adjustModal.isOpen && adjustModal.items && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#161B22] rounded-2xl shadow-2xl max-w-2xl w-full p-8 border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95">
            <h3 className="text-xl font-bold mb-4 text-slate-900 dark:text-slate-100">Ajustar Precio de Costo</h3>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-8 leading-relaxed">
              Selecciona el producto cuyo costo deseas ajustar. Solo se modificará el costo para la cantidad restante en inventario de esta compra, y se actualizará la deuda correspondiente.
            </p>
            <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
              {adjustModal.items.map((item, idx) => (
                <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between bg-slate-50 dark:bg-slate-900/50 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 gap-4">
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-1">{getProductName(item.productId)}</p>
                    <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                      Comprados: {formatNumber(item.quantity)} | Costo Original: {formatCurrency(item.costPrice)}
                    </p>
                  </div>
                  {adjustingItemIndex === idx ? (
                    <div className="flex items-center gap-2">
                      <div className="relative w-28">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 font-bold text-[10px]">$</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={newCostPrice}
                          onChange={(e) => setNewCostPrice(e.target.value)}
                          className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl pl-6 pr-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          placeholder="Nuevo"
                        />
                      </div>
                      <button
                        onClick={() => handleAdjustCost(adjustModal.purchaseId!, idx, item.costPrice, item.quantity, item.productId)}
                        className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-indigo-700 transition-colors"
                      >
                        Guardar
                      </button>
                      <button
                        onClick={() => { setAdjustingItemIndex(null); setNewCostPrice(''); }}
                        className="bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setAdjustingItemIndex(idx); setNewCostPrice(item.costPrice.toString()); }}
                      className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 text-[10px] font-bold uppercase tracking-widest bg-indigo-50 dark:bg-indigo-900/20 px-4 py-2 rounded-xl transition-all"
                    >
                      <Edit className="w-3.5 h-3.5" /> Ajustar
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-end mt-8">
              <button
                onClick={() => { setAdjustModal({ isOpen: false }); setAdjustingItemIndex(null); setNewCostPrice(''); }}
                className="px-6 py-2.5 text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 uppercase tracking-widest transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="p-8 border-b border-slate-100 dark:border-slate-800 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
          <div>
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Historial de Operaciones</h3>
            <p className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mt-1">Consulta y gestión de transacciones</p>
          </div>
          <div className="flex flex-wrap items-center gap-4 w-full lg:w-auto">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
              <input
                type="text"
                placeholder="Buscar por producto..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input-field pl-11 py-2.5 text-xs"
              />
            </div>
            <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-900/50 px-4 py-2 rounded-xl border border-slate-100 dark:border-slate-800">
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Desde:</span>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="bg-transparent text-xs font-bold text-slate-700 dark:text-slate-300 focus:outline-none" />
            </div>
            <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-900/50 px-4 py-2 rounded-xl border border-slate-100 dark:border-slate-800">
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Hasta:</span>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="bg-transparent text-xs font-bold text-slate-700 dark:text-slate-300 focus:outline-none" />
            </div>
            <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-900/50 px-4 py-2 rounded-xl border border-slate-100 dark:border-slate-800">
              <Filter className="w-4 h-4 text-slate-400 dark:text-slate-500" />
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as any)}
                className="bg-transparent text-xs font-bold text-slate-700 dark:text-slate-300 focus:outline-none"
              >
                <option value="all">Todas</option>
                <option value="sale">Ventas</option>
                <option value="consignment">Consignaciones</option>
                <option value="purchase">Compras</option>
              </select>
            </div>
            {operations && operations.length > 0 && !isGuest && (
              <button
                onClick={() => setDeleteModal({ isOpen: true, type: 'all' })}
                className="flex items-center gap-2 px-5 py-2.5 bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 rounded-xl hover:bg-rose-100 dark:hover:bg-rose-900/40 transition-all text-[10px] font-bold uppercase tracking-widest"
              >
                <AlertTriangle className="w-4 h-4" />
                Eliminar Visibles
              </button>
            )}
            {isGuest && (
              <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 rounded-xl border border-amber-100 dark:border-amber-900/30 text-[10px] font-bold uppercase tracking-widest">
                <Lock className="w-4 h-4" />
                Modo Lectura
              </div>
            )}
          </div>
        </div>
        <div className="bg-slate-50/50 dark:bg-slate-900/50 p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">Total Operaciones Visibles</span>
          <span className="text-2xl font-black text-slate-900 dark:text-slate-100 tabular-nums">{formatCurrency(totalFilteredAmount)}</span>
        </div>
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 dark:bg-slate-900/50">
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">Fecha</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">Tipo</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">Origen/Proveedor</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">Destino/Cliente</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">Productos</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] text-right">Total</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {operations.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <Search className="w-8 h-8 text-slate-200 dark:text-slate-700" />
                      <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">No se encontraron operaciones</p>
                    </div>
                  </td>
                </tr>
              ) : (
                operations.map((op) => (
                  <tr key={op.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors group">
                    <td className="px-6 py-4">
                      <p className="text-xs font-bold text-slate-700 dark:text-slate-300">{new Date(op.date).toLocaleDateString()}</p>
                      <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mt-0.5">{new Date(op.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border",
                        op.type === 'sale' ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/30" :
                        op.type === 'consignment' ? "bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border-amber-100 dark:border-amber-900/30" :
                        "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-100 dark:border-blue-900/30"
                      )}>
                        {op.type === 'sale' ? 'Venta' : op.type === 'consignment' ? 'Consign.' : (
                          <>
                            Compra {op.paymentMethod && <span className="ml-1 opacity-60">({op.paymentMethod === 'cash' ? 'Efe' : 'Trf'})</span>}
                          </>
                        )}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-xs font-bold text-slate-600 dark:text-slate-400">{op.origin}</p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-xs font-bold text-slate-600 dark:text-slate-400">{op.destination}</p>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1.5 max-w-xs">
                        {op.items.map((item: any, idx: number) => (
                          <span key={idx} className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded text-[10px] font-bold border border-slate-200 dark:border-slate-700">
                            {getProductName(item.productId)} ({formatNumber(item.quantity)})
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <p className="text-sm font-black text-slate-900 dark:text-slate-100 tabular-nums">{formatCurrency(op.totalAmount)}</p>
                      {op.paymentStatus === 'pending' && (
                        <span className="text-[9px] font-black text-rose-500 dark:text-rose-400 uppercase tracking-tighter">Deuda Pendiente</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        {!isGuest && (
                          <>
                            {op.opType === 'purchase' && (
                              <button
                                onClick={() => setAdjustModal({ isOpen: true, purchaseId: op.originalId, items: op.items })}
                                className="p-2 text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-xl transition-colors"
                                title="Ajustar Costos"
                              >
                                <AlertTriangle className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              onClick={() => setEditModal({ isOpen: true, opType: op.opType, data: op })}
                              className="p-2 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-xl transition-colors"
                              title="Editar"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setDeleteModal({ isOpen: true, type: 'single', id: op.originalId, opType: op.opType })}
                              className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-xl transition-colors"
                              title="Eliminar"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        {isGuest && <Lock className="w-4 h-4 text-slate-300 dark:text-slate-700" />}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
