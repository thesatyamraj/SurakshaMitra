import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../lib/api';
import { useToast } from '../components/Toast';

export default function Profile() {
  const { user, loading, refreshUser } = useAuth();
  const nav = useNavigate();
  const { push } = useToast();
  const [form, setForm] = useState({ name: '', phone: '', city: '', bloodGroup: '', isVolunteer: false, volunteerRadius: 2, sosPIN: '' });
  const [contacts, setContacts] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!loading && !user) nav('/auth'); }, [loading, user]);
  useEffect(() => { if (user) {
    setForm(f => ({ ...f, name: user.name || '', phone: user.phone || '', city: user.city || '', bloodGroup: user.bloodGroup || '', isVolunteer: !!user.isVolunteer, volunteerRadius: user.volunteerRadius || 2 }));
    setContacts(user.emergencyContacts?.length ? user.emergencyContacts : [{ name: '', phone: '', email: '' }]);
  } }, [user]);

  const isEmail = (value) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim());

  const save = async () => {
    setBusy(true);
    try {
      const emergencyContacts = contacts
        .map(c => ({ name: c.name.trim(), phone: c.phone.trim(), email: (c.email || '').trim() }))
        .filter(c => c.name && c.phone);
      const invalid = emergencyContacts.find(c => c.email && !isEmail(c.email));
      if (invalid) {
        push(`Fix the email for ${invalid.name}. Use a complete address like name@example.com.`, 'error');
        return;
      }
      const payload = { ...form, emergencyContacts };
      if (!payload.sosPIN) delete payload.sosPIN;
      // share geolocation so volunteer matching works
      if (form.isVolunteer && navigator.geolocation) {
        await new Promise(res => navigator.geolocation.getCurrentPosition(
          p => { payload.location = { coordinates: [p.coords.longitude, p.coords.latitude] }; res(); }, () => res(), { timeout: 5000 }));
      }
      await api.patch('/auth/me', payload);
      await refreshUser(); push('Profile saved.', 'success');
    } catch (e) { push(e.response?.data?.error || 'Could not save.', 'error'); }
    finally { setBusy(false); }
  };

  if (!user) return null;
  const setC = (i, k, v) => setContacts(cs => cs.map((c, j) => j === i ? { ...c, [k]: v } : c));

  return (
    <div className="container" style={{ maxWidth: 620, padding: '48px 24px 90px' }}>
      <h1 style={{ fontSize: 30 }}>Your safety profile</h1>
      <p style={{ color: 'var(--muted)' }}>Emergency contacts and your SOS PIN power the one-tap SOS. Your PIN is stored hashed and never shown.</p>

      <div className="card" style={{ padding: 24, display: 'grid', gap: 14, marginTop: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><label>Name</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
          <div><label>Phone</label><input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><label>City</label><input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} /></div>
          <div><label>SOS PIN (to stop an SOS)</label><input type="password" value={form.sosPIN} onChange={e => setForm(f => ({ ...f, sosPIN: e.target.value }))} placeholder="Set / change PIN" /></div>
        </div>
      </div>

      <h3 style={{ marginTop: 28 }}>Emergency contacts</h3>
      <div className="card" style={{ padding: 20, display: 'grid', gap: 12 }}>
        {contacts.map((c, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 8 }}>
            <input placeholder="Name" value={c.name} onChange={e => setC(i, 'name', e.target.value)} />
            <input placeholder="Phone" value={c.phone} onChange={e => setC(i, 'phone', e.target.value)} />
            <input placeholder="Email" value={c.email || ''} onChange={e => setC(i, 'email', e.target.value)} />
            <button className="btn btn-ghost" onClick={() => setContacts(cs => cs.filter((_, j) => j !== i))}>×</button>
          </div>
        ))}
        {contacts.length < 5 && <button className="btn btn-ghost" onClick={() => setContacts(cs => [...cs, { name: '', phone: '', email: '' }])}>+ Add contact</button>}
      </div>

      <h3 style={{ marginTop: 28 }}>Volunteer</h3>
      <div className="card" style={{ padding: 20, display: 'flex', alignItems: 'center', gap: 14 }}>
        <input type="checkbox" style={{ width: 18 }} checked={form.isVolunteer} onChange={e => setForm(f => ({ ...f, isVolunteer: e.target.checked }))} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600 }}>Get alerts when someone nearby triggers an SOS</div>
          <div style={{ color: 'var(--muted)', fontSize: 13 }}>We'll use your location only to match nearby emergencies within {form.volunteerRadius} km.</div>
        </div>
      </div>

      <button className="btn btn-primary btn-lg" style={{ marginTop: 24 }} onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</button>
    </div>
  );
}
