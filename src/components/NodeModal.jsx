import { useState } from 'react';
import { X } from 'lucide-react';
import styles from './NodeModal.module.css';

export default function NodeModal({ node, analysis, findings, onClose }) {
  const [tab, setTab] = useState('explanation');
  const metadata = node.data?.metadata || {};
  // Con varias sentencias, un mismo número de fundamento puede repetirse: se prefiere el registro
  // del documento indicado en el nodo y, si no, el fundamento que se seleccionó para el mapa.
  const candidates = (findings || []).filter(
    (f) => f.node_id === node.id || (metadata.fundamento_num && f.fundamento_num === metadata.fundamento_num)
  );
  const finding = candidates.find((f) => metadata.document_id && f.document_id === metadata.document_id)
    || candidates.find((f) => f.is_selected)
    || candidates[0];

  const summary = metadata.summary || metadata.simplified || finding?.simplified_text || null;
  const original = metadata.original || finding?.texto || null;
  const nodeType = node.data?.nodeType || 'detail';

  // HU-12: referencia jurídica y origen del nodo: documento, fundamento y página.
  const docs = analysis?.documents || [];
  const docId = metadata.document_id || finding?.document_id;
  const docName = metadata.document_name
    || docs.find((d) => d.id === docId)?.original_filename
    || (docs.length === 1 ? docs[0].original_filename : null);
  const page = metadata.page_number || finding?.page_number;
  const refParts = [];
  if (nodeType === 'ai_generated') {
    refParts.push('Nodo generado con IA a partir de tu instrucción');
  } else {
    if (analysis?.title) refParts.push(analysis.title);
    if (docName) refParts.push(`Documento: ${docName}`);
    else if (docs.length > 1) refParts.push(`Documentos: ${docs.map((d) => d.original_filename).join(', ')}`);
    if (metadata.fundamento_num) refParts.push(`Fundamento N° ${metadata.fundamento_num}`);
    if (page) refParts.push(`pág. ${page}`);
  }
  const referencia = refParts.join(' · ');

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.badge}>
            {nodeType === 'fundamento' ? 'Fundamento' : nodeType === 'category' ? 'Categoría'
              : nodeType === 'central' ? 'Sentencia' : nodeType === 'ai_generated' ? 'Generado con IA' : 'Detalle'}
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
