import { useEffect, useState } from 'react';
import api from '../lib/api';
import { SLOTS, SLOT_LABEL, currentSlot } from '../lib/sti';
import { useToast } from '../components/Toast';

const TYPES = ['harassment', 'stalking', 'theft', 'assault', 'unsafe_lighting', 'unsafe_crowd', 'infrastructure', 'suspicious_person', 'other'];
const SEV = ['low', 'medium', 'high', 'critical'];

export default function Report() {
  const [locations, setLocations] = useState([]);
  const [form, setForm] = useState({ locationId: '', type: 'harassment', severity: 'medium', description: '', timeSlot: currentSlot() });
  const [photos, setPhotos] = useState([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const { push } = useToast();

  useEffect(() => { api.get('/locations?limit=100').then(({ data }) => setLocations(data.data || [])).catch(() => {}); }, []);
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.locationId) return push('Pick the location this happened at.', 'error');
    setBusy(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      photos.forEach(p => fd.append('photos', p));
      await api.post('/incidents', fd);
      setDone(true); push('Report filed. Thank you for keeping others informed.', 'success');
    } catch (err) { push(err.response?.data?.error || 'Could not file report.', 'error'); }
    finally { setBusy(false); }
  };

  if (done) return (
    <div className="container" style={{ maxWidth: 520, padding: '80px 24px', textAlign: 'center' }}>
      <h1>Report received</h1>
      <p style={{ color: 'var(--muted)' }}>High and critical reports trigger an instant area alert. Moderators review reports before they appear publicly. Your identity stays private.</p>
      <button className="btn btn-primary" onClick={() => { setDone(false); setForm(f => ({ ...f, description: '' })); setPhotos([]); }}>File another</button>
    </div>
  );

  return (
    <div className="container" style={{ maxWidth: 560, padding: '48px 24px 90px' }}>
      <div className="eyebrow">Community intelligence</div>
      <h1 style={{ fontSize: 32, margin: '8px 0 6px' }}>Report an incident</h1>
      <p style={{ color: 'var(--muted)', marginTop: 0 }}>Reports are anonymous by default and feed the safety map. Photos are optional.</p>
      <form onSubmit={submit} className="card" style={{ padding: 26, display: 'grid', gap: 16, marginTop: 16 }}>
        <div><label>Location</label>
          <select value={form.locationId} onChange={set('locationId')} required>
            <option value="">Select a place…</option>
            {locations.map(l => <option key={l._id} value={l._id}>{l.name} — {l.area}</option>)}
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><label>Type</label><select value={form.type} onChange={set('type')}>{TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}</select></div>
          <div><label>Severity</label><select value={form.severity} onChange={set('severity')}>{SEV.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
        </div>
        <div><label>When</label><select value={form.timeSlot} onChange={set('timeSlot')}>{SLOTS.map(s => <option key={s} value={s}>{SLOT_LABEL[s]}</option>)}</select></div>
        <div><label>What happened</label><textarea rows={4} value={form.description} onChange={set('description')} required placeholder="Describe what you saw or experienced. Be factual." /></div>
        <div><label>Photos (optional, up to 3)</label><input type="file" accept="image/*" multiple onChange={e => setPhotos([...e.target.files].slice(0, 3))} /></div>
        <button className="btn btn-primary btn-lg" disabled={busy}>{busy ? 'Filing…' : 'File report'}</button>
      </form>
    </div>
  );
}
