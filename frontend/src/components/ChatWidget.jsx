import { useState, useRef, useEffect } from 'react';
import api from '../lib/api';
export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([{ role: 'assistant', content: 'Hi, I\'m your safety assistant. Ask me about safe routes, emergency numbers, or how the safety score works.' }]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef();
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, open]);

  const send = async () => {
    const q = text.trim(); if (!q || busy) return;
    const next = [...msgs, { role: 'user', content: q }];
    setMsgs(next); setText(''); setBusy(true);
    try {
      const { data } = await api.post('/chat', { messages: next.slice(-10) });
      const reply = data?.content?.[0]?.text || data?.reply || 'I\'m here to help with safety questions.';
      setMsgs(m => [...m, { role: 'assistant', content: reply }]);
    } catch {
      setMsgs(m => [...m, { role: 'assistant', content: 'Emergency numbers: 112 (all), 100 (police), 1091 (women). I\'ll reconnect shortly.' }]);
    } finally { setBusy(false); }
  };

  return (
    <>
      {!open && (
        <button onClick={() => setOpen(true)} aria-label="Open safety assistant"
          style={{ position: 'fixed', left: 22, bottom: 22, zIndex: 55, width: 54, height: 54, borderRadius: 16,
            border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 22, boxShadow: 'var(--shadow)' }}>💬</button>
      )}
      {open && (
        <div className="card rise" style={{ position: 'fixed', left: 22, bottom: 22, zIndex: 55, width: 'min(94vw,430px)', height: 'min(76vh,640px)', minHeight: 480, display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
          <div style={{ padding: '13px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <strong style={{ fontFamily: 'var(--font-display)' }}>Safety Assistant</strong>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 20 }}>×</button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {msgs.map((m, i) => (
              <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: m.role === 'user' ? '85%' : '92%',
                padding: '9px 13px', borderRadius: 14, fontSize: 14, lineHeight: 1.55, whiteSpace: 'pre-wrap',
                background: m.role === 'user' ? 'linear-gradient(135deg,var(--primary),var(--accent))' : 'var(--surface-2)',
                color: m.role === 'user' ? '#fff' : 'var(--text)' }}>{m.content}</div>
            ))}
            {busy && <div style={{ color: 'var(--muted)', fontSize: 13 }}>…</div>}
            <div ref={end} />
          </div>
          <div style={{ padding: 12, borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
            <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder="Ask about safety…" />
            <button className="btn btn-primary" onClick={send} disabled={busy}>Send</button>
          </div>
        </div>
      )}
    </>
  );
}
