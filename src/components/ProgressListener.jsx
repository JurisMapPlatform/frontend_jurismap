import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Check, AlertTriangle, X, ArrowRight } from 'lucide-react';
import useAuthStore from '../store/authStore';
import useProgressStore from '../store/progressStore';
import { connectWebSocket } from '../services/api';

// HU-29: escucha global de progreso. Mantiene UNA sola conexión WebSocket mientras hay sesión
// y muestra una notificación (toast) cuando cualquier análisis termina o falla, sin importar en
// qué página esté el usuario.
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

  // Si el usuario ya está viendo ese análisis (procesándose o su mapa), no lo molestamos.
  useEffect(() => {
    if (!toast) return;
    const p = location.pathname;
    if (p === `/processing/${toast.analysis_id}` || p === `/mindmap/${toast.analysis_id}`) {
      clearToast();
    }
  }, [toast, location.pathname, clearToast]);

  // Auto-descartar el toast tras unos segundos.
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(clearToast, 12000);
    return () => clearTimeout(t);
  }, [toast, clearToast]);

  if (!token || !toast) return null;

  const ok = toast.status === 'completed';
  const go = () => {
    clearToast();
    navigate(ok ? `/mindmap/${toast.analysis_id}` : '/history');
  };

  return (
    <div style={{
      position: 'fixed', right: 20, bottom: 20, zIndex: 9999, maxWidth: 340,
      background: '#fff', border: '1px solid #e5e0da', borderRadius: 12,
      boxShadow: '0 8px 30px rgba(0,0,0,0.15)', padding: '14px 16px',
      display: 'flex', gap: 12, alignItems: 'flex-start',
    }}>
      <span style={{ marginTop: 2, color: ok ? '#16a34a' : '#dc2626', flexShrink: 0 }}>
        {ok ? <Check size={18} /> : <AlertTriangle size={18} />}
      </span>
      <div style={{ flex: 1 }}>
        <strong style={{ display: 'block', fontSize: 14, color: '#1a1a1a' }}>
          {ok ? 'Mapa mental listo' : 'El análisis falló'}
        </strong>
        <p style={{ margin: '2px 0 8px', fontSize: 13, color: '#555' }}>
          {ok ? 'Tu análisis terminó de procesarse.' : 'Ocurrió un error durante el procesamiento.'}
        </p>
        <button onClick={go} style={{
          display: 'inline-flex', alignItems: 'center', gap: 4, background: '#1a1a1a',
          color: '#f5f0eb', border: 'none', borderRadius: 6, padding: '6px 10px',
          fontSize: 13, cursor: 'pointer',
        }}>
          {ok ? 'Ver mapa' : 'Ver historial'} <ArrowRight size={13} />
        </button>
      </div>
      <button onClick={clearToast} title="Cerrar" style={{
        background: 'none', border: 'none', cursor: 'pointer', color: '#999', flexShrink: 0,
      }}>
        <X size={16} />
      </button>
    </div>
  );
}
