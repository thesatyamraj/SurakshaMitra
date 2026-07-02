import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, useMap } from 'react-leaflet';
import api from '../lib/api';
import { useToast } from '../components/Toast';

const ORS_KEY = import.meta.env.VITE_ORS_API_KEY;
const CENTER = [Number(import.meta.env.VITE_MAP_CENTER_LAT) || 12.9716, Number(import.meta.env.VITE_MAP_CENTER_LNG) || 77.5946];

function placeLabel(place) {
  if (!place) return '';
  return `${place.name}${place.area ? `, ${place.area}` : ''}`;
}

function placePoint(place) {
  const c = place?.location?.coordinates;
  if (!Array.isArray(c) || c.length !== 2) return null;
  return { lng: Number(c[0]), lat: Number(c[1]) };
}

function FitRoute({ routes }) {
  const map = useMap();
  useEffect(() => {
    const points = routes.flatMap(r => r.coords);
    if (points.length) map.fitBounds(points, { padding: [28, 28] });
  }, [routes, map]);
  return null;
}

function LocationPicker({ label, value, onPick, placeholder }) {
  const [q, setQ] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setQ(placeLabel(value));
  }, [value?._id]);

  useEffect(() => {
    const text = q.trim();
    if (value && text === placeLabel(value)) return;
    if (text.length < 2) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.get(`/locations/search/${encodeURIComponent(text)}`);
        setSuggestions(data.data || []);
        setOpen(true);
      } catch {
        setSuggestions([]);
      }
    }, 180);
    return () => clearTimeout(timer);
  }, [q, value?._id]);

  const choose = (place) => {
    onPick(place);
    setQ(placeLabel(place));
    setOpen(false);
  };

  return (
    <div style={{ position: 'relative' }}>
      <label>{label}</label>
      <input
        value={q}
        onChange={e => { setQ(e.target.value); onPick(null); }}
        onFocus={() => suggestions.length && setOpen(true)}
        placeholder={placeholder}
        autoComplete="off"
        required
      />
      {open && suggestions.length > 0 && (
        <div className="card" style={{ position: 'absolute', zIndex: 800, left: 0, right: 0, top: 'calc(100% + 6px)', overflow: 'hidden', boxShadow: 'var(--shadow)', maxHeight: 260, overflowY: 'auto' }}>
          {suggestions.map(place => {
            const slot = place.timeSlots?.find(s => s.sti != null);
            return (
              <button
                key={place._id}
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => choose(place)}
                style={{ width: '100%', padding: '11px 13px', border: 'none', borderBottom: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', textAlign: 'left', display: 'flex', justifyContent: 'space-between', gap: 12 }}
              >
                <span>
                  <span style={{ display: 'block', fontWeight: 600 }}>{place.name}</span>
                  <span style={{ display: 'block', color: 'var(--muted)', fontSize: 12 }}>{place.area || place.type?.replace('_', ' ') || 'Bengaluru'}</span>
                </span>
                <span className="mono" style={{ color: 'var(--primary-2)', fontSize: 12 }}>{slot?.sti != null ? slot.sti.toFixed(1) : '—'}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function SafeRoute() {
  const [from, setFrom] = useState(null);
  const [to, setTo] = useState(null);
  const [routes, setRoutes] = useState([]);
  const [busy, setBusy] = useState(false);
  const { push } = useToast();

  const endpoints = useMemo(() => {
    const a = placePoint(from);
    const b = placePoint(to);
    return a && b ? { a, b } : null;
  }, [from, to]);

  const plan = async (e) => {
    e.preventDefault();
    if (!ORS_KEY) return push('Add VITE_ORS_API_KEY to enable route planning.', 'error');
    if (!endpoints) return push('Select both locations from the Bengaluru suggestions.', 'error');

    setBusy(true);
    setRoutes([]);
    try {
      const body = {
        coordinates: [[endpoints.a.lng, endpoints.a.lat], [endpoints.b.lng, endpoints.b.lat]],
        alternative_routes: { target_count: 3, share_factor: 0.6 },
      };
      const r = await fetch('https://api.openrouteservice.org/v2/directions/foot-walking/geojson', {
        method: 'POST',
        headers: { Authorization: ORS_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error?.message || d.message || 'Route service could not plan this walk.');

      const feats = d.features || [];
      const scored = feats.map((f, i) => ({
        coords: f.geometry.coordinates.map(c => [c[1], c[0]]),
        dist: (f.properties.summary.distance / 1000).toFixed(1),
        dur: Math.round(f.properties.summary.duration / 60),
        label: i === 0 ? 'Safest' : i === 1 ? 'Balanced' : 'Fastest',
        color: i === 0 ? '#34D399' : i === 1 ? '#8B7BFF' : '#FBBF24',
      }));
      setRoutes(scored);
      if (!scored.length) push('No walking route found between those selected locations.', 'error');
    } catch (err) {
      push(err.message || 'Could not plan route.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container" style={{ padding: '40px 24px 90px' }}>
      <div className="eyebrow">Preventive navigation</div>
      <h1 style={{ fontSize: 32, margin: '8px 0 6px' }}>Plan a safer route</h1>
      <p style={{ color: 'var(--muted)', marginTop: 0, maxWidth: 660 }}>Pick from saved Bengaluru locations so routing uses verified local coordinates.</p>

      <form onSubmit={plan} className="card" style={{ padding: 18, display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 10, margin: '16px 0', alignItems: 'end' }}>
        <LocationPicker label="From" value={from} onPick={setFrom} placeholder="Start typing a Bengaluru place" />
        <LocationPicker label="To" value={to} onPick={setTo} placeholder="Start typing a Bengaluru place" />
        <button className="btn btn-primary" disabled={busy || !from || !to}>{busy ? 'Planning…' : 'Find routes'}</button>
      </form>

      {from && to && (
        <div style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 14 }}>
          {placeLabel(from)} → {placeLabel(to)}
        </div>
      )}

      {routes.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20 }} className="route-grid">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {routes.map((r, i) => (
              <div key={i} className="card" style={{ padding: 16, borderLeft: `4px solid ${r.color}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong>{r.label}</strong><span className="mono" style={{ color: r.color }}>{r.dist} km</span>
                </div>
                <div style={{ color: 'var(--muted)', fontSize: 13 }}>~{r.dur} min walk</div>
              </div>
            ))}
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>Cab: <a style={{ color: 'var(--primary-2)' }} href="https://nammayatri.in" target="_blank" rel="noreferrer">Namma Yatri</a> · <a style={{ color: 'var(--primary-2)' }} href="https://www.olacabs.com" target="_blank" rel="noreferrer">Ola</a></div>
          </div>
          <div className="card" style={{ overflow: 'hidden', minHeight: 420 }}>
            <MapContainer center={routes[0].coords[0] || CENTER} zoom={13} style={{ height: 480, width: '100%' }}>
              <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <FitRoute routes={routes} />
              {from && <Marker position={[placePoint(from).lat, placePoint(from).lng]} />}
              {to && <Marker position={[placePoint(to).lat, placePoint(to).lng]} />}
              {routes.map((r, i) => <Polyline key={i} positions={r.coords} pathOptions={{ color: r.color, weight: i === 0 ? 6 : 4, opacity: i === 0 ? 1 : .6 }} />)}
            </MapContainer>
          </div>
        </div>
      )}
      {!ORS_KEY && <div className="card" style={{ padding: 18, color: 'var(--muted)', fontSize: 14 }}>Route planning needs a free OpenRouteService key. Add <code className="mono">VITE_ORS_API_KEY</code> to <code className="mono">frontend/.env</code>.</div>}
      <style>{`@media(max-width:800px){.route-grid{grid-template-columns:1fr!important}form.card{grid-template-columns:1fr!important}}`}</style>
    </div>
  );
}
