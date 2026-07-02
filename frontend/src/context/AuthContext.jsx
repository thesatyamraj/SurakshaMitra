import { createContext, useContext, useEffect, useState } from 'react';
import api, { store } from '../lib/api';
const AuthCtx = createContext();
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { (async () => {
    if (store.access) { try { const { data } = await api.get('/auth/me'); setUser(data.user); } catch {} }
    setLoading(false);
  })(); }, []);
  const login = async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    store.setTokens(data); setUser(data.user); return data.user;
  };
  const register = async (payload) => {
    const { data } = await api.post('/auth/signup', { ...payload, anonToken: store.anon });
    store.setTokens(data); setUser(data.user); return data.user;
  };
  const logout = async () => { try { await api.post('/auth/logout'); } catch {} store.clear(); setUser(null); };
  const refreshUser = async () => { try { const { data } = await api.get('/auth/me'); setUser(data.user); } catch {} };
  return <AuthCtx.Provider value={{ user, loading, login, register, logout, refreshUser, setUser }}>{children}</AuthCtx.Provider>;
}
export const useAuth = () => useContext(AuthCtx);
