import { useState } from 'react';
import { Eye, Pencil, ChevronsDownUp, Trash2 } from 'lucide-react';
import styles from './NodeContextMenu.module.css';

export default function NodeContextMenu({ x, y, node, isCollapsed, onRename, onDelete, onToggleCollapse, onViewExplanation, onClose }) {
  const [renaming, setRenaming] = useState(false);
  const [newLabel, setNewLabel] = useState(node.data?.label || '');

  const handleRename = () => {
    if (newLabel.trim() && newLabel !== node.data?.label) {
      onRename(node.id, newLabel.trim());
    }
    setRenaming(false);
  };

  return (
    <>
      <div className={styles.backdrop} onClick={onClose} />
      <div className={styles.menu} style={{ left: x, top: y }}>
        {renaming ? (
          <div className={styles.renameBox}>
            <input className={styles.renameInput} value={newLabel} onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleRename()} autoFocus />
            <div className={styles.renameBtns}>
              <button className={styles.renameSave} onClick={handleRename}>Guardar</button>
              <button className={styles.renameCancel} onClick={() => setRenaming(false)}>Cancelar</button>
            </div>
          </div>
        ) : (
          <>
            <button className={styles.menuItem} onClick={onViewExplanation}>
              <Eye size={14} /> Ver explicación
            </button>
            <button className={styles.menuItem} onClick={() => setRenaming(true)}>
              <Pencil size={14} /> Renombrar nodo
            </button>
            <button className={styles.menuItem} onClick={() => onToggleCollapse && onToggleCollapse(node.id)}>
              <ChevronsDownUp size={14} /> {isCollapsed ? 'Expandir ramas' : 'Colapsar ramas'}
            </button>
            <div className={styles.separator} />
            <button className={`${styles.menuItem} ${styles.danger}`} onClick={() => onDelete(node.id)}>
              <Trash2 size={14} /> Eliminar nodo
            </button>
          </>
        )}
      </div>
    </>
  );
}
