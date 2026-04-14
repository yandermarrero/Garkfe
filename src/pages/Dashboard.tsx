import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { formatCurrency, formatDate, cn } from '../lib/utils';
import { Store, Package, ShoppingCart, CreditCard, ArrowRight, Wallet } from 'lucide-react';
import { useStoreContext } from '../lib/StoreContext';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';

export default function Dashboard() {
  const { activeStoreId } = useStoreContext();
  const stores = useLiveQuery(() => db.stores.toArray());

  const stats = useLiveQuery(async () => {
    const storesCount = await db.stores.count();
    const productsCount = await db.products.count();
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const recentSales = await db.transactions
      .where('date')
      .aboveOrEqual(today.toISOString())
      .toArray();
      
    const todaySalesTotal = recentSales
      .filter(t => t.type === 'sale' && (!activeStoreId || t.fromStoreId === activeStoreId))
      .reduce((sum, t) => sum + t.totalAmount, 0);

    const pendingDebts = await db.debts
      .where('status')
      .equals('pending')
      .toArray();
      
    const pendingDebtsTotal = pendingDebts
      .filter(d => !activeStoreId || d.creditorStoreId === activeStoreId)
      .reduce((sum, d) => sum + (d.amount - (d.paidAmount || 0)), 0);

    const pendingPayablesTotal = pendingDebts
      .filter(d => !activeStoreId || d.debtorStoreId === activeStoreId)
      .reduce((sum, d) => sum + (d.amount - (d.paidAmount || 0)), 0);

    const recentTransactions = await db.transactions
      .orderBy('date')
      .reverse()
      .limit(5)
      .toArray();

    const filteredRecentTransactions = recentTransactions.filter(tx => 
      !activeStoreId || tx.fromStoreId === activeStoreId || tx.toStoreId === activeStoreId
    );

    return { storesCount, productsCount, todaySalesTotal, pendingDebtsTotal, pendingPayablesTotal, recentTransactions: filteredRecentTransactions };
  }, [activeStoreId]);

  if (!stats) return <div className="flex items-center justify-center h-64 text-slate-400 font-medium">Cargando...</div>;

  const getStoreName = (id?: number) => stores?.find(s => s.id === id)?.name || 'N/A';

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
        <StatCard title="Puntos de Venta" value={stats.storesCount} icon={Store} color="bg-blue-500" link="/stores" />
        <StatCard title="Productos" value={stats.productsCount} icon={Package} color="bg-emerald-500" link="/products" />
        <StatCard title="Ventas Hoy" value={formatCurrency(stats.todaySalesTotal)} icon={ShoppingCart} color="bg-indigo-500" link="/transactions" />
        <StatCard title="Por Cobrar" value={formatCurrency(stats.pendingDebtsTotal)} icon={CreditCard} color="bg-amber-500" link="/debts" />
        <StatCard title="Por Pagar" value={formatCurrency(stats.pendingPayablesTotal)} icon={Wallet} color="bg-rose-500" link="/debts" />
      </div>

      <div className="card overflow-hidden">
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">Últimas Operaciones</h3>
          <Link to="/transactions" className="text-xs font-bold text-slate-900 dark:text-slate-100 hover:underline flex items-center gap-1.5 bg-white dark:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm transition-all hover:shadow-md active:scale-95">
            Ver todas <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/30 dark:bg-slate-800/30 border-b border-slate-100 dark:border-slate-800">
                <th className="px-6 py-4 text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Fecha</th>
                <th className="px-6 py-4 text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Tipo</th>
                <th className="px-6 py-4 text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Origen</th>
                <th className="px-6 py-4 text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Destino/Cliente</th>
                <th className="px-6 py-4 text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
              {stats.recentTransactions.map(tx => (
                <tr key={tx.id} className="group hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">{formatDate(tx.date)}</td>
                  <td className="px-6 py-4 text-sm">
                    <span className={cn(
                      "px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-tight",
                      tx.type === 'sale' ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/30" : "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border border-blue-100 dark:border-blue-900/30"
                    )}>
                      {tx.type === 'sale' ? 'Venta Directa' : 'Consignación'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-700 dark:text-slate-300 font-medium">{getStoreName(tx.fromStoreId)}</td>
                  <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">
                    {tx.toStoreId ? getStoreName(tx.toStoreId) : (tx.customerName || '-')}
                  </td>
                  <td className="px-6 py-4 text-sm font-bold text-slate-900 dark:text-slate-100 text-right">{formatCurrency(tx.totalAmount)}</td>
                </tr>
              ))}
              {stats.recentTransactions.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-400 dark:text-slate-500 font-medium">
                    {activeStoreId ? 'No hay operaciones recientes en este punto de venta.' : 'No hay operaciones recientes.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
}

function StatCard({ title, value, icon: Icon, color, link }: { title: string, value: string | number, icon: any, color: string, link?: string }) {
  const content = (
    <div className={cn(
      "card p-5 flex items-center gap-4 h-full",
      link && "hover:border-slate-900/20 group"
    )}>
      <div className={cn(
        "w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-lg transition-transform",
        color,
        link && "group-hover:scale-110"
      )}>
        <Icon className="w-6 h-6" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">{title}</p>
        <p className="text-xl font-bold text-slate-900 dark:text-slate-100 truncate">{value}</p>
      </div>
    </div>
  );

  if (link) {
    return <Link to={link} className="block h-full">{content}</Link>;
  }
  return content;
}
