import { useNavigate, useLocation } from 'react-router-dom';
export default function SOSFab() {
  const nav = useNavigate();
  const loc = useLocation();
  if (loc.pathname === '/sos' || loc.pathname.startsWith('/track')) return null;
  return (
    <button onClick={() => nav('/sos')} aria-label="Open emergency SOS"
      style={{ position: 'fixed', right: 22, bottom: 22, zIndex: 60, width: 68, height: 68, borderRadius: '50%',
        border: 'none', color: '#fff', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15,
        background: 'radial-gradient(circle at 30% 30%, #ff6a6a, var(--sos))',
        boxShadow: '0 0 0 6px var(--sos-glow), 0 12px 28px -8px var(--sos)' }}>
      <span style={{ position: 'absolute', inset: -4, borderRadius: '50%', border: '2px solid var(--sos)', animation: 'pulseRing 2.2s var(--ease) infinite' }} />
      SOS
    </button>
  );
}
