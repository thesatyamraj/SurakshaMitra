import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.heat';
import api from '../lib/api';
import { getSocket } from '../lib/socket';
import STIRing from '../components/STIRing';
import RateModal from '../components/RateModal';
import { CAT_COLOR, SLOTS, SLOT_LABEL, currentSlot } from '../lib/sti';
import { useToast } from '../components/Toast';

const CENTER = [
  Number(import.meta.env.VITE_MAP_CENTER_LAT) || 12.9716,
  Number(import.meta.env.VITE_MAP_CENTER_LNG) || 77.5946,
];

function HeatLayer({ points, show }) {
  const map = useMap();
  const layerRef = useRef(null);
  useEffect(() => {
    if (layerRef.current) { map.removeLayer(layerRef.current); layerRef.current = null; }
    if (show && points.length) {
      // low STI = hot: weight by (10 - sti)
      const data = points.filter(p => p.sti != null).map(p => [p.lat, p.lng, (10 - p.sti) / 10]);
      layerRef.current = L.heatLayer(data, { radius: 34, blur: 24, maxZoom: 15,
        gradient: { 0.2: '#34D399', 0.5: '#FBBF24', 0.8: '#FB7185', 1: '#e11d48' } }).addTo(map);
    }
    return () => { if (layerRef.current) { map.removeLayer(layerRef.current); layerRef.current = null; } };
  }, [show, points, map]);
  return null;
}

