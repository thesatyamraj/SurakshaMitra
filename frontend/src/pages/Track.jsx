import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { MapContainer, TileLayer, CircleMarker, Polyline, useMap } from 'react-leaflet';
import api from '../lib/api';
import { getSocket } from '../lib/socket';

function Recenter({ pos }) { const map = useMap(); useEffect(() => { if (pos) map.setView([pos.lat, pos.lng], map.getZoom()); }, [pos]); return null; }

export default function Track() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const trailRef = useRef([]);

  const load = () => api.get(`/sos/track/${token}`).then(({ data }) => { setData(data.sos); trailRef.current = data.sos.trail || []; }).catch(() => setErr('This tracking link is invalid or has expired.'));

  useEffect(() => {
    load();
    const s = getSocket();
    s.emit('join-sos', token);
    const onMove = (p) => setData(d => {
      if (!d) return d;
      const point = { ...p.location, t: p.timestamp || new Date().toISOString() };
      trailRef.current = [...trailRef.current, point].slice(-300);
      return { ...d, current: p.location, trail: trailRef.current };
    });
    const onCancel = () => setData(d => d ? { ...d, isActive: false } : d);
    s.on('sos:location_broadcast', onMove);
    s.on('sos:cancelled', onCancel);
    const poll = setInterval(load, 3000);
    return () => { s.off('sos:location_broadcast', onMove); s.off('sos:cancelled', onCancel); s.emit('leave-sos', token); clearInterval(poll); };
  }, [token]);

  if (err) return <div className="container" style={{ padding: 80, textAlign: 'center' }}><h1>Link not found</h1><p style={{ color: 'var(--muted)' }}>{err}</p></div>;
  if (!data) return <div className="container" style={{ padding: 80, textAlign: 'center', color: 'var(--muted)' }}>Loading live location…</div>;

  const pos = data.current;
  return (
    <div style={{ height: 'calc(100vh - 66px)', position: 'relative' }}>
      <div style={{ position: 'absolute', top: 14, left: 14, zIndex: 500 }} className="card rise">
        <div style={{ padding: '12px 16px' }}>
          <div className="eyebrow" style={{ color: data.isActive ? 'var(--sos)' : 'var(--safe)' }}>{data.isActive ? '● Live SOS' : '✓ SOS ended'}</div>
          <div style={{ fontWeight: 600, fontSize: 18 }}>{data.userName}</div>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>{data.isActive ? 'Auto-refreshes every 3 seconds' : 'This person is now safe'}</div>
        </div>
      </div>
      {pos ? (
        <MapContainer center={[pos.lat, pos.lng]} zoom={16} style={{ height: '100%', width: '100%' }}>
          <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <Recenter pos={pos} />
          {trailRef.current.length > 1 && <Polyline positions={trailRef.current.map(p => [p.lat, p.lng])} pathOptions={{ color: '#FF3B3B', weight: 3, opacity: .6 }} />}
          <CircleMarker center={[pos.lat, pos.lng]} radius={12} pathOptions={{ color: '#fff', fillColor: '#FF3B3B', fillOpacity: 1, weight: 3 }} />
        </MapContainer>
      ) : <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--muted)' }}>Waiting for first location…</div>}
    </div>
  );
}
