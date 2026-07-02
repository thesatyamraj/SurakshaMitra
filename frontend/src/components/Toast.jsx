import { createContext, useContext, useState, useCallback } from 'react';
const ToastCtx = createContext();
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((msg, type = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4200);
  }, []);
  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div style={{ position: 'fixed', bottom: 22, left: '50%', transform: 'translateX(-50%)', zIndex: 90, display: 'flex', flexDirection: 'column', gap: 8, width: 'min(92vw,420px)' }}>
        {toasts.map(t => (
          <div key={t.id} className="rise card" style={{ padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'center',
            borderLeft: `3px solid ${t.type === 'error' ? 'var(--risky)' : t.type === 'success' ? 'var(--safe)' : 'var(--primary)'}`, boxShadow: 'var(--shadow)' }}>
            <span style={{ fontSize: 14 }}>{t.msg}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);
