import { Link, NavLink, useNavigate } from 'react-router-dom';
import ThemeToggle from './ThemeToggle';
import { useAuth } from '../context/AuthContext';

const links = [
  { to: '/map', label: 'Safety Map' },
  { to: '/route', label: 'Safe Route' },
  { to: '/report', label: 'Report' },
  { to: '/incidents', label: 'Incidents' },
];
export default function Navbar() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  return (
    <header style={{ position: 'sticky', top: 0, zIndex: 50, backdropFilter: 'blur(14px)',
      background: 'color-mix(in srgb, var(--bg) 78%, transparent)', borderBottom: '1px solid var(--border)' }}>
      <div className="container" style={{ display: 'flex', alignItems: 'center', gap: 18, height: 66 }}>
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 19 }}>
          <img src="/shield.svg" width="26" height="26" alt="" /> SurakshaMitra
        </Link>
        <nav style={{ display: 'flex', gap: 6, marginLeft: 8 }} className="nav-links">
          {links.map(l => (
            <NavLink key={l.to} to={l.to} style={({ isActive }) => ({
              padding: '8px 12px', borderRadius: 10, fontSize: 14.5, fontWeight: 500,
              color: isActive ? 'var(--text)' : 'var(--muted)',
              background: isActive ? 'var(--surface)' : 'transparent' })}>{l.label}</NavLink>
          ))}
          {user && (user.role === 'admin' || user.role === 'moderator') &&
            <NavLink to="/admin" style={{ padding: '8px 12px', borderRadius: 10, fontSize: 14.5, color: 'var(--muted)' }}>Admin</NavLink>}
        </nav>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center' }}>
          <ThemeToggle />
          {user ? (
            <>
              <Link to="/profile" className="btn btn-ghost" style={{ padding: '9px 14px' }}>{user.name.split(' ')[0]}</Link>
              <button className="btn btn-ghost" style={{ padding: '9px 14px' }} onClick={() => { logout(); nav('/'); }}>Sign out</button>
            </>
          ) : <Link to="/auth" className="btn btn-primary" style={{ padding: '9px 16px' }}>Sign in</Link>}
        </div>
      </div>
      <style>{`@media(max-width:760px){.nav-links{display:none!important}}`}</style>
    </header>
  );
}
