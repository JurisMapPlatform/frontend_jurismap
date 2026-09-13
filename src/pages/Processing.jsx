import { useState, useEffect } from 'react';
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

export default function Processing() {
  const { id } = useParams();
  const navigate = useNavigate();
  const ev = useProgressStore((s) => s.byId[id]);
  const [currentStep, setCurrentStep] = useState(0);
  const [status, setStatus] = useState('processing');
  const [error, setError] = useState('');
  const [cancelError, setCancelError] = useState('');

  // Estado inicial desde la API (por si el análisis ya avanzó antes de abrir esta pantalla).
  useEffect(() => {
    analysisApi.detail(id).then(({ data }) => {
      if (data.status === 'completed') navigate(`/mindmap/${id}`, { replace: true });
      else if (data.status === 'failed') { setStatus('failed'); setError(data.error_message || 'Error en el procesamiento'); }
      else if (data.status === 'cancelled') setStatus('cancelled');
      else setCurrentStep(data.processing_step || 0);
    }).catch(() => setError('No se pudo cargar el estado del análisis.'));
  }, [id, navigate]);

  // Avance en vivo desde el WebSocket global (progressStore).
  useEffect(() => {
    if (!ev) return undefined;
    if (ev.step) setCurrentStep(ev.step);
    if (ev.status === 'failed') { setStatus('failed'); setError(ev.error || 'Error en el procesamiento'); }
    if (ev.status === 'cancelled') setStatus('cancelled');
    if (ev.status === 'completed') {
      setStatus('completed');
      const t = setTimeout(() => navigate(`/mindmap/${id}`, { replace: true }), 1500);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [ev, id, navigate]);

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
