import React, { useState, useRef, useEffect } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, Store, Package, Boxes, ShoppingCart, 
  Receipt, CreditCard, BarChart3, History, Settings as SettingsIcon, 
  Truck, ShoppingBag, Wallet, ChevronDown, Menu, X, LogOut, User as UserIcon,
  Sun, Moon
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { useStoreContext } from '../lib/StoreContext';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../lib/AuthContext';
import { useTheme } from '../lib/ThemeContext';

const navItems = [
  { name: 'Dashboard', path: '/', icon: LayoutDashboard },
  { name: 'Puntos de Venta', path: '/stores', icon: Store },
  { name: 'Productos', path: '/products', icon: Package },
  { name: 'Proveedores', path: '/suppliers', icon: Truck },
  { name: 'Inventario', path: '/inventory', icon: Boxes },
  { name: 'Compras', path: '/purchases', icon: ShoppingBag },
  { name: 'Ventas', path: '/sales', icon: ShoppingCart },
  { name: 'Tesorería', path: '/treasury', icon: Wallet },
  { name: 'Operaciones', path: '/transactions', icon: History },
  { name: 'Gastos/Ingresos', path: '/expenses', icon: Receipt },
  { name: 'Cuentas', path: '/debts', icon: CreditCard },
  { name: 'Reportes', path: '/reports', icon: BarChart3 },
  { name: 'Configuración', path: '/settings', icon: SettingsIcon },
];

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { activeStoreId, setActiveStoreId } = useStoreContext();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const stores = useLiveQuery(() => db.stores.toArray());
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const filteredNavItems = navItems;

  const currentItem = filteredNavItems.find(i => i.path === location.pathname) || filteredNavItems[0];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] dark:bg-[#0B0E14] flex flex-col transition-colors duration-300">
      {/* Top Header */}
      <header className="sticky top-0 z-50 bg-white/70 dark:bg-[#161B22]/70 backdrop-blur-xl border-b border-slate-200/50 dark:border-slate-800/50 h-16 flex items-center justify-between px-4 md:px-8">
        <div className="flex items-center gap-4 md:gap-8">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="w-9 h-9 bg-slate-900 dark:bg-slate-100 rounded-[12px] flex items-center justify-center transition-all group-hover:scale-105 group-hover:shadow-lg group-hover:shadow-slate-900/20 dark:group-hover:shadow-slate-100/10">
              <Package className="w-5 h-5 text-white dark:text-slate-900" />
            </div>
            <h1 className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 hidden sm:block">GarkFe</h1>
          </Link>

          {/* Dropdown Menu Trigger */}
          <div className="relative" ref={menuRef}>
            <button 
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className={cn(
                "flex items-center gap-2.5 px-4 py-2 rounded-2xl transition-all group",
                isMenuOpen ? "bg-slate-100 dark:bg-slate-800 shadow-inner" : "hover:bg-slate-50 dark:hover:bg-slate-800/50"
              )}
            >
              <div className="w-8 h-8 rounded-lg bg-slate-50 dark:bg-slate-800 flex items-center justify-center group-hover:bg-white dark:group-hover:bg-slate-700 transition-colors">
                <currentItem.icon className="w-4.5 h-4.5 text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-slate-100" />
              </div>
              <span className="text-sm font-bold text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-slate-100">{currentItem.name}</span>
              <ChevronDown className={cn("w-4 h-4 text-slate-400 dark:text-slate-500 transition-transform duration-300", isMenuOpen && "rotate-180")} />
            </button>

            <AnimatePresence>
              {isMenuOpen && (
                <>
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[55] md:hidden bg-slate-900/10 backdrop-blur-sm"
                    onClick={() => setIsMenuOpen(false)}
                  />
                  <motion.div 
                    initial={{ opacity: 0, y: 12, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 12, scale: 0.98 }}
                    transition={{ type: "spring", damping: 25, stiffness: 300 }}
                    className="absolute top-full left-0 mt-3 w-72 bg-white/95 dark:bg-[#161B22]/95 backdrop-blur-xl rounded-[24px] border border-slate-200/60 dark:border-slate-800/60 shadow-[0_20px_50px_rgba(0,0,0,0.1)] overflow-hidden z-[60]"
                  >
                    <div className="p-3 grid grid-cols-1 gap-1.5 max-h-[75vh] overflow-y-auto custom-scrollbar">
                      <div className="px-3 py-2 mb-1">
                        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">Navegación</p>
                      </div>
                      {filteredNavItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = location.pathname === item.path;
                        return (
                          <Link
                            key={item.path}
                            to={item.path}
                            onClick={() => setIsMenuOpen(false)}
                            className={cn(
                              "flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-bold transition-all group/item",
                              isActive 
                                ? "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 shadow-lg shadow-slate-900/20 dark:shadow-slate-100/10 scale-[1.02]" 
                                : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100"
                            )}
                          >
                            <div className={cn(
                              "w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
                              isActive ? "bg-white/10 dark:bg-slate-900/10" : "bg-slate-100 dark:bg-slate-800 group-hover/item:bg-white dark:group-hover/item:bg-slate-700"
                            )}>
                              <Icon className={cn("w-4 h-4", isActive ? "text-white dark:text-slate-900" : "text-slate-500 dark:text-slate-400 group-hover/item:text-slate-900 dark:group-hover/item:text-slate-100")} />
                            </div>
                            {item.name}
                          </Link>
                        );
                      })}
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-3 bg-slate-50/50 dark:bg-slate-800/50 px-4 py-2 rounded-2xl border border-slate-200/60 dark:border-slate-800/60 hover:bg-white dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-all">
            <Store className="w-4 h-4 text-slate-400 dark:text-slate-500" />
            <select
              value={activeStoreId}
              onChange={(e) => setActiveStoreId(e.target.value ? parseInt(e.target.value) : '')}
              className="bg-transparent text-xs font-bold text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer pr-2"
            >
              <option value="">Todos los Puntos</option>
              {stores?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          
          {/* Mobile Store Selector Icon */}
          <div className="md:hidden">
             <select
              value={activeStoreId}
              onChange={(e) => setActiveStoreId(e.target.value ? parseInt(e.target.value) : '')}
              className="w-10 h-10 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl flex items-center justify-center text-xs appearance-none text-center font-bold text-slate-700 dark:text-slate-300"
            >
              <option value="">🏪</option>
              {stores?.map(s => <option key={s.id} value={s.id}>{s.name.substring(0,2).toUpperCase()}</option>)}
            </select>
          </div>
          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-all"
            title={theme === 'light' ? 'Activar modo oscuro' : 'Activar modo claro'}
          >
            {theme === 'light' ? <Moon className="w-4.5 h-4.5" /> : <Sun className="w-4.5 h-4.5" />}
          </button>
          {/* User Menu */}
          <div className="relative" ref={userMenuRef}>
            <button 
              onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
              className="flex items-center gap-2 p-1.5 rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-all border border-transparent hover:border-slate-200 dark:hover:border-slate-700"
            >
              <div className="w-9 h-9 rounded-xl bg-brand-50 dark:bg-brand-900/20 flex items-center justify-center text-brand-600 dark:text-brand-400">
                <UserIcon className="w-5 h-5" />
              </div>
              <div className="hidden sm:block text-left mr-2">
                <p className="text-xs font-bold text-slate-900 dark:text-slate-100 leading-tight">{user?.name}</p>
                <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider">{user?.role === 'admin' ? 'Administrador' : 'Invitado'}</p>
              </div>
              <ChevronDown className={cn("w-4 h-4 text-slate-400 dark:text-slate-500 transition-transform", isUserMenuOpen && "rotate-180")} />
            </button>

            <AnimatePresence>
              {isUserMenuOpen && (
                <motion.div 
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute top-full right-0 mt-2 w-48 bg-white dark:bg-[#161B22] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden z-[60]"
                >
                  <div className="p-2">
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      Cerrar Sesión
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto p-4 md:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
