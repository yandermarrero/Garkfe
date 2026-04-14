import React, { createContext, useContext, useState, useEffect } from 'react';
import { db, User } from './db';
import { hashPassword } from './auth';

interface AuthContextType {
  user: User | null;
  login: (user: User) => void;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      try {
        // Ensure admin user exists and has the correct password
        let adminUser = await db.users.where('username').equals('admin').first();
        const defaultPasswordHash = await hashPassword('admin123');
        
        if (!adminUser) {
          await db.users.add({
            username: 'admin',
            password: defaultPasswordHash,
            name: 'Administrador',
            role: 'admin'
          });
          console.log('Initial admin user seeded with password: admin123');
        } else {
          // Force reset to admin123 to unblock the user
          // We do this to ensure the user can always access the system with the default credentials if they are stuck
          await db.users.update(adminUser.id!, { password: defaultPasswordHash });
          console.log('Admin password has been reset to admin123 for security/recovery');
        }

        // Check for saved session in localStorage
        const savedUser = localStorage.getItem('auth_user');
        if (savedUser) {
          const parsedUser = JSON.parse(savedUser);
          // Verify user still exists in DB
          const dbUser = await db.users.where('username').equals(parsedUser.username).first();
          if (dbUser) {
            setUser(dbUser);
          } else {
            localStorage.removeItem('auth_user');
          }
        }
      } catch (error) {
        console.error('Error initializing auth:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, []);

  const login = (userData: User) => {
    setUser(userData);
    localStorage.setItem('auth_user', JSON.stringify({
      username: userData.username,
      name: userData.name,
      role: userData.role
    }));
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('auth_user');
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
