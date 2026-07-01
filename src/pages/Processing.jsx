import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, Check, X } from 'lucide-react';
import { connectWebSocket, analysisApi } from '../services/api';
import useAuthStore from '../store/authStore';
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
  const token = useAuthStore((s) => s.token);
  const [currentStep, setCurrentStep] = useState(0);
  const [status, setStatus] = useState('processing');
  const [error, setError] = useState('');
  const wsRef = useRef(null);

  useEffect(() => {
    analysisApi.detail(id).then(({ data }) => {
      if (data.status === 'completed') navigate(`/mindmap/${id}`, { replace: true });
      else if (data.status === 'failed') { setStatus('failed'); setError(data.error_message || 'Error en el procesamiento'); }
      else setCurrentStep(data.processing_step || 0);
    });

    wsRef.current = connectWebSocket(token, (msg) => {
      if (msg.analysis_id !== id) return;
      if (msg.step) setCurrentStep(msg.step);
      if (msg.status === 'completed') {
        setStatus('completed');
        setTimeout(() => navigate(`/mindmap/${id}`, { replace: true }), 1500);
      }
      if (msg.status === 'failed') {
        setStatus('failed');
        setError(msg.error || 'Error en el procesamiento');
      }
    });

    return () => wsRef.current?.close();
  }, [id, token, navigate]);

  const handleCancel = async () => {
    await analysisApi.cancel(id);
    navigate('/');
  };

  const progress = Math.round((currentStep / STEPS.length) * 100);

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <span className={styles.statusLabel}>
          Estado: {status === 'processing' ? 'En proceso' : status === 'completed' ? 'Completado' : 'Error'} — {progress}%
        </span>
        <h1 className={styles.title}>
          {status === 'completed' ? 'Mapa mental generado' : status === 'failed' ? 'Error en el procesamiento' : 'Generando mapa mental...'}
        </h1>
        <p className={styles.sub}>
          {status === 'processing' && 'La IA está analizando los documentos y construyendo la estructura del mapa.'}
          {status === 'processing' && <><br />Esto puede tomar entre 15 y 60 segundos.</>}
          {status === 'completed' && 'Redirigiendo al mapa mental...'}
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
        {status === 'failed' && (
          <button className={styles.retryBtn} onClick={() => navigate('/analysis')}>
            Reintentar
          </button>
        )}
      </div>
    </div>
  );
}
