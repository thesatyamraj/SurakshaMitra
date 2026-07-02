import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../lib/api';
import { useToast } from '../components/Toast';

const TYPES = ['harassment', 'stalking', 'theft', 'assault', 'unsafe_lighting', 'unsafe_crowd', 'infrastructure', 'suspicious_person', 'other'];
const SEVERITIES = ['low', 'medium', 'high', 'critical'];
const STATUSES = ['pending', 'verified', 'rejected', 'escalated'];
const SLOTS = ['morning', 'afternoon', 'evening', 'night'];
const API_ORIGIN = (import.meta.env.VITE_API_URL || '/api').replace(/\/api\/?$/, '');

function label(value) {
  return value ? value.replace(/_/g, ' ') : '';
}

function makeDraft(incident) {
  return {
    type: incident.type || 'other',
    severity: incident.severity || 'medium',
    status: incident.status || 'pending',
    timeSlot: incident.timeSlot || 'evening',
    description: incident.description || '',
    moderatorNote: incident.moderatorNote || '',
  };
}

function photoUrl(photo) {
  if (!photo?.url) return '';
  if (/^https?:\/\//i.test(photo.url)) return photo.url;
  return `${API_ORIGIN}${photo.url}`;
}

export default function Admin() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const { push } = useToast();
  const [stats, setStats] = useState(null);
  const [incidents, setIncidents] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [filter, setFilter] = useState('all');
  const [busyId, setBusyId] = useState('');
  const [viewer, setViewer] = useState(null);

  const canModerate = user && ['admin', 'moderator'].includes(user.role);

  const loadStats = async () => {
    const { data } = await api.get('/admin/stats');
    setStats(data.data || data);
  };

  const loadIncidents = async () => {
    const params = new URLSearchParams({ status: filter, city: 'all', limit: '100' });
    const { data } = await api.get(`/incidents?${params}`);
    const rows = data.data || [];
    setIncidents(rows);
    setDrafts(Object.fromEntries(rows.map(i => [i._id, makeDraft(i)])));
  };

  useEffect(() => {
    if (!loading && !canModerate) nav('/');
  }, [loading, canModerate, nav]);

  useEffect(() => {
    if (!canModerate) return;
    loadStats().catch(() => push('Could not load admin stats.', 'error'));
  }, [canModerate]);

  useEffect(() => {
    if (!canModerate) return;
    loadIncidents().catch(() => push('Could not load incident reports.', 'error'));
  }, [canModerate, filter]);

  const cards = useMemo(() => {
    if (!stats) return [];
    return [
      ['Locations', stats.totalLocations],
      ['Ratings', stats.totalRatings],
      ['Users', stats.totalUsers],
      ['Pending locations', stats.pendingLocations],
      ['Flagged raters', stats.flaggedUsers],
      ['Reports', incidents.length],
    ];
  }, [stats, incidents.length]);

  const setDraft = (id, key, value) => {
    setDrafts(d => ({ ...d, [id]: { ...d[id], [key]: value } }));
  };

  const saveIncident = async (id) => {
    setBusyId(id);
    try {
      const { data } = await api.patch(`/incidents/${id}`, drafts[id]);
      const updated = data.data;
      setIncidents(rows => rows.map(r => r._id === id ? updated : r));
      setDrafts(d => ({ ...d, [id]: makeDraft(updated) }));
      push('Incident updated.', 'success');
    } catch (e) {
      push(e.response?.data?.error || 'Could not update incident.', 'error');
    } finally {
      setBusyId('');
    }
  };

  const deleteIncident = async (id) => {
    if (!window.confirm('Delete this incident report?')) return;
    setBusyId(id);
    try {
      await api.delete(`/incidents/${id}`);
      setIncidents(rows => rows.filter(r => r._id !== id));
      setDrafts(d => {
        const next = { ...d };
        delete next[id];
        return next;
      });
      push('Incident deleted.', 'success');
    } catch (e) {
      push(e.response?.data?.error || 'Could not delete incident.', 'error');
    } finally {
      setBusyId('');
    }
  };

  if (!canModerate) return null;

  return (
    <div className="container" style={{ padding: '48px 24px 90px' }}>
      <div className="eyebrow">Moderator console</div>
      <h1 style={{ fontSize: 32, margin: '8px 0 20px' }}>Dashboard</h1>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))' }}>
        {cards.map(([k, v]) => (
          <div key={k} className="card" style={{ padding: 18 }}>
            <div className="mono" style={{ fontSize: 30, color: 'var(--primary-2)' }}>{v ?? '-'}</div>
            <div style={{ color: 'var(--muted)', fontSize: 13 }}>{k}</div>
          </div>
        ))}
      </div>

      <section style={{ marginTop: 34 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'end', flexWrap: 'wrap', marginBottom: 12 }}>
          <div>
            <h2 style={{ fontSize: 24 }}>Incident reports</h2>
            <div style={{ color: 'var(--muted)', fontSize: 13 }}>Review, update, verify, escalate, reject, or delete submitted reports.</div>
          </div>
          <div style={{ width: 190 }}>
            <label>Status filter</label>
            <select value={filter} onChange={e => setFilter(e.target.value)}>
              <option value="all">All</option>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          {incidents.map(i => {
            const draft = drafts[i._id] || makeDraft(i);
            return (
              <div key={i._id} className="card" style={{ padding: 16, display: 'grid', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <strong>{i.locationId?.name || 'Unknown location'}</strong>
                    <div style={{ color: 'var(--muted)', fontSize: 13 }}>
                      {i.locationId?.area || 'No area'} · {new Date(i.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <span className="mono" style={{ color: i.status === 'verified' ? 'var(--safe)' : i.status === 'escalated' ? 'var(--sos)' : 'var(--moderate)', textTransform: 'uppercase', fontSize: 12 }}>
                    {i.status}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '190px 1fr', gap: 14 }} className="admin-report-shell">
                  <div style={{ height: 150, borderRadius: 10, overflow: 'hidden', background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'grid', placeItems: 'center' }}>
                    {i.photos?.[0]?.url ? (
                      <button onClick={() => setViewer({ url: photoUrl(i.photos[0]), alt: `${label(i.type)} evidence` })} style={{ width: '100%', height: '100%', padding: 0, border: 'none', background: 'transparent' }} aria-label="Open full image">
                        <img src={photoUrl(i.photos[0])} alt={`${label(i.type)} evidence`} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      </button>
                    ) : (
                      <span className="mono" style={{ color: 'var(--muted)', fontSize: 12, textTransform: 'uppercase' }}>No image</span>
                    )}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(120px,1fr))', gap: 10 }} className="admin-report-grid">
                    <div><label>Type</label><select value={draft.type} onChange={e => setDraft(i._id, 'type', e.target.value)}>{TYPES.map(t => <option key={t} value={t}>{label(t)}</option>)}</select></div>
                    <div><label>Severity</label><select value={draft.severity} onChange={e => setDraft(i._id, 'severity', e.target.value)}>{SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
                    <div><label>Time</label><select value={draft.timeSlot} onChange={e => setDraft(i._id, 'timeSlot', e.target.value)}>{SLOTS.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
                    <div><label>Status</label><select value={draft.status} onChange={e => setDraft(i._id, 'status', e.target.value)}>{STATUSES.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
                  </div>
                </div>

                <div><label>Description</label><textarea rows={3} value={draft.description} onChange={e => setDraft(i._id, 'description', e.target.value)} /></div>
                <div><label>Moderator note</label><input value={draft.moderatorNote} onChange={e => setDraft(i._id, 'moderatorNote', e.target.value)} placeholder="Optional internal note" /></div>

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  <button className="btn btn-ghost" onClick={() => saveIncident(i._id)} disabled={busyId === i._id}>{busyId === i._id ? 'Saving...' : 'Update'}</button>
                  <button className="btn btn-ghost" style={{ color: 'var(--risky)' }} onClick={() => deleteIncident(i._id)} disabled={busyId === i._id}>Delete</button>
                </div>
              </div>
            );
          })}
          {!incidents.length && <div className="card" style={{ padding: 22, color: 'var(--muted)' }}>No reports match this filter.</div>}
        </div>
      </section>

      <section style={{ marginTop: 34 }}>
        <h2 style={{ fontSize: 24, marginBottom: 12 }}>Recent ratings</h2>
        <div className="card" style={{ padding: 8 }}>
          {(stats?.recentRatings || []).map((r, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '11px 14px', borderBottom: i < (stats.recentRatings.length - 1) ? '1px solid var(--border)' : 'none' }}>
              <span>{r.locationId?.name || 'Unknown'} <span style={{ color: 'var(--muted)', fontSize: 13 }}>· {r.timeSlot}</span></span>
              <span className="mono" style={{ color: 'var(--primary-2)' }}>{r.rawSTI != null ? Number(r.rawSTI).toFixed(1) : '-'}</span>
            </div>
          ))}
          {!stats?.recentRatings?.length && <div style={{ padding: 20, color: 'var(--muted)' }}>No ratings yet. Run the seed script.</div>}
        </div>
      </section>

      {viewer && (
        <div onClick={() => setViewer(null)} style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,.78)', display: 'grid', placeItems: 'center', padding: 22 }}>
          <button onClick={() => setViewer(null)} className="btn btn-ghost" style={{ position: 'fixed', top: 18, right: 18 }}>Close</button>
          <img onClick={e => e.stopPropagation()} src={viewer.url} alt={viewer.alt} style={{ maxWidth: '94vw', maxHeight: '88vh', objectFit: 'contain', borderRadius: 10, boxShadow: 'var(--shadow)' }} />
        </div>
      )}

      <style>{`@media(max-width:900px){.admin-report-shell{grid-template-columns:1fr!important}.admin-report-grid{grid-template-columns:1fr 1fr!important}}@media(max-width:560px){.admin-report-grid{grid-template-columns:1fr!important}}`}</style>
    </div>
  );
}
