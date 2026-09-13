import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, Trash2, Download, ArrowRight, FileText, Pencil, Check, Loader2, RefreshCw } from 'lucide-react';
import useAnalysisStore from '../store/analysisStore';
import { analysisApi, getErrorMessage } from '../services/api';
import styles from './History.module.css';

const statusConfig = {
  completed: { label: 'Listo', color: 'var(--success)', bg: 'var(--success-bg)' },
  processing: { label: 'Procesando', color: 'var(--processing)', bg: 'var(--processing-bg)' },
  // Recién creado, antes del primer paso: no debe aparecer como "Listo".
  pending: { label: 'En cola', color: 'var(--processing)', bg: 'var(--processing-bg)' },
  failed: { label: 'Error', color: 'var(--error)', bg: 'var(--error-bg)' },
  cancelled: { label: 'Cancelado', color: 'var(--text-muted)', bg: 'var(--bg-primary)' },
};

export default function History() {
  const {
    analyses, total, loading, loadingMore, error,
    fetchAnalyses, fetchMoreAnalyses, deleteAnalysis, renameAnalysis,
  } = useAnalysisStore();
  const [search, setSearch] = useState('');
  // Resultado de la última búsqueda al backend; se deriva de él si hay búsqueda activa y si sigue en curso.
  const [searchState, setSearchState] = useState({ q: '', items: [] });
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [selected, setSelected] = useState(null);
  const [renaming, setRenaming] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [actionError, setActionError] = useState('');
  const navigate = useNavigate();

  useEffect(() => { fetchAnalyses(); }, []);

  // HU-25: la búsqueda consulta al backend, por título y por nombre de los documentos, sobre TODOS
  // los análisis del estudiante (no solo los cargados) y se actualiza mientras escribe.
  useEffect(() => {
    const q = search.trim();
    if (!q) return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const { data } = await analysisApi.search(q);
        if (!cancelled) setSearchState({ q, items: data.items || [] });
      } catch (err) {
        if (!cancelled) {
          setSearchState({ q, items: [] });
          setActionError(getErrorMessage(err, 'No se pudo realizar la búsqueda. Inténtalo de nuevo.'));
        }
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [search]);

  const query = search.trim();
  const searching = !!query && searchState.q !== query;
  const results = query ? (searchState.q === query ? searchState.items : []) : null;
  const list = results ?? analyses;

  const handleRename = async () => {
    const t = newTitle.trim();
    if (!t || !selected || t === selected.title) { setRenaming(false); return; }
    try {
      await renameAnalysis(selected.id, t);
      setSelected({ ...selected, title: t });
      setSearchState((st) => ({ ...st, items: st.items.map((a) => (a.id === selected.id ? { ...a, title: t } : a)) }));
      setRenaming(false);
    } catch (err) {
      setActionError(getErrorMessage(err, 'No se pudo renombrar el análisis. Inténtalo de nuevo.'));
    }
  };

  const handleDelete = async (id) => {
    setDeleting(true);
    try {
      await deleteAnalysis(id);
      setSearchState((st) => ({ ...st, items: st.items.filter((a) => a.id !== id) }));
      if (selected?.id === id) setSelected(null);
    } catch (err) {
      setActionError(getErrorMessage(err, 'No se pudo eliminar el análisis. Inténtalo de nuevo.'));
    } finally {
      setDeleting(false);
      setConfirmDelete(null);
    }
  };

  const formatDate = (d) => {
    if (!d) return '';
    const date = new Date(d);
    return date.toLocaleDateString('es-PE', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  let countText;
  if (results !== null) {
    countText = searching ? 'Buscando…' : `${results.length} resultado${results.length !== 1 ? 's' : ''} para «${query}»`;
  } else {
    countText = loading ? 'Cargando…' : `${analyses.length} de ${total} análisis · ordenado por fecha (recientes primero)`;
  }

  const renderList = () => {
    // HU-31 y HU-33: mientras carga se muestra un indicador, nunca el estado vacío.
    if ((results === null && loading) || (results !== null && searching && results.length === 0)) {
      return (
        <div className={styles.empty}>
          <Loader2 size={18} className={styles.spin} />
          <p>{results === null ? 'Cargando tus análisis…' : 'Buscando…'}</p>
        </div>
      );
    }
    // HU-33: si la carga falla, se informa el error en lugar de simular un historial vacío.
    if (results === null && error && analyses.length === 0) {
      return (
        <div className={styles.empty}>
          <p>{error}</p>
          <button className={styles.retryBtn} onClick={() => fetchAnalyses()}>
            <RefreshCw size={14} /> Reintentar
          </button>
        </div>
      );
    }
    if (list.length === 0) {
      return (
        <div className={styles.empty}>
          {results !== null ? (
            <p>No se encontraron análisis que coincidan con «{query}». Prueba con otra palabra del título o del nombre del documento.</p>
          ) : (
            <p>Aún no tienes análisis. Crea el primero desde «Nuevo análisis».</p>
          )}
        </div>
      );
    }
    return (
      <div className={styles.items}>
        {list.map((a) => {
          const st = statusConfig[a.status] || statusConfig.completed;
          const isSelected = selected?.id === a.id;
          return (
            <div key={a.id} className={`${styles.item} ${isSelected ? styles.itemSelected : ''}`}
              onClick={() => { setSelected(a); setRenaming(false); }}>
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
        {/* HU-23: el historial ya no se corta en los primeros 20 análisis. */}
        {results === null && analyses.length < total && (
          <button className={styles.moreBtn} onClick={fetchMoreAnalyses} disabled={loadingMore}>
            {loadingMore
              ? <><Loader2 size={14} className={styles.spin} /> Cargando…</>
              : `Mostrar más (${total - analyses.length} restantes)`}
          </button>
        )}
        {results === null && error && analyses.length > 0 && <p className={styles.inlineError}>{error}</p>}
      </div>
    );
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
        </div>

        {actionError && (
          <div className={styles.actionError}>
            <span>{actionError}</span>
            <button onClick={() => setActionError('')} aria-label="Cerrar aviso">✕</button>
          </div>
        )}

        <p className={styles.count}>{countText}</p>

        {renderList()}
      </div>

      <div className={styles.detail}>
        {selected ? (
          <>
            {renaming ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <input autoFocus value={newTitle} onChange={(e) => setNewTitle(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleRename()}
                  style={{ flex: 1, padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, font: 'inherit' }} />
                <button className={styles.iconBtn} onClick={handleRename} title="Guardar"><Check size={16} /></button>
              </div>
            ) : (
              <h2 className={styles.detailTitle} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {selected.title || 'Análisis sin nombre'}
                <button className={styles.iconBtn} onClick={() => { setNewTitle(selected.title || ''); setRenaming(true); }} title="Renombrar">
                  <Pencil size={14} />
                </button>
              </h2>
            )}
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
                <button className={styles.exportBtn} disabled={selected.status !== 'completed'}
                  onClick={() => navigate(`/mindmap/${selected.id}`)}><Download size={14} /> Imagen (PNG)</button>
                <button className={styles.exportBtn} disabled={selected.status !== 'completed'}
                  onClick={() => navigate(`/mindmap/${selected.id}`)}><FileText size={14} /> PDF completo</button>
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
        <div className={styles.overlay} onClick={() => !deleting && setConfirmDelete(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3>¿Eliminar análisis?</h3>
            <p>Esta acción no se puede deshacer.</p>
            <div className={styles.modalBtns}>
              <button className={styles.cancelModalBtn} onClick={() => setConfirmDelete(null)} disabled={deleting}>Cancelar</button>
              <button className={styles.deleteModalBtn} onClick={() => handleDelete(confirmDelete)} disabled={deleting}>
                {deleting ? 'Eliminando…' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
