import React, { useState } from 'react';
import { db, User } from '../lib/db';
import { 
  AlertTriangle, 
  Database, 
  CheckCircle, 
  XCircle, 
  Download, 
  Upload, 
  UserPlus, 
  Shield, 
  Trash2, 
  Edit2,
  User as UserIcon,
  ShieldCheck,
  ShieldAlert,
  Lock
} from 'lucide-react';
import { exportDB, importDB } from 'dexie-export-import';
import { useLiveQuery } from 'dexie-react-hooks';
import { hashPassword } from '../lib/auth';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

import { useAuth } from '../lib/AuthContext';

export default function Settings() {
  const { user: currentUser } = useAuth();
  const isGuest = currentUser?.role === 'guest';
  const [confirmStep, setConfirmStep] = useState(0);
  const [status, setStatus] = useState<{ type: 'idle' | 'success' | 'error', message: string }>({ type: 'idle', message: '' });
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  
  // User management state
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUser, setNewUser] = useState({ username: '', password: '', name: '', role: 'guest' as 'admin' | 'guest' });
  const [userStatus, setUserStatus] = useState<{ type: 'idle' | 'success' | 'error', message: string }>({ type: 'idle', message: '' });

  const [editingUser, setEditingUser] = useState<User & { newPassword?: string } | null>(null);

  const users = useLiveQuery(() => db.users.toArray());

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const blob = await exportDB(db, {
        prettyJson: true
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup_inventario_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setStatus({ type: 'success', message: 'Copia de seguridad exportada con éxito.' });
    } catch (error: any) {
      setStatus({ type: 'error', message: 'Error al exportar: ' + error.message });
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      // Clear current DB first? Or let importDB handle it?
      // importDB usually expects a fresh DB or can overwrite.
      // To be safe, we'll use the overwrite option if available or clear first.
      await db.delete();
      await importDB(file);
      setStatus({ type: 'success', message: 'Datos restaurados con éxito. La página se recargará.' });
      setTimeout(() => window.location.reload(), 2000);
    } catch (error: any) {
      setStatus({ type: 'error', message: 'Error al importar: ' + error.message });
    } finally {
      setIsImporting(false);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserStatus({ type: 'idle', message: '' });

    if (!newUser.username || !newUser.password || !newUser.name) {
      setUserStatus({ type: 'error', message: 'Todos los campos son obligatorios.' });
      return;
    }

    try {
      const normalizedUsername = newUser.username.toLowerCase().trim();
      const exists = await db.users.where('username').equals(normalizedUsername).first();
      if (exists) {
        setUserStatus({ type: 'error', message: 'El nombre de usuario ya existe.' });
        return;
      }

      const hashedPassword = await hashPassword(newUser.password);
      await db.users.add({
        ...newUser,
        username: normalizedUsername,
        password: hashedPassword
      });

      setUserStatus({ type: 'success', message: 'Usuario creado con éxito.' });
      setNewUser({ username: '', password: '', name: '', role: 'guest' });
      setTimeout(() => setShowAddUser(false), 1500);
    } catch (error: any) {
      setUserStatus({ type: 'error', message: 'Error al crear usuario: ' + error.message });
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser || !editingUser.id) return;

    try {
      const updates: any = {
        name: editingUser.name,
        role: editingUser.role
      };

      if (editingUser.newPassword) {
        updates.password = await hashPassword(editingUser.newPassword);
      }

      await db.users.update(editingUser.id, updates);
      setUserStatus({ type: 'success', message: 'Usuario actualizado con éxito.' });
      setEditingUser(null);
    } catch (error: any) {
      setUserStatus({ type: 'error', message: 'Error al actualizar: ' + error.message });
    }
  };

  const handleDeleteUser = async (id: number, username: string) => {
    if (username === 'admin') {
      alert('No se puede eliminar el administrador principal.');
      return;
    }

    if (window.confirm(`¿Estás seguro de que deseas eliminar al usuario ${username}?`)) {
      await db.users.delete(id);
    }
  };

  const handleClearDatabase = async () => {
    try {
      await db.delete();
      setStatus({ type: 'success', message: 'La base de datos ha sido eliminada. La aplicación se reiniciará.' });
      setConfirmStep(0);
      setTimeout(() => {
        window.location.href = '/';
      }, 2000);
    } catch (error: any) {
      setStatus({ type: 'error', message: 'Error al limpiar la base de datos: ' + error.message });
      setConfirmStep(0);
    }
  };

  return (
    <div className="space-y-8 max-w-4xl">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Data Management */}
        <div className="bg-white dark:bg-[#161B22] rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3 bg-slate-50/50 dark:bg-slate-800/50">
            <div className="w-10 h-10 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center shadow-sm">
              <Database className="w-5 h-5 text-slate-600 dark:text-slate-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Gestión de Datos</h3>
              <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">Respaldo y restauración</p>
            </div>
          </div>
          
          <div className="p-6 space-y-6">
            <AnimatePresence mode="wait">
              {status.type !== 'idle' && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className={cn(
                    "rounded-2xl p-4 flex items-start gap-3 border",
                    status.type === 'success' 
                      ? "bg-green-50 dark:bg-green-900/20 border-green-100 dark:border-green-800 text-green-800 dark:text-green-300" 
                      : "bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-800 text-red-800 dark:text-red-300"
                  )}
                >
                  {status.type === 'success' ? <CheckCircle className="w-5 h-5 mt-0.5" /> : <XCircle className="w-5 h-5 mt-0.5" />}
                  <p className="text-sm font-bold">{status.message}</p>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="grid grid-cols-1 gap-4">
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-2 flex items-center gap-2">
                  <Download className="w-4 h-4 text-brand-600 dark:text-brand-400" />
                  Copia de Seguridad
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">Descarga todos los datos actuales en un archivo JSON para guardarlos de forma segura.</p>
                <button
                  onClick={handleExport}
                  disabled={isExporting}
                  className="w-full flex items-center justify-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-brand-500 dark:hover:border-brand-500 hover:text-brand-600 dark:hover:text-brand-400 text-slate-700 dark:text-slate-300 px-4 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm disabled:opacity-50"
                >
                  {isExporting ? 'Exportando...' : 'Exportar Datos (JSON)'}
                </button>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-2 flex items-center gap-2">
                  <Upload className="w-4 h-4 text-brand-600 dark:text-brand-400" />
                  Restaurar Datos
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">Carga un archivo de respaldo previamente exportado. <span className="text-red-500 dark:text-red-400 font-bold">Esto sobrescribirá los datos actuales.</span></p>
                <label className="block">
                  <span className="sr-only">Elegir archivo de respaldo</span>
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleImport}
                    disabled={isImporting}
                    className="block w-full text-sm text-slate-500 dark:text-slate-400
                      file:mr-4 file:py-2.5 file:px-4
                      file:rounded-xl file:border-0
                      file:text-sm file:font-bold
                      file:bg-brand-50 dark:file:bg-brand-900/30 file:text-brand-700 dark:file:text-brand-300
                      hover:file:bg-brand-100 dark:hover:file:bg-brand-900/50
                      cursor-pointer"
                  />
                </label>
              </div>
            </div>

            {!isGuest && (
              <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                <div className="bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/20 rounded-2xl p-4">
                  <h4 className="text-red-800 dark:text-red-400 font-bold flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-5 h-5" />
                    Zona de Peligro
                  </h4>
                  
                  {confirmStep === 0 && (
                    <>
                      <p className="text-xs text-red-600 dark:text-red-400 mb-4 font-medium">
                        Borrar la base de datos eliminará permanentemente toda la información. Asegúrate de tener un respaldo.
                      </p>
                      <button
                        onClick={() => setConfirmStep(1)}
                        className="w-full bg-red-600 hover:bg-red-700 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-all shadow-lg shadow-red-100 dark:shadow-red-900/20"
                      >
                        Limpiar Base de Datos
                      </button>
                    </>
                  )}

                  {confirmStep > 0 && (
                    <div className="space-y-4">
                      <p className="text-xs font-bold text-red-700 dark:text-red-400 uppercase tracking-wider">
                        {confirmStep === 1 ? '¿Confirmas la eliminación total?' : '¡Última advertencia! Acción irreversible.'}
                      </p>
                      <div className="flex gap-3">
                        <button
                          onClick={confirmStep === 1 ? () => setConfirmStep(2) : handleClearDatabase}
                          className="flex-1 bg-red-700 hover:bg-red-800 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-all"
                        >
                          {confirmStep === 1 ? 'Sí, continuar' : 'ELIMINAR DEFINITIVAMENTE'}
                        </button>
                        <button
                          onClick={() => setConfirmStep(0)}
                          className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 px-4 py-2.5 rounded-xl text-xs font-bold transition-all"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* User Management */}
        <div className="bg-white dark:bg-[#161B22] rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center shadow-sm">
                <Shield className="w-5 h-5 text-slate-600 dark:text-slate-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Usuarios</h3>
                <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">Roles y accesos</p>
              </div>
            </div>
            {!isGuest && (
              <button
                onClick={() => setShowAddUser(!showAddUser)}
                className="p-2 bg-brand-600 text-white rounded-xl hover:bg-brand-700 transition-all shadow-lg shadow-brand-100 dark:shadow-brand-900/20"
              >
                <UserPlus className="w-5 h-5" />
              </button>
            )}
          </div>

          <div className="p-6 space-y-6">
            <AnimatePresence>
              {showAddUser && !editingUser && (
                <motion.form 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  onSubmit={handleAddUser}
                  className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 space-y-4"
                >
                  <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">Nuevo Usuario</h4>
                  
                  {userStatus.type !== 'idle' && (
                    <div className={cn(
                      "p-3 rounded-xl text-xs font-bold",
                      userStatus.type === 'success' ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300" : "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300"
                    )}>
                      {userStatus.message}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase ml-1">Nombre</label>
                      <input
                        type="text"
                        value={newUser.name}
                        onChange={e => setNewUser({...newUser, name: e.target.value})}
                        className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 outline-none text-slate-900 dark:text-slate-100"
                        placeholder="Ej: Juan Pérez"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase ml-1">Usuario</label>
                      <input
                        type="text"
                        value={newUser.username}
                        onChange={e => setNewUser({...newUser, username: e.target.value})}
                        className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 outline-none text-slate-900 dark:text-slate-100"
                        placeholder="juan.perez"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase ml-1">Contraseña</label>
                      <input
                        type="password"
                        value={newUser.password}
                        onChange={e => setNewUser({...newUser, password: e.target.value})}
                        className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 outline-none text-slate-900 dark:text-slate-100"
                        placeholder="••••••••"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase ml-1">Rol</label>
                      <select
                        value={newUser.role}
                        onChange={e => setNewUser({...newUser, role: e.target.value as 'admin' | 'guest'})}
                        className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 outline-none text-slate-900 dark:text-slate-100"
                      >
                        <option value="guest">Invitado</option>
                        <option value="admin">Administrador</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button type="submit" className="flex-1 bg-brand-600 text-white py-2 rounded-xl text-sm font-bold hover:bg-brand-700 transition-all">
                      Crear Usuario
                    </button>
                    <button type="button" onClick={() => setShowAddUser(false)} className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800 transition-all">
                      Cancelar
                    </button>
                  </div>
                </motion.form>
              )}

              {editingUser && (
                <motion.form 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  onSubmit={handleUpdateUser}
                  className="p-4 rounded-2xl bg-brand-50 dark:bg-brand-900/10 border border-brand-100 dark:border-brand-900/20 space-y-4"
                >
                  <h4 className="text-sm font-bold text-brand-900 dark:text-brand-300">Editar Usuario: @{editingUser.username}</h4>
                  
                  {userStatus.type !== 'idle' && (
                    <div className={cn(
                      "p-3 rounded-xl text-xs font-bold",
                      userStatus.type === 'success' ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300" : "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300"
                    )}>
                      {userStatus.message}
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase ml-1">Nombre</label>
                    <input
                      type="text"
                      value={editingUser.name}
                      onChange={e => setEditingUser({...editingUser, name: e.target.value})}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 outline-none text-slate-900 dark:text-slate-100"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase ml-1">Nueva Contraseña (opcional)</label>
                      <input
                        type="password"
                        value={editingUser.newPassword || ''}
                        onChange={e => setEditingUser({...editingUser, newPassword: e.target.value})}
                        className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 outline-none text-slate-900 dark:text-slate-100"
                        placeholder="Dejar en blanco"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase ml-1">Rol</label>
                      <select
                        value={editingUser.role}
                        onChange={e => setEditingUser({...editingUser, role: e.target.value as 'admin' | 'guest'})}
                        disabled={editingUser.username === 'admin'}
                        className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 outline-none disabled:opacity-50 text-slate-900 dark:text-slate-100"
                      >
                        <option value="guest">Invitado</option>
                        <option value="admin">Administrador</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button type="submit" className="flex-1 bg-brand-600 text-white py-2 rounded-xl text-sm font-bold hover:bg-brand-700 transition-all">
                      Guardar Cambios
                    </button>
                    <button type="button" onClick={() => { setEditingUser(null); setUserStatus({ type: 'idle', message: '' }); }} className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800 transition-all">
                      Cancelar
                    </button>
                  </div>
                </motion.form>
              )}
            </AnimatePresence>

            <div className="space-y-3">
              {users?.map(u => (
                <div key={u.id} className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 group hover:bg-white dark:hover:bg-slate-800 hover:border-slate-200 dark:hover:border-slate-700 transition-all">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center",
                      u.role === 'admin' ? "bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400" : "bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                    )}>
                      {u.role === 'admin' ? <ShieldCheck className="w-5 h-5" /> : <UserIcon className="w-5 h-5" />}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{u.name}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">@{u.username}</span>
                        <span className={cn(
                          "text-[9px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-tighter",
                          u.role === 'admin' ? "bg-brand-100 dark:bg-brand-900/50 text-brand-700 dark:text-brand-300" : "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400"
                        )}>
                          {u.role === 'admin' ? 'Administrador' : 'Invitado'}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-1">
                    {!isGuest && (
                      <>
                        <button 
                          onClick={() => { setEditingUser(u); setShowAddUser(false); setUserStatus({ type: 'idle', message: '' }); }}
                          className="p-2 text-slate-300 dark:text-slate-600 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/20 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                          title="Editar usuario"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        {u.username !== 'admin' && (
                          <button 
                            onClick={() => u.id && handleDeleteUser(u.id, u.username)}
                            className="p-2 text-slate-300 dark:text-slate-600 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