export default function MapPage() {
  const [slot, setSlot] = useState(currentSlot());
  const [feats, setFeats] = useState([]);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [showHeat, setShowHeat] = useState(true);
  const [rateFor, setRateFor] = useState(null);
  const [q, setQ] = useState('');
  const { push } = useToast();

  const load = async (s = slot) => {
    try {
      const { data } = await api.get(`/locations/heatmap?slot=${s}`);
      setFeats((data.features || []).map(f => ({
        id: f.properties.id, name: f.properties.name, area: f.properties.area, type: f.properties.type,
        sti: f.properties.sti, category: f.properties.category, ratingCount: f.properties.ratingCount,
        lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1],
      })));
    } catch { push('Could not load map data — is the API running?', 'error'); }
  };

  useEffect(() => { load(slot); }, [slot]);
  useEffect(() => {
    const s = getSocket();
    const onUpdate = () => load();
    s.on('heatmap-update', onUpdate);
    const poll = setInterval(() => load(), 60000); // 60s fallback
    return () => { s.off('heatmap-update', onUpdate); clearInterval(poll); };
  }, [slot]);

  const openDetail = async (f) => {
    setSelected(f.id); setDetail(null);
    try { const { data } = await api.get(`/locations/${f.id}`); setDetail(data.data || data.location || data); }
    catch { setDetail({ name: f.name, area: f.area, timeSlots: [] }); }
  };

  const list = useMemo(() => {
    const filtered = q ? feats.filter(f => (f.name + f.area).toLowerCase().includes(q.toLowerCase())) : feats;
    return [...filtered].sort((a, b) => (b.sti ?? -1) - (a.sti ?? -1));
  }, [feats, q]);

  const detailSlot = detail?.timeSlots?.find(s => s.slot === slot);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', height: 'calc(100vh - 66px)' }} className="map-grid">
      <div style={{ position: 'relative' }}>
        <MapContainer center={CENTER} zoom={12} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
          <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <HeatLayer points={feats} show={showHeat} />
          {feats.map(f => (
            <CircleMarker key={f.id} center={[f.lat, f.lng]} radius={selected === f.id ? 12 : 8}
              pathOptions={{ color: CAT_COLOR[f.category], fillColor: CAT_COLOR[f.category], fillOpacity: .85, weight: selected === f.id ? 4 : 2 }}
              eventHandlers={{ click: () => openDetail(f) }}>
              <Tooltip>{f.name} — {f.sti != null ? f.sti.toFixed(1) : 'unrated'}</Tooltip>
            </CircleMarker>
          ))}
        </MapContainer>

        {/* slot + heat controls */}
        <div style={{ position: 'absolute', top: 14, left: 14, zIndex: 500, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div className="card" style={{ display: 'flex', padding: 4, gap: 2 }}>
            {SLOTS.map(s => (
              <button key={s} onClick={() => setSlot(s)} className="mono"
                style={{ padding: '7px 11px', borderRadius: 8, border: 'none', fontSize: 12, textTransform: 'uppercase', letterSpacing: '.06em',
                  background: slot === s ? 'linear-gradient(135deg,var(--primary),var(--accent))' : 'transparent',
                  color: slot === s ? '#fff' : 'var(--muted)' }}>{SLOT_LABEL[s]}</button>
            ))}
          </div>
          <button className="card" onClick={() => setShowHeat(h => !h)} style={{ padding: '9px 13px', fontSize: 13, color: 'var(--text)' }}>
            {showHeat ? '● Heatmap on' : '○ Heatmap off'}
          </button>
        </div>
      </div>

      {/* SIDEBAR */}
      <aside style={{ borderLeft: '1px solid var(--border)', background: 'var(--surface)', overflowY: 'auto', padding: 18 }}>
        <input placeholder="Search places…" value={q} onChange={e => setQ(e.target.value)} style={{ marginBottom: 14 }} />
        {detail ? (
          <div className="rise">
            <button onClick={() => { setDetail(null); setSelected(null); }} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 13, marginBottom: 8 }}>← Back to list</button>
            <div style={{ display: 'grid', placeItems: 'center', gap: 6, marginBottom: 12 }}>
              <STIRing sti={detailSlot?.sti ?? null} size={140} />
            </div>
            <h2 style={{ fontSize: 22 }}>{detail.name}</h2>
            <div style={{ color: 'var(--muted)', fontSize: 14 }}>{detail.area} · {detail.type?.replace('_', ' ')}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, margin: '16px 0' }}>
              {[['Lighting', detailSlot?.avgLighting], ['Crowd', detailSlot?.avgCrowd], ['Police', detailSlot?.avgPolice], ['Incidents', detailSlot?.avgIncident]].map(([k, v]) => (
                <div key={k} className="card" style={{ padding: 12 }}>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{k}</div>
                  <div className="mono" style={{ fontSize: 18 }}>{v != null ? Number(v).toFixed(1) : '—'}</div>
                </div>
              ))}
            </div>
            {detailSlot && detailSlot.ratingCount < 3 && <div className="chip unrated" style={{ display: 'inline-block', marginBottom: 12 }}>Needs {3 - detailSlot.ratingCount} more votes to publish</div>}
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => setRateFor(detail)}>Rate this place</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>{list.length} places · sorted safest first · {SLOT_LABEL[slot]}</div>
            {list.map(f => (
              <button key={f.id} onClick={() => openDetail(f)} className="card"
                style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', border: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: CAT_COLOR[f.category], flexShrink: 0 }} />
                <span style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14.5 }}>{f.name}</div>
                  <div style={{ color: 'var(--muted)', fontSize: 12.5 }}>{f.area}</div>
                </span>
                <span className="mono" style={{ fontSize: 17, color: CAT_COLOR[f.category] }}>{f.sti != null ? f.sti.toFixed(1) : '—'}</span>
              </button>
            ))}
          </div>
        )}
      </aside>

      {rateFor && <RateModal location={rateFor} slot={slot} onClose={() => setRateFor(null)} onDone={() => { setRateFor(null); load(); if (selected) openDetail({ id: selected, ...detail }); push('Rating submitted — thank you.', 'success'); }} />}
      <style>{`@media(max-width:900px){.map-grid{grid-template-columns:1fr!important;grid-template-rows:55vh auto!important;height:auto!important}}`}</style>
    </div>
  );
}
