import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserProfile } from './firebase';

interface StoreContextType {
  activeStoreId: number | '';
  setActiveStoreId: (id: number | '') => void;
  userProfile: UserProfile | null;
  setUserProfile: (profile: UserProfile | null) => void;
}

const StoreContext = createContext<StoreContextType>({ 
  activeStoreId: '', 
  setActiveStoreId: () => {},
  userProfile: null,
  setUserProfile: () => {}
});

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [activeStoreId, setActiveStoreId] = useState<number | ''>(() => {
    const saved = localStorage.getItem('activeStoreId');
    return saved ? parseInt(saved, 10) : '';
  });
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    if (activeStoreId) {
      localStorage.setItem('activeStoreId', activeStoreId.toString());
    } else {
      localStorage.removeItem('activeStoreId');
    }
  }, [activeStoreId]);

  return (
    <StoreContext.Provider value={{ activeStoreId, setActiveStoreId, userProfile, setUserProfile }}>
      {children}
    </StoreContext.Provider>
  );
}

export const useStoreContext = () => useContext(StoreContext);
