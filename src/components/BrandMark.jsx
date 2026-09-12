import styles from './BrandMark.module.css';

/**
 * Marca de JurisMap: balanza sobre cuadro oscuro + wordmark.
 * Componente puramente visual (no cambia navegación ni datos).
 */
export default function BrandMark({ size = 'sm', showText = true }) {
  const cls = size === 'lg' ? `${styles.badge} ${styles.badgeLg}` : styles.badge;
  const txt = size === 'lg' ? `${styles.word} ${styles.wordLg}` : styles.word;

  return (
    <span className={styles.wrap}>
      <span className={cls}>
        <svg viewBox="0 0 24 24" width={size === 'lg' ? 26 : 18} height={size === 'lg' ? 26 : 18}
          fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3v18" />
          <path d="M7 21h10" />
          <path d="M5 7h14" />
          <path d="M5 7l-2.4 5a2.6 2.6 0 0 0 4.8 0z" />
          <path d="M19 7l-2.4 5a2.6 2.6 0 0 0 4.8 0z" />
        </svg>
      </span>
      {showText && <span className={txt}>JurisMap</span>}
    </span>
  );
}
