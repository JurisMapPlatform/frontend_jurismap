import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Filter, Plus, Trash2, Download, ArrowRight, FileText, AlertTriangle, Clock } from 'lucide-react';
import useAnalysisStore from '../store/analysisStore';
import styles from './History.module.css';

const statusConfig = {
  completed: { label: 'Listo', color: 'var(--success)', bg: 'var(--success-bg)' },
  processing: { label: 'Procesando', color: 'var(--processing)', bg: 'var(--processing-bg)' },
  failed: { label: 'Error', color: 'var(--error)', bg: 'var(--error-bg)' },
  cancelled: { label: 'Cancelado', color: 'var(--text-muted)', bg: 'var(--bg-primary)' },
};

export default function History() {
  const { analyses, fetchAnalyses, deleteAnalysis } = useAnalysisStore();
  const [search, setSearch] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [selected, setSelected] = useState(null);
  const navigate = useNavigate();

  useEffect(() => { fetchAnalyses(); }, []);

  const filtered = analyses.filter((a) =>
    (a.title || '').toLowerCase().includes(search.toLowerCase())
  );

  const handleDelete = async (id) => {
    await deleteAnalysis(id);
    setConfirmDelete(null);
    if (selected?.id === id) setSelected(null);
  };

  const formatDate = (d) => {
    if (!d) return '';
    const date = new Date(d);
    return date.toLocaleDateString('es-PE', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className={styles.page}>
      <div className={styles.list}>
        <div className={styles.listHeader}>
          <h1 className={styles.listTitle}>Mis análisis</h1>
          <button className={styles.newBtn} onClick={() => navigate('/analysis')}><Plus size={14} /> Nuevo</button>
        </div>

        <div className={styles.searchRow}>
          <Search size={14} />
          <input className={styles.searchInput} value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o documento..." />
          <button className={styles.filterBtn}><Filter size={14} /> Filtrar</button>
        </div>

        <p className={styles.count}>{filtered.length} análisis · ordenado por fecha (recientes primero)</p>

        {filtered.length === 0 ? (
          <div className={styles.empty}>
            <p>No hay análisis que mostrar.</p>
          </div>
        ) : (
          <div className={styles.items}>
            {filtered.map((a) => {
              const st = statusConfig[a.status] || statusConfig.completed;
              const isSelected = selected?.id === a.id;
              return (
                <div key={a.id} className={`${styles.item} ${isSelected ? styles.itemSelected : ''}`}
                  onClick={() => setSelected(a)}>
                  <div className={styles.itemDot} style={{ background: st.color }} />
                  <div className={styles.itemContent}>
                    <span className={styles.itemTitle}>{a.title || 'Análisis sin nombre'}</span>
                    <div className={styles.itemMeta}>
                      <span className={styles.badge} style={{ color: st.color, background: st.bg }}>{st.label}</span>
                      <span>{a.document_count || 0} docs</span>
                    </div>
                  </div>
                  <div className={styles.itemActions}>
                    <span className={styles.itemDate}>{formatDate(a.created_at)}</span>
                    <div className={styles.itemBtns}>
                      {a.status === 'completed' && (
                        <button className={styles.iconBtn} onClick={(e) => { e.stopPropagation(); navigate(`/mindmap/${a.id}`); }}>
                          <ArrowRight size={14} />
                        </button>
                      )}
                      <button className={styles.iconBtn} onClick={(e) => { e.stopPropagation(); setConfirmDelete(a.id); }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className={styles.detail}>
        {selected ? (
          <>
            <h2 className={styles.detailTitle}>{selected.title || 'Análisis sin nombre'}</h2>
            <div className={styles.detailMeta}>
              <span>{formatDate(selected.created_at)}</span>
              <span>{selected.document_count || 0} documentos · {selected.node_count || 0} nodos</span>
            </div>

            <div className={styles.previewBox}>
              <h3>Vista previa del mapa</h3>
              <div className={styles.previewPlaceholder}>
                {selected.status === 'completed' ? (
                  <button className={styles.openMapBtn} onClick={() => navigate(`/mindmap/${selected.id}`)}>
                    Abrir mapa completo →
                  </button>
                ) : (
                  <p>Mapa no disponible</p>
                )}
              </div>
            </div>

            <div className={styles.detailSection}>
              <h3>Exportar</h3>
              <div className={styles.exportBtns}>
                <button className={styles.exportBtn}><Download size={14} /> Imagen (PNG)</button>
                <button className={styles.exportBtn}><FileText size={14} /> PDF completo</button>
              </div>
            </div>
          </>
        ) : (
          <div className={styles.detailEmpty}>
            <p>Selecciona un análisis para ver sus detalles</p>
          </div>
        )}
      </div>

      {confirmDelete && (
        <div className={styles.overlay} onClick={() => setConfirmDelete(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3>¿Eliminar análisis?</h3>
            <p>Esta acción no se puede deshacer.</p>
            <div className={styles.modalBtns}>
              <button className={styles.cancelModalBtn} onClick={() => setConfirmDelete(null)}>Cancelar</button>
              <button className={styles.deleteModalBtn} onClick={() => handleDelete(confirmDelete)}>Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
