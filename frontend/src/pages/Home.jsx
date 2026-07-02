import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import STIRing from '../components/STIRing';
import api from '../lib/api';
import { SLOT_LABEL, currentSlot } from '../lib/sti';

const FEATURES = [
  { t: 'Know before you go', d: 'A 0–10 Safety Trust Index for every place, per time of day — crowd-verified, not guesswork.' },
  { t: 'One-tap SOS', d: 'A 10-second countdown, then your live location streams to contacts and nearby volunteers.' },
  { t: 'Safe routes, not just fast ones', d: 'Routes scored by the safety of the streets they pass through, with turn-by-turn voice.' },
  { t: 'Trust that resists trolls', d: 'A reliability score weights each rater by consensus, so one bad actor can\'t skew a score.' },
];

export default function Home() {
  const [demo, setDemo] = useState(6.8);
  const [slot] = useState(currentSlot());
  const [stats, setStats] = useState(null);

  useEffect(() => {
    // gentle ambient animation of the hero ring
    const seq = [8.4, 6.2, 4.3, 7.1, 9.0, 5.5];
    let i = 0;
    const id = setInterval(() => { setDemo(seq[i % seq.length]); i++; }, 2200);
    api.get('/admin/stats').then(({ data }) => setStats(data.data || data)).catch(() => {});
    return () => clearInterval(id);
  }, []);

  return (
    <>
      {/* HERO */}
      <section className="container" style={{ paddingTop: 72, paddingBottom: 60, display: 'grid', gridTemplateColumns: '1.15fr .85fr', gap: 48, alignItems: 'center' }}>
        <div className="rise">
          <div className="eyebrow" style={{ marginBottom: 18 }}>Reactive rescue × preventive intelligence</div>
          <h1 style={{ fontSize: 'clamp(38px, 6vw, 66px)', letterSpacing: '-.03em' }}>
            Know before you go.<br /><span style={{ background: 'linear-gradient(120deg,var(--primary),var(--accent))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Help in one tap.</span>
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: 18, maxWidth: 520, marginTop: 20 }}>
            SurakshaMitra reads the safety of a place at a glance and puts an emergency SOS a single tap away — built for the walk home, the late metro, the unfamiliar street.
          </p>
          <div style={{ display: 'flex', gap: 12, marginTop: 30, flexWrap: 'wrap' }}>
            <Link to="/map" className="btn btn-primary btn-lg">Open the safety map</Link>
            <Link to="/sos" className="btn btn-ghost btn-lg" style={{ color: 'var(--sos)', borderColor: 'color-mix(in srgb,var(--sos) 40%,var(--border))' }}>Emergency SOS</Link>
          </div>
          <div style={{ display: 'flex', gap: 26, marginTop: 40, color: 'var(--muted)', fontSize: 13 }}>
            <div><b className="mono" style={{ color: 'var(--text)', fontSize: 20 }}>{stats?.totalLocations ?? '35+'}</b><br />places tracked</div>
            <div><b className="mono" style={{ color: 'var(--text)', fontSize: 20 }}>4</b><br />time slots / day</div>
            <div><b className="mono" style={{ color: 'var(--text)', fontSize: 20 }}>0</b><br />account needed to rate</div>
          </div>
        </div>

        {/* Signature ring, live-animating */}
        <div className="card" style={{ padding: 34, display: 'grid', placeItems: 'center', gap: 18, animation: 'floaty 6s var(--ease) infinite' }}>
          <div className="eyebrow">{SLOT_LABEL[slot]} · sample score</div>
          <STIRing sti={demo} size={200} stroke={16} />
          <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13, maxWidth: 240 }}>
            Every place is scored across morning, afternoon, evening and night — because safety isn't a constant.
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="container" style={{ paddingBottom: 90 }}>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))' }}>
          {FEATURES.map((f, i) => (
            <div key={i} className="card" style={{ padding: 26 }}>
              <div className="mono" style={{ color: 'var(--accent)', fontSize: 13 }}>{String(i + 1).padStart(2, '0')}</div>
              <h3 style={{ fontSize: 20, margin: '10px 0 8px' }}>{f.t}</h3>
              <p style={{ color: 'var(--muted)', fontSize: 14.5, margin: 0 }}>{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="container" style={{ paddingBottom: 90 }}>
        <div className="card" style={{ padding: 40, textAlign: 'center', background: 'linear-gradient(135deg, color-mix(in srgb,var(--primary) 14%,var(--surface)), var(--surface))' }}>
          <h2 style={{ fontSize: 30 }}>Contribute anonymously. Benefit immediately.</h2>
          <p style={{ color: 'var(--muted)', maxWidth: 560, margin: '12px auto 24px' }}>Rate a place in ten seconds — no signup. Create an account only when you want saved contacts, volunteer alerts, and a personal safety digest.</p>
          <Link to="/map" className="btn btn-primary btn-lg">Start with the map</Link>
        </div>
      </section>
    </>
  );
}
