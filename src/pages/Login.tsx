import React, { useState } from 'react';
import { db } from '../lib/db';
import { hashPassword } from '../lib/auth';
import { useAuth } from '../lib/AuthContext';
import { LogIn, User as UserIcon, Lock, AlertCircle } from 'lucide-react';
import { motion } from 'motion/react';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setError('');

    try {
      const normalizedUsername = username.toLowerCase().trim();
      const user = await db.users.where('username').equals(normalizedUsername).first();
      
      if (!user) {
        setError('El usuario no existe.');
        setIsLoggingIn(false);
        return;
      }

      const hashedPassword = await hashPassword(password);
      if (user.password === hashedPassword) {
        login(user);
      } else {
        setError('Contraseña incorrecta.');
      }
    } catch (err: any) {
      console.error('Login error:', err);
      setError('Error al intentar iniciar sesión: ' + (err.message || 'Error desconocido'));
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950 flex items-center justify-center p-4 transition-colors duration-300">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-white dark:bg-[#161B22] rounded-2xl shadow-xl border border-gray-100 dark:border-slate-800 p-8"
      >
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-brand-50 dark:bg-brand-900/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <LogIn className="w-8 h-8 text-brand-600 dark:text-brand-400" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">Bienvenido</h1>
          <p className="text-gray-500 dark:text-slate-400 text-sm mt-1">Inicia sesión para gestionar tu inventario</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-xl p-4 flex items-start gap-3 text-red-800 dark:text-red-300 text-sm">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <p>{error}</p>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider px-1">
              Usuario
            </label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <UserIcon className="w-5 h-5 text-gray-400 dark:text-slate-500 group-focus-within:text-brand-500 transition-colors" />
              </div>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full pl-11 pr-4 py-3 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all outline-none text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-600"
                placeholder="Ingresa tu usuario"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider px-1">
              Contraseña
            </label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Lock className="w-5 h-5 text-gray-400 dark:text-slate-500 group-focus-within:text-brand-500 transition-colors" />
              </div>
              <input
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-11 pr-4 py-3 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all outline-none text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-600"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-4 flex items-center text-xs font-bold text-gray-400 dark:text-slate-500 hover:text-brand-500 transition-colors"
              >
                {showPassword ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoggingIn}
            className="w-full bg-brand-600 hover:bg-brand-700 text-white font-bold py-3 rounded-xl shadow-lg shadow-brand-200 dark:shadow-brand-900/20 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoggingIn ? 'Iniciando sesión...' : 'Iniciar Sesión'}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-gray-100 dark:border-slate-800 text-center">
          <p className="text-xs text-gray-400 dark:text-slate-500">
            Sistema de Gestión de Inventario v1.0
          </p>
        </div>
      </motion.div>
    </div>
  );
}
