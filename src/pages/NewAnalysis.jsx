import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, X, FileText, Check, AlertTriangle } from 'lucide-react';
import { documentApi, analysisApi } from '../services/api';
import styles from './NewAnalysis.module.css';

const MAX_FILES = 5;
const MAX_SIZE_MB = 50;

export default function NewAnalysis() {
  const [files, setFiles] = useState([]);
  const [mode, setMode] = useState('standard');
  const [prompt, setPrompt] = useState('');
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleFiles = useCallback(async (fileList) => {
    const newFiles = Array.from(fileList).slice(0, MAX_FILES - files.length);
    for (const file of newFiles) {
      if (!file.name.toLowerCase().endsWith('.pdf')) continue;
      if (file.size / 1024 / 1024 > MAX_SIZE_MB) continue;

      const uid = `${Date.now()}-${Math.random()}`;
      const entry = { uid, file, name: file.name, size: file.size, status: 'uploading', id: null, validation: null };
      setFiles((prev) => [...prev, entry]);

      try {
        const { data } = await documentApi.upload(file);
        setFiles((prev) => prev.map((f) =>
          f.uid === uid ? { ...f, id: data.document.id, status: data.validation.is_valid ? 'valid' : 'invalid', validation: data.validation } : f
        ));
      } catch {
        setFiles((prev) => prev.map((f) =>
          f.uid === uid ? { ...f, status: 'error' } : f
        ));
      }
    }
  }, [files.length]);

  const handleDrop = (e) => {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  };

  const removeFile = (index) => {
    const file = files[index];
    if (file.id) documentApi.delete(file.id).catch(() => {});
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const validDocs = files.filter((f) => f.status === 'valid');

  const handleStart = async () => {
    if (validDocs.length === 0) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await analysisApi.create({
        title: title || undefined,
        document_ids: validDocs.map((f) => f.id),
        custom_prompt: mode === 'custom' ? prompt : undefined,
      });
      navigate(`/processing/${data.id}`);
    } catch (err) {
      setError(err.response?.data?.detail || 'Error al crear el análisis');
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <section className={styles.section}>
          <h2 className={styles.stepTitle}>1 · Cargar documentos PDF</h2>
          <p className={styles.stepSub}>Sube sentencias del Tribunal Constitucional peruano</p>

          <div className={styles.dropzone}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={handleDrop}
            onClick={() => document.getElementById('file-input').click()}>
            <Upload size={24} strokeWidth={1.5} />
            <p><strong>Haz clic para seleccionar</strong> o arrastra aquí</p>
            <span className={styles.dropHint}>Solo archivos PDF · Max {MAX_SIZE_MB} MB por archivo · Hasta {MAX_FILES} archivos</span>
            <input id="file-input" type="file" accept=".pdf" multiple hidden
              onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }} />
          </div>

          {files.length > 0 && (
            <div className={styles.fileList}>
              {files.map((f, i) => (
                <div key={i} className={styles.fileItem}>
                  <FileText size={16} />
                  <span className={styles.fileName}>{f.name}</span>
                  <span className={styles.fileSize}>{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                  {f.status === 'uploading' && <span className={styles.uploading}>Subiendo...</span>}
                  {f.status === 'valid' && <span className={styles.valid}><Check size={14} /> Válido</span>}
                  {f.status === 'invalid' && <span className={styles.invalid}><AlertTriangle size={14} /> Sin texto legible</span>}
                  {f.status === 'error' && <span className={styles.invalid}>Error</span>}
                  <button className={styles.removeBtn} onClick={() => removeFile(i)}><X size={14} /></button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className={styles.section}>
          <h2 className={styles.stepTitle}>2 · Configurar análisis</h2>
          <p className={styles.stepSub}>Elige el modo de análisis o personalízalo si lo necesitas</p>

          <div className={styles.tabs}>
            <button className={`${styles.tab} ${mode === 'standard' ? styles.tabActive : ''}`} onClick={() => setMode('standard')}>
              Estándar (sin prompt)
            </button>
            <button className={`${styles.tab} ${mode === 'custom' ? styles.tabActive : ''}`} onClick={() => setMode('custom')}>
              Personalizado (con prompt)
            </button>
          </div>

          {mode === 'custom' && (
            <div className={styles.promptBox}>
              <label className={styles.promptLabel}>Describe qué quieres que se le enfatice o la estrategia del análisis:</label>
              <textarea className={styles.promptInput} rows={4} value={prompt} onChange={(e) => setPrompt(e.target.value)}
                placeholder="Ej.: Enfócate en los fundamentos sobre libertad de expresión y el test de proporcionalidad aplicado..." />
            </div>
          )}

          <div className={styles.titleField}>
            <label className={styles.promptLabel}>Título del análisis (opcional)</label>
            <input className={styles.titleInput} value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej.: Sentencia TC 00889-2023" />
          </div>
        </section>

        {error && <div className={styles.errorMsg}>{error}</div>}

        <div className={styles.footer}>
          <button className={styles.cancelBtn} onClick={() => navigate('/')}>← Cancelar</button>
          <span className={styles.footerInfo}>
            Iniciar análisis ({validDocs.length} archivo{validDocs.length !== 1 ? 's' : ''} válido{validDocs.length !== 1 ? 's' : ''})
          </span>
          <button className={styles.startBtn} onClick={handleStart} disabled={loading || validDocs.length === 0}>
            {loading ? 'Creando...' : 'Iniciar análisis ✓'}
          </button>
        </div>
      </div>

      <aside className={styles.sidebar}>
        <h3 className={styles.sideTitle}>Pasos</h3>
        <div className={styles.sideSteps}>
          <div className={styles.sideStep}><span className={`${styles.dot} ${styles.dotActive}`}>1</span><div><strong>Cargar PDFs</strong><p>Sube tus documentos</p></div></div>
          <div className={styles.sideStep}><span className={`${styles.dot} ${styles.dotActive}`}>2</span><div><strong>Configurar análisis</strong><p>Elige modo estándar o personalizado</p></div></div>
          <div className={styles.sideStep}><span className={styles.dot}>3</span><div><strong>Procesando</strong><p>La IA genera tu mapa mental</p></div></div>
          <div className={styles.sideStep}><span className={styles.dot}>4</span><div><strong>Ver resultado</strong><p>Mapa mental interactivo</p></div></div>
        </div>
      </aside>
    </div>
  );
}
