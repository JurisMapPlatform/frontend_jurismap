import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Clock, Download } from 'lucide-react';
import useAuthStore from '../store/authStore';
import useAnalysisStore from '../store/analysisStore';
import styles from './Home.module.css';

const statusMap = {
  completed: { label: 'Listo', color: 'var(--success)' },
  processing: { label: 'Procesando', color: 'var(--processing)' },
  pending: { label: 'En cola', color: 'var(--processing)' },
  failed: { label: 'Error', color: 'var(--error)' },
  cancelled: { label: 'Cancelado', color: 'var(--text-muted)' },
};

export default function Home() {
  const user = useAuthStore((s) => s.user);
  const { analyses, stats, loading, error, fetchAnalyses, fetchStats } = useAnalysisStore();
  const navigate = useNavigate();

  useEffect(() => {
    fetchAnalyses({ page_size: 4 });
    fetchStats();
  }, []);

  const firstName = user?.full_name?.split(' ')[0] || 'Estudiante';
  const recentAnalyses = analyses.slice(0, 4);
  // «Exportar último»: el análisis terminado más reciente (la lista viene ordenada por fecha).
  const ultimoListo = analyses.find((a) => a.status === 'completed');
  const today = new Date().toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className={styles.page}>
      <div className={styles.top}>
        <div>
          <p className={styles.date}>{today}</p>
          <h1 className={styles.greeting}>Hola, {firstName}</h1>
          <p className={styles.sub}>
            Tienes {stats?.completed || 0} análisis guardados
            {stats?.processing ? ` | ${stats.processing} en proceso` : ''}
          </p>
        </div>
        <button className={styles.newBtn} onClick={() => navigate('/analysis')}>
          <Plus size={16} /> Nuevo análisis
        </button>
      </div>

      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <span className={styles.statNum}>{stats?.total || 0}</span>
          <span className={styles.statLabel}>Análisis totales</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statNum}>{stats?.documents || 0}</span>
          <span className={styles.statLabel}>Documentos procesados</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statNum}>{stats?.processing || 0}</span>
          <span className={styles.statLabel}>En proceso ahora</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statNum}>{stats?.nodes || 0}</span>
          <span className={styles.statLabel}>Nodos generados</span>
        </div>
      </div>

      <div className={styles.grid}>
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Análisis recientes</h2>
            <button className={styles.seeAll} onClick={() => navigate('/history')}>Ver todos →</button>
          </div>
          {/* HU-31 y HU-33: indicador mientras carga y error visible si falla, en vez del estado vacío. */}
          {loading && recentAnalyses.length === 0 ? (
            <p className={styles.empty}>Cargando tus análisis…</p>
          ) : error && recentAnalyses.length === 0 ? (
            <div className={styles.empty}>
              <p>{error}</p>
              <button className={styles.seeAll} onClick={() => fetchAnalyses({ page_size: 4 })}>Reintentar</button>
            </div>
          ) : recentAnalyses.length === 0 ? (
            <p className={styles.empty}>Aún no has creado análisis. Empieza con «Nuevo análisis».</p>
          ) : (
            <div className={styles.analysisList}>
              {recentAnalyses.map((a) => {
                const st = statusMap[a.status] || statusMap.completed;
                // Solo un análisis terminado tiene mapa. Los demás abren su pantalla de estado: en curso
                // (se puede cancelar), fallido (con el motivo y «Reintentar») o cancelado.
                const destino = a.status === 'completed' ? `/mindmap/${a.id}` : `/processing/${a.id}`;
                return (
                  <div key={a.id} className={styles.analysisItem} onClick={() => navigate(destino)}>
                    <div className={styles.analysisInfo}>
                      <span className={styles.analysisTitle}>{a.title || 'Análisis sin nombre'}</span>
                      <span className={styles.analysisMeta}>{a.document_count || 0} docs</span>
                    </div>
                    <span className={styles.statusBadge} style={{ color: st.color }}>
                      ● {st.label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Acciones rápidas</h2>
          <div className={styles.actions}>
            <button className={styles.actionCard} onClick={() => navigate('/analysis')}>
              <Plus size={18} /> <div><strong>Nuevo análisis</strong><p>Sube PDF y genera un mapa mental nuevo</p></div>
            </button>
            <button className={styles.actionCard} onClick={() => navigate('/history')}>
              <Clock size={18} /> <div><strong>Ver historial</strong><p>Accede a todos tus análisis guardados</p></div>
            </button>
            <button className={styles.actionCard} disabled={!ultimoListo}
              onClick={() => ultimoListo && navigate(`/mindmap/${ultimoListo.id}?export=pdf`)}>
              <Download size={18} /> <div><strong>Exportar último</strong><p>Descarga tu último resultado como PDF</p></div>
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
