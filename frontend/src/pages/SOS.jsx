import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { getSocket } from '../lib/socket';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';

export default function SOS() {
  const { user } = useAuth();
  const nav = useNavigate();
  const { push } = useToast();
  const [countdown, setCountdown] = useState(null);
  const [active, setActive] = useState(null);
  const [pin, setPin] = useState('');
  const [police, setPolice] = useState(null);
  const cdRef = useRef(); const posRef = useRef(); const pushRef = useRef(); const lastPosRef = useRef(null); const initialPosRef = useRef(null);

  useEffect(() => {
    if (!user) return;
    api.get('/sos/active').then(({ data }) => { if (data.sos) beginTracking(data.sos); }).catch(() => {});
    return () => {
      clearInterval(cdRef.current);
      clearInterval(pushRef.current);
      if (posRef.current) navigator.geolocation.clearWatch(posRef.current);
    };
  }, [user]);

  const getPos = () => new Promise((res, rej) =>
    navigator.geolocation.getCurrentPosition(p => res({ lat: p.coords.latitude, lng: p.coords.longitude }), rej, { enableHighAccuracy: true, timeout: 8000 }));

  const startCountdown = async () => {
    if (!user) { push('Sign in to use SOS with your saved contacts.', 'error'); return nav('/auth'); }
    try {
      initialPosRef.current = await getPos();
      push('Location permission granted. SOS countdown started.', 'success');
    } catch {
      push('Please allow location access so SOS can share your live position.', 'error');
      return;
    }
    setCountdown(10);
    cdRef.current = setInterval(() => setCountdown(c => {
      if (c <= 1) { clearInterval(cdRef.current); fire(); return null; }
      return c - 1;
    }), 1000);
  };
  const cancelCountdown = () => { clearInterval(cdRef.current); setCountdown(null); };

  const fire = async () => {
    try {
      const pos = initialPosRef.current || await getPos();
      const { data } = await api.post('/sos/trigger', { latitude: pos.lat, longitude: pos.lng });
      const sos = { _id: data.sosId, shareToken: data.shareToken };
      beginTracking(sos);
      api.get(`/sos/nearest-police?lat=${pos.lat}&lng=${pos.lng}`).then(r => setPolice(r.data.zone)).catch(() => {});
      push('SOS active. Your contacts and nearby volunteers have been alerted.', 'success');
    } catch (e) { push(e.response?.data?.error || 'Could not trigger SOS. Enable location access.', 'error'); }
  };

  const beginTracking = (sos) => {
    setActive(sos);
    getSocket().emit('join-sos', sos.shareToken);
    const sendLatest = () => {
      const p = lastPosRef.current;
      if (!p) return;
      api.patch(`/sos/${sos._id}/location`, { latitude: p.lat, longitude: p.lng }).catch(() => {});
    };
    posRef.current = navigator.geolocation.watchPosition(p => {
      lastPosRef.current = { lat: p.coords.latitude, lng: p.coords.longitude };
      sendLatest();
    }, () => {}, { enableHighAccuracy: true, maximumAge: 3000 });
    clearInterval(pushRef.current);
    pushRef.current = setInterval(sendLatest, 3000);
  };

  const cancelSOS = async () => {
    try {
      await api.patch(`/sos/${active._id}/cancel`, { pin });
      if (posRef.current) navigator.geolocation.clearWatch(posRef.current);
      clearInterval(pushRef.current);
      setActive(null); setPin('');
      push('SOS cancelled.', 'success');
    } catch (e) { push(e.response?.data?.error || 'Wrong PIN.', 'error'); }
  };

  const shareLink = active ? `${window.location.origin}/track/${active.shareToken}` : '';

  return (
    <div className="container" style={{ maxWidth: 640, padding: '48px 24px 90px', textAlign: 'center' }}>
      {!active ? (
        <>
          <div className="eyebrow">Emergency</div>
          <h1 style={{ fontSize: 36, margin: '10px 0 6px' }}>{countdown != null ? 'Sending SOS…' : 'Press for help'}</h1>
          <p style={{ color: 'var(--muted)', maxWidth: 460, margin: '0 auto 36px' }}>
            {countdown != null ? 'Tap cancel if this was a misfire.' : 'A 10-second countdown gives you time to cancel. Then your live location streams to your contacts and nearby volunteers.'}
          </p>

          <button onClick={countdown != null ? cancelCountdown : startCountdown} aria-label="Trigger SOS"
            style={{ width: 220, height: 220, borderRadius: '50%', border: 'none', color: '#fff', fontFamily: 'var(--font-display)',
              fontWeight: 700, fontSize: countdown != null ? 64 : 34, margin: '0 auto', display: 'grid', placeItems: 'center',
              background: 'radial-gradient(circle at 32% 28%, #ff7a7a, var(--sos))',
              boxShadow: '0 0 0 10px var(--sos-glow), 0 20px 50px -12px var(--sos)', position: 'relative' }}>
            <span style={{ position: 'absolute', inset: -8, borderRadius: '50%', border: '2px solid var(--sos)', animation: 'pulseRing 2.2s var(--ease) infinite' }} />
            {countdown != null ? countdown : 'SOS'}
          </button>
          {countdown != null && <div style={{ marginTop: 24 }}><button className="btn btn-ghost btn-lg" onClick={cancelCountdown}>Cancel</button></div>}

          {!user && <p style={{ marginTop: 30, color: 'var(--muted)' }}><Link to="/auth" style={{ color: 'var(--primary-2)' }}>Sign in</Link> to alert your saved contacts. You can still call 112 directly anytime.</p>}
        </>
      ) : (
        <div className="rise">
          <div className="eyebrow" style={{ color: 'var(--sos)' }}>● SOS active</div>
          <h1 style={{ fontSize: 32, margin: '10px 0 20px' }}>Help is on the way</h1>
          <div className="card" style={{ padding: 20, marginBottom: 16, textAlign: 'left' }}>
            <label>Public tracking link (share with anyone)</label>
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <input readOnly value={shareLink} />
              <button className="btn btn-ghost" onClick={() => { navigator.clipboard?.writeText(shareLink); push('Link copied.', 'success'); }}>Copy</button>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
              <a className="btn btn-ghost" href={`sms:?body=${encodeURIComponent('I need help. Track me live: ' + shareLink)}`}>Text my contacts</a>
              <a className="btn btn-ghost" href="tel:112">Call 112</a>
              <Link className="btn btn-ghost" to={`/track/${active.shareToken}`}>Open live map</Link>
            </div>
          </div>
          {police && (
            <div className="card" style={{ padding: 16, marginBottom: 16, textAlign: 'left' }}>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>Nearest police · {police.distance} km</div>
              <div style={{ fontWeight: 600 }}>{police.name}</div>
              {police.phone && <a href={`tel:${police.phone}`} className="btn btn-ghost" style={{ marginTop: 8, padding: '7px 12px' }}>Call {police.phone}</a>}
            </div>
          )}
          <div className="card" style={{ padding: 20 }}>
            <label>Enter your PIN to stop the SOS</label>
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <input type="password" value={pin} onChange={e => setPin(e.target.value)} placeholder="SOS PIN (blank if none set)" />
              <button className="btn btn-primary" onClick={cancelSOS}>Stop SOS</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
