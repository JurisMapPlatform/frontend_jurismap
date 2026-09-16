import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, Check, X } from 'lucide-react';
import { analysisApi, getErrorMessage } from '../services/api';
import useProgressStore from '../store/progressStore';
import styles from './Processing.module.css';

const STEPS = [
  'Lectura de documentos',
  'Clasificación con BETO',
  'Análisis con Gemini',
  'Construcción del mapa mental',
  'Generación de explicaciones',
];

const POLL_MS = 10000;
const ESTADOS_FINALES = ['completed', 'failed', 'cancelled'];

export default function Processing() {
  const { id } = useParams();
  const navigate = useNavigate();
  const ev = useProgressStore((s) => s.byId[id]);
  const [apiStep, setApiStep] = useState(0);
  const [apiStatus, setApiStatus] = useState('processing');
  const [apiError, setApiError] = useState('');
  const [cancelError, setCancelError] = useState('');

  // El avance en vivo (WebSocket) y el consultado a la API se combinan al renderizar. Antes el
  // evento se copiaba al estado local dentro de un efecto, lo que encadenaba renders de más.
  const evStatus = ESTADOS_FINALES.includes(ev?.status) ? ev.status : null;
  const status = evStatus || apiStatus;
  const currentStep = Math.max(apiStep, ev?.step || 0);
  const error = evStatus === 'failed' ? (ev.error || 'Error en el procesamiento') : apiError;

  const applyDetail = useCallback((data) => {
    if (data.status === 'completed') navigate(`/mindmap/${id}`, { replace: true });
    else if (data.status === 'failed') { setApiStatus('failed'); setApiError(data.error_message || 'Error en el procesamiento'); }
    else if (data.status === 'cancelled') setApiStatus('cancelled');
    else setApiStep((s) => Math.max(s, data.processing_step || 0));
  }, [id, navigate]);

  // Estado inicial desde la API (por si el análisis ya avanzó antes de abrir esta pantalla).
  useEffect(() => {
    analysisApi.detail(id).then(({ data }) => applyDetail(data))
      .catch(() => setApiError('No se pudo cargar el estado del análisis.'));
  }, [id, applyDetail]);

  // El WebSocket puede perder eventos (si el servidor se reinicia o el análisis corre en otra
  // instancia), así que mientras siga en proceso también se consulta el estado periódicamente.
  useEffect(() => {
    if (status !== 'processing') return undefined;
    const timer = setInterval(() => {
      analysisApi.detail(id).then(({ data }) => applyDetail(data)).catch(() => {});
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [status, id, applyDetail]);

  // Al terminar bien, se muestra el aviso un momento antes de abrir el mapa mental.
  useEffect(() => {
    if (status !== 'completed') return undefined;
    const t = setTimeout(() => navigate(`/mindmap/${id}`, { replace: true }), 1500);
    return () => clearTimeout(t);
  }, [status, id, navigate]);

  const handleCancel = async () => {
    setCancelError('');
    try {
      await analysisApi.cancel(id);
      navigate('/');
    } catch (err) {
      // HU-32: p. ej. el análisis terminó justo antes de cancelar; se indica qué hacer.
      setCancelError(getErrorMessage(err, 'No se pudo cancelar el análisis. Actualiza la página para ver su estado actual.'));
    }
  };

  const progress = Math.round((currentStep / STEPS.length) * 100);

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <span className={styles.statusLabel}>
          Estado: {status === 'processing' ? 'En proceso' : status === 'completed' ? 'Completado' : status === 'cancelled' ? 'Cancelado' : 'Error'} — {progress}%
        </span>
        <h1 className={styles.title}>
          {status === 'completed' ? 'Mapa mental generado'
            : status === 'failed' ? 'Error en el procesamiento'
            : status === 'cancelled' ? 'Análisis cancelado'
            : 'Generando mapa mental...'}
        </h1>
        <p className={styles.sub}>
          {status === 'processing' && 'La IA está analizando los documentos y construyendo la estructura del mapa.'}
          {status === 'processing' && <><br />Esto puede tomar entre 15 y 60 segundos.</>}
          {status === 'completed' && 'Redirigiendo al mapa mental...'}
          {status === 'cancelled' && 'El procesamiento fue detenido.'}
          {status === 'failed' && error}
        </p>

        {status === 'processing' && (
          <div className={styles.progressBar}>
            <div className={styles.progressFill} style={{ width: `${progress}%` }} />
          </div>
        )}

        <div className={styles.steps}>
          {STEPS.map((step, i) => {
            const done = i < currentStep;
            const active = i === currentStep && status === 'processing';
            return (
              <div key={i} className={`${styles.step} ${done ? styles.stepDone : ''} ${active ? styles.stepActive : ''}`}>
                <span className={styles.stepNum}>
                  {done ? <Check size={14} /> : active ? <Loader2 size={14} className={styles.spin} /> : i + 1}
                </span>
                <div>
                  <strong>{step}</strong>
                  <span className={styles.stepStatus}>
                    {done ? 'Completado' : active ? 'En proceso' : 'Pendiente'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {status === 'processing' && (
          <button className={styles.cancelBtn} onClick={handleCancel}>
            <X size={14} /> Cancelar análisis
          </button>
        )}
        {cancelError && (
          <p className={styles.sub} style={{ marginTop: 14, marginBottom: 0, color: 'var(--error)' }}>{cancelError}</p>
        )}
        {status === 'failed' && (
          <button className={styles.retryBtn} onClick={() => navigate('/analysis')}>
            Reintentar
          </button>
        )}
        {status === 'cancelled' && (
          <button className={styles.retryBtn} onClick={() => navigate('/')}>
            Volver al inicio
          </button>
        )}
      </div>
    </div>
  );
}
