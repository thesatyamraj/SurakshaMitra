import { useState } from 'react';
import api from '../lib/api';
import { SLOT_LABEL } from '../lib/sti';

const FACTORS = [
  { key: 'lighting', label: 'Street lighting', lo: 'Dark', hi: 'Well-lit' },
  { key: 'crowdBehavior', label: 'Crowd & footfall', lo: 'Isolated', hi: 'Busy, comfortable' },
  { key: 'policeVisibility', label: 'Police visibility', lo: 'None', hi: 'Frequent patrols' },
  { key: 'incidentWeight', label: 'Incident risk', lo: 'None seen', hi: 'High' },
];

export default function RateModal({ location, slot, onClose, onDone }) {
  const [vals, setVals] = useState({ lighting: 5, crowdBehavior: 5, policeVisibility: 5, incidentWeight: 3 });
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    setBusy(true); setErr('');
    try {
      await api.post('/ratings', { locationId: location._id || location.id, timeSlot: slot, ...vals, comment });
      onDone();
    } catch (e) {
      setErr(e.response?.data?.error || 'Could not submit rating.');
    } finally { setBusy(false); }
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,.55)', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} className="card rise" style={{ width: 'min(94vw,460px)', maxHeight: '90vh', overflowY: 'auto', padding: 26, boxShadow: 'var(--shadow)' }}>
        <div className="eyebrow">Rate · {SLOT_LABEL[slot]}</div>
        <h2 style={{ fontSize: 22, margin: '6px 0 4px' }}>{location.name}</h2>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 0 }}>Anonymous — no account needed. Rate what you experienced right now.</p>
        {FACTORS.map(f => (
          <div key={f.key} style={{ margin: '18px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <label>{f.label}</label>
              <span className="mono" style={{ color: 'var(--primary-2)' }}>{vals[f.key]}</span>
            </div>
            <input type="range" min={f.key === 'incidentWeight' ? 0 : 1} max="10" value={vals[f.key]}
              onChange={e => setVals(v => ({ ...v, [f.key]: Number(e.target.value) }))}
              style={{ accentColor: 'var(--primary)' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)' }}><span>{f.lo}</span><span>{f.hi}</span></div>
          </div>
        ))}
        <textarea rows={2} placeholder="Optional note (e.g. 'auto stand well-lit but few people after 10pm')" value={comment} onChange={e => setComment(e.target.value)} />
        {err && <div style={{ color: 'var(--risky)', fontSize: 13, marginTop: 10 }}>{err}</div>}
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={submit} disabled={busy}>{busy ? 'Submitting…' : 'Submit rating'}</button>
        </div>
      </div>
    </div>
  );
}
