import { useState } from 'react';
import { X } from 'lucide-react';
import styles from './NodeModal.module.css';

export default function NodeModal({ node, analysis, findings, onClose }) {
  const [tab, setTab] = useState('explanation');
  const metadata = node.data?.metadata || {};
  const finding = findings?.find(
    (f) => f.node_id === node.id || f.fundamento_num === metadata.fundamento_num
  );

  const summary = metadata.summary || metadata.simplified || finding?.simplified_text || null;
  const original = metadata.original || finding?.texto || null;
  const nodeType = node.data?.nodeType || 'detail';

  // HU-12: referencia jurídica del nodo (sentencia de origen + fundamento + página si se conoce)
  const refParts = [];
  if (analysis?.title) refParts.push(analysis.title);
  if (metadata.fundamento_num) refParts.push(`Fundamento N° ${metadata.fundamento_num}`);
  if (finding?.page_number) refParts.push(`pág. ${finding.page_number}`);
  const referencia = refParts.join(' · ');

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.badge}>
            {nodeType === 'fundamento' ? 'Fundamento' : nodeType === 'category' ? 'Categoría' : 'Detalle'}
          </span>
          <h2 className={styles.title}>{node.data?.label || 'Sin título'}</h2>
          <button className={styles.closeBtn} onClick={onClose}><X size={16} /></button>
        </div>

        {(summary || original) && (
          <div className={styles.tabs}>
            <button
              className={tab === 'explanation' ? styles.tabActive : styles.tab}
              onClick={() => setTab('explanation')}
            >
              Explicación simplificada
            </button>
            <button
              className={tab === 'original' ? styles.tabActive : styles.tab}
              onClick={() => setTab('original')}
            >
              Texto original de la sentencia
            </button>
          </div>
        )}

        <div className={styles.content}>
          {tab === 'explanation' && (
            summary ? (
              <p className={styles.text}>{summary}</p>
            ) : (
              <p className={styles.placeholder}>No hay explicación disponible para este nodo.</p>
            )
          )}

          {tab === 'original' && (
            original ? (
              <blockquote className={styles.quote}>{original}</blockquote>
            ) : (
              <p className={styles.placeholder}>No hay texto original disponible.</p>
            )
          )}
        </div>

        <div className={styles.footer}>
          {referencia && (
            <span className={styles.hint}>📖 Referencia jurídica: {referencia}</span>
          )}
          <button className={styles.closeFooterBtn} onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
