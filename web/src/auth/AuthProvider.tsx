'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { User, onAuthStateChanged, signInWithPopup, signOut, GoogleAuthProvider } from 'firebase/auth';
import { getFirebaseAuth } from './firebase';

const ADMIN_USER_IDS = ['zXOyHmGl7HStyAqEdLsgXLA5inS2'];

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: User | null;
  isAdmin: boolean;
}

interface AuthContextType {
  authState: AuthState;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  getToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    isLoading: true,
    user: null,
    isAdmin: false,
  });

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) {
      setAuthState({ isAuthenticated: false, isLoading: false, user: null, isAdmin: false });
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setAuthState({
        isAuthenticated: !!user,
        isLoading: false,
        user,
        isAdmin: !!user && ADMIN_USER_IDS.includes(user.uid),
      });
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const auth = getFirebaseAuth();
    if (!auth) throw new Error('Firebase not initialized');
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  }, []);

  const logout = useCallback(async () => {
    const auth = getFirebaseAuth();
    if (!auth) return;
    await signOut(auth);
  }, []);

  const getToken = useCallback(async (): Promise<string | null> => {
    const auth = getFirebaseAuth();
    if (!auth?.currentUser) return null;
    return auth.currentUser.getIdToken();
  }, []);

  return (
    <AuthContext.Provider value={{ authState, signInWithGoogle, logout, getToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
