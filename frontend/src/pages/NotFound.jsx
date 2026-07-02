import { Link } from 'react-router-dom';
export default function NotFound() {
  return (
    <div className="container" style={{ padding: '100px 24px', textAlign: 'center' }}>
      <div className="mono" style={{ fontSize: 64, color: 'var(--primary-2)' }}>404</div>
      <h1>This page went off the map</h1>
      <p style={{ color: 'var(--muted)' }}>Let's get you back to safety.</p>
      <Link to="/" className="btn btn-primary btn-lg" style={{ marginTop: 12 }}>Back home</Link>
    </div>
  );
}
