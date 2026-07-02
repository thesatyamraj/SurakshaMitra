import { useEffect, useState } from 'react';
import api from '../lib/api';
import { SLOT_LABEL } from '../lib/sti';
import { useToast } from '../components/Toast';

const TYPES = ['', 'harassment', 'stalking', 'theft', 'assault', 'unsafe_lighting', 'unsafe_crowd', 'infrastructure', 'suspicious_person', 'other'];
const SEVERITIES = ['', 'low', 'medium', 'high', 'critical'];
const API_ORIGIN = (import.meta.env.VITE_API_URL || '/api').replace(/\/api\/?$/, '');

function label(value) {
  return value ? value.replace(/_/g, ' ') : 'All';
}

function statusColor(status) {
  if (status === 'verified') return 'var(--safe)';
  if (status === 'escalated') return 'var(--sos)';
  if (status === 'rejected') return 'var(--muted)';
  return 'var(--moderate)';
}

function photoUrl(photo) {
  if (!photo?.url) return '';
  if (/^https?:\/\//i.test(photo.url)) return photo.url;
  return `${API_ORIGIN}${photo.url}`;
}

export default function Incidents() {
  const [incidents, setIncidents] = useState([]);
  const [filters, setFilters] = useState({ type: '', severity: '' });
  const [loading, setLoading] = useState(true);
  const [viewer, setViewer] = useState(null);
  const { push } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ status: 'visible', limit: '100' });
      if (filters.type) params.set('type', filters.type);
      if (filters.severity) params.set('severity', filters.severity);
      const { data } = await api.get(`/incidents?${params}`);
      setIncidents(data.data || []);
    } catch (e) {
      push(e.response?.data?.error || 'Could not load reported incidents.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [filters.type, filters.severity]);

  return (
    <div className="container" style={{ padding: '48px 24px 90px' }}>
      <div className="eyebrow">Community reports</div>
      <h1 style={{ fontSize: 32, margin: '8px 0 6px' }}>Reported incidents</h1>
      <p style={{ color: 'var(--muted)', marginTop: 0, maxWidth: 650 }}>
        Recent community-submitted incidents. Pending reports are shown so people can stay alert while moderators review them.
      </p>

      <div className="card" style={{ padding: 16, display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 12, margin: '18px 0 20px', alignItems: 'end' }}>
        <div>
          <label>Type</label>
          <select value={filters.type} onChange={e => setFilters(f => ({ ...f, type: e.target.value }))}>
            {TYPES.map(t => <option key={t || 'all'} value={t}>{label(t)}</option>)}
          </select>
        </div>
        <div>
          <label>Severity</label>
          <select value={filters.severity} onChange={e => setFilters(f => ({ ...f, severity: e.target.value }))}>
            {SEVERITIES.map(s => <option key={s || 'all'} value={s}>{label(s)}</option>)}
          </select>
        </div>
        <button className="btn btn-ghost" onClick={load}>Refresh</button>
      </div>

      <div className="grid incident-grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(310px,1fr))', alignItems: 'stretch' }}>
        {incidents.map(i => (
          <article key={i._id} className="card" style={{ padding: 18, display: 'grid', gridTemplateRows: '154px auto 1fr auto', gap: 12, minHeight: 360 }}>
            <div style={{ height: 154, borderRadius: 10, overflow: 'hidden', background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'grid', placeItems: 'center' }}>
              {i.photos?.[0]?.url ? (
                <button onClick={() => setViewer({ url: photoUrl(i.photos[0]), alt: `${label(i.type)} evidence` })} style={{ width: '100%', height: '100%', padding: 0, border: 'none', background: 'transparent' }} aria-label="Open full image">
                  <img src={photoUrl(i.photos[0])} alt={`${label(i.type)} evidence`} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                </button>
              ) : (
                <span className="mono" style={{ color: 'var(--muted)', fontSize: 12, textTransform: 'uppercase' }}>No image</span>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start' }}>
              <div>
                <h2 style={{ fontSize: 19, textTransform: 'capitalize' }}>{label(i.type)}</h2>
                <div style={{ color: 'var(--muted)', fontSize: 13 }}>
                  {i.locationId?.name || 'Unknown location'}{i.locationId?.area ? `, ${i.locationId.area}` : ''}
                </div>
              </div>
              <span className="mono" style={{ color: statusColor(i.status), fontSize: 12, textTransform: 'uppercase' }}>{i.status}</span>
            </div>
            <p style={{ margin: 0, color: 'var(--text)', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{i.description}</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', color: 'var(--muted)', fontSize: 12 }}>
              <span className="chip unrated">{i.severity}</span>
              <span className="chip unrated">{SLOT_LABEL[i.timeSlot] || i.timeSlot}</span>
              <span>{new Date(i.occurredAt || i.createdAt).toLocaleString()}</span>
            </div>
          </article>
        ))}
      </div>

      {!loading && incidents.length === 0 && (
        <div className="card" style={{ padding: 24, color: 'var(--muted)', textAlign: 'center' }}>
          No incident reports match these filters.
        </div>
      )}
      {loading && <div style={{ color: 'var(--muted)' }}>Loading reports…</div>}
      {viewer && (
        <div onClick={() => setViewer(null)} style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,.78)', display: 'grid', placeItems: 'center', padding: 22 }}>
          <button onClick={() => setViewer(null)} className="btn btn-ghost" style={{ position: 'fixed', top: 18, right: 18 }}>Close</button>
          <img onClick={e => e.stopPropagation()} src={viewer.url} alt={viewer.alt} style={{ maxWidth: '94vw', maxHeight: '88vh', objectFit: 'contain', borderRadius: 10, boxShadow: 'var(--shadow)' }} />
        </div>
      )}
      <style>{`@media(max-width:720px){.incident-grid{grid-template-columns:1fr!important}}`}</style>
    </div>
  );
}
