import { categoryOf, CAT_COLOR } from '../lib/sti';

/** Signature element: a radial safety-signal gauge. Score in mono at center. */
export default function STIRing({ sti, size = 132, stroke = 11, label, animate = true }) {
  const cat = categoryOf(sti);
  const color = CAT_COLOR[cat];
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = sti == null ? 0 : sti / 10;
  const dash = c * pct;

  return (
    <div style={{ position: 'relative', width: size, height: size, display: 'grid', placeItems: 'center' }}>
      {sti != null && cat !== 'risky' && animate && (
        <span aria-hidden style={{ position: 'absolute', inset: stroke, borderRadius: '50%',
          border: `2px solid ${color}`, animation: 'pulseRing 2.6s var(--ease) infinite' }} />
      )}
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--ring-track)" strokeWidth={stroke} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={`${dash} ${c}`}
          style={{ transition: animate ? 'stroke-dasharray 1s var(--ease)' : 'none',
                   filter: `drop-shadow(0 0 6px ${color}66)` }} />
      </svg>
      <div style={{ position: 'absolute', textAlign: 'center' }}>
        <div className="mono" style={{ fontSize: size * .3, fontWeight: 700, lineHeight: 1, color }}>
          {sti == null ? '—' : sti.toFixed(1)}
        </div>
        <div className="mono" style={{ fontSize: 10, letterSpacing: '.14em', color: 'var(--muted)', textTransform: 'uppercase', marginTop: 4 }}>
          {label || (sti == null ? 'Unrated' : cat)}
        </div>
      </div>
    </div>
  );
}
