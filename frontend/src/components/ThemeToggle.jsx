import { useTheme } from '../context/ThemeContext';
export default function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button onClick={toggle} aria-label="Toggle light or dark theme" title="Toggle theme"
      style={{ width: 40, height: 40, borderRadius: 12, border: '1px solid var(--border)',
        background: 'var(--surface)', display: 'grid', placeItems: 'center', color: 'var(--text)', fontSize: 18 }}>
      {theme === 'dark' ? '☾' : '☀'}
    </button>
  );
}
