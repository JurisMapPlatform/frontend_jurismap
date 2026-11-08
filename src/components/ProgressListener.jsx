import { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Check, AlertTriangle, X, ArrowRight } from 'lucide-react';
import useAuthStore from '../store/authStore';
import useProgressStore from '../store/progressStore';
import { connectWebSocket, analysisApi } from '../services/api';

// HU-29: escucha global de progreso. Mantiene UNA sola conexión WebSocket mientras hay sesión
// y muestra una notificación (toast) cuando cualquier análisis termina o falla, sin importar en
// qué página esté el usuario. La notificación queda visible hasta que el usuario la cierra o pulsa
// su botón (antes se cerraba sola a los 12 s y era fácil no verla; WCAG 2.2.1, tiempo ajustable).
// Como respaldo del WebSocket, mientras haya análisis en curso se consulta su estado cada 15 s.
const POLL_MS = 15000;
const EN_CURSO = ['pending', 'processing'];
const TERMINADO = ['completed', 'failed'];
export default function ProgressListener() {
  const token = useAuthStore((s) => s.token);
  const toast = useProgressStore((s) => s.toast);
  const push = useProgressStore((s) => s.push);
  const clearToast = useProgressStore((s) => s.clearToast);
  const navigate = useNavigate();
  const location = useLocation();

  // Conexión WebSocket única y global; se reconecta sola si se cae.
  useEffect(() => {
    if (!token) return undefined;
    let ws;
    let closed = false;
    let retry;
    const connect = () => {
      ws = connectWebSocket(token, (msg) => push(msg));
      ws.onclose = () => { if (!closed) retry = setTimeout(connect, 3000); };
    };
    connect();
    return () => {
      closed = true;
      clearTimeout(retry);
      try { if (ws) ws.close(); } catch { /* noop */ }
    };
  }, [token, push]);

  // Respaldo del WebSocket (HU-29): si un mensaje se pierde (reconexión, red, servidor reiniciado),
  // la consulta periódica detecta igual que el análisis terminó y muestra la notificación.
  const activos = useRef(new Set());   // análisis que sabemos en curso
  const avisados = useRef(new Set());  // análisis ya notificados (por WebSocket o por consulta)
  const byId = useProgressStore((s) => s.byId);

  // Un análisis entra a seguimiento al abrir su pantalla de procesamiento o al llegar su avance.
  useEffect(() => {
    const m = location.pathname.match(/^\/processing\/([^/]+)/);
    if (m && !avisados.current.has(m[1])) activos.current.add(m[1]);
  }, [location.pathname]);
  useEffect(() => {
    Object.entries(byId).forEach(([id, ev]) => {
      if (EN_CURSO.includes(ev.status) && !avisados.current.has(id)) activos.current.add(id);
    });
  }, [byId]);

  // Lo que ya se notificó por WebSocket no se vuelve a notificar desde la consulta.
  useEffect(() => {
    if (!toast) return;
    avisados.current.add(toast.analysis_id);
    activos.current.delete(toast.analysis_id);
  }, [toast]);

  useEffect(() => {
    if (!token) return undefined;
    let vivo = true;
    let primera = true;
    const revisar = async () => {
      // Solo se consulta si hay algo en curso (o al iniciar, para descubrir análisis ya en proceso),
      // así una pestaña abierta sin análisis pendientes no mantiene el servidor encendido.
      if (!primera && activos.current.size === 0) return;
      const inicial = primera;
      primera = false;
      try {
        const { data } = await analysisApi.list({ page: 1, page_size: 10 });
        if (!vivo) return;
        (data.items || []).forEach((a) => {
          if (EN_CURSO.includes(a.status)) {
            if (!avisados.current.has(a.id)) activos.current.add(a.id);
          } else if (activos.current.has(a.id)) {
            activos.current.delete(a.id);
            if (TERMINADO.includes(a.status) && !inicial && !avisados.current.has(a.id)) {
              push({ analysis_id: a.id, status: a.status });
            }
          }
        });
      } catch {
        // Sin conexión: se reintenta en la siguiente vuelta.
      }
    };
    revisar();
    const t = setInterval(revisar, POLL_MS);
    return () => { vivo = false; clearInterval(t); };
  }, [token, push]);

  // Si el usuario ya está viendo ese análisis (procesándose o su mapa), no lo molestamos.
  useEffect(() => {
    if (!toast) return;
    const p = location.pathname;
    if (p === `/processing/${toast.analysis_id}` || p === `/mindmap/${toast.analysis_id}`) {
      clearToast();
    }
  }, [toast, location.pathname, clearToast]);

  if (!token || !toast) return null;

  const ok = toast.status === 'completed';
  const go = () => {
    clearToast();
    navigate(ok ? `/mindmap/${toast.analysis_id}` : '/history');
  };

  return (
    <div style={{
      position: 'fixed', right: 20, bottom: 20, zIndex: 9999, maxWidth: 340,
      background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14,
      boxShadow: '0 14px 36px rgba(27, 44, 74, 0.16)', padding: '14px 16px',
      display: 'flex', gap: 12, alignItems: 'flex-start',
    }}>
      <span style={{ marginTop: 2, color: ok ? 'var(--success)' : 'var(--error)', flexShrink: 0 }}>
        {ok ? <Check size={18} /> : <AlertTriangle size={18} />}
      </span>
      <div style={{ flex: 1 }}>
        <strong style={{ display: 'block', fontSize: 14, color: 'var(--text-primary)' }}>
          {ok ? 'Mapa mental listo' : 'El análisis falló'}
        </strong>
        <p style={{ margin: '2px 0 8px', fontSize: 13, color: 'var(--text-secondary)' }}>
          {ok ? 'Tu análisis terminó de procesarse.' : 'Ocurrió un error durante el procesamiento.'}
        </p>
        <button onClick={go} style={{
          display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--accent)',
          color: 'var(--on-accent)', border: 'none', borderRadius: 8, padding: '7px 12px',
          fontSize: 13, fontWeight: 500, cursor: 'pointer',
        }}>
          {ok ? 'Ver mapa' : 'Ver historial'} <ArrowRight size={13} />
        </button>
      </div>
      <button onClick={clearToast} title="Cerrar" style={{
        background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', flexShrink: 0,
      }}>
        <X size={16} />
      </button>
    </div>
  );
}
