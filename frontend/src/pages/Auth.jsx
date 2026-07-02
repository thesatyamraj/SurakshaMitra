import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';

export default function Auth() {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const { login, register } = useAuth();
  const { push } = useToast();
  const nav = useNavigate();
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      if (mode === 'login') await login(form.email, form.password);
      else await register(form);
      push('Welcome back.', 'success'); nav('/map');
    } catch (err) { push(err.response?.data?.error || 'Authentication failed.', 'error'); }
    finally { setBusy(false); }
  };

  return (
    <div className="container" style={{ maxWidth: 440, padding: '64px 24px' }}>
      <div className="card rise" style={{ padding: 34 }}>
        <div className="eyebrow">{mode === 'login' ? 'Welcome back' : 'Join SurakshaMitra'}</div>
        <h1 style={{ fontSize: 28, margin: '8px 0 20px' }}>{mode === 'login' ? 'Sign in' : 'Create your account'}</h1>
        <form onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
          {mode === 'register' && <div><label>Name</label><input value={form.name} onChange={set('name')} required /></div>}
          <div><label>Email</label><input type="email" value={form.email} onChange={set('email')} required /></div>
          <div><label>Password</label><input type="password" value={form.password} onChange={set('password')} minLength={6} required /></div>
          <button className="btn btn-primary btn-lg" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
        </form>
        <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 18, textAlign: 'center' }}>
          {mode === 'login' ? "No account? " : 'Already have one? '}
          <button onClick={() => setMode(m => m === 'login' ? 'register' : 'login')} style={{ background: 'none', border: 'none', color: 'var(--primary-2)', fontWeight: 600 }}>
            {mode === 'login' ? 'Create one' : 'Sign in'}
          </button>
        </p>
        <p style={{ color: 'var(--muted)', fontSize: 12.5, marginTop: 8, textAlign: 'center' }}>You can rate places and view the map without an account — sign in for SOS contacts & alerts.</p>
      </div>
    </div>
  );
}
