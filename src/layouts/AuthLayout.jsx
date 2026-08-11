import { Outlet, Link, Navigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import styles from './AuthLayout.module.css';

export default function AuthLayout() {
  const token = useAuthStore((s) => s.token);
  if (token) return <Navigate to="/" replace />;

  return (
    <div className={styles.wrapper}>
      <header className={styles.header}>
        <Link to="/login" className={styles.logoLink}>
          <svg className={styles.logoIcon} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="32" height="32" rx="8" fill="#1a1a1a"/>
            <path d="M8 10h4v12H8V10zm6 0h4v12h-4V10zm6 0h4v6h-4v-6z" fill="#f5f0eb" opacity="0.9"/>
            <circle cx="23" cy="22" r="3" fill="#f5f0eb" opacity="0.6"/>
          </svg>
          <span className={styles.logoText}>JurisMap</span>
        </Link>
        <Link to="/login" className={styles.headerLink}>Iniciar sesión</Link>
      </header>
      <main className={styles.main}>
        <div className={styles.logoCenter}>
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="32" height="32" rx="8" fill="#1a1a1a"/>
            <path d="M8 10h4v12H8V10zm6 0h4v12h-4V10zm6 0h4v6h-4v-6z" fill="#f5f0eb" opacity="0.9"/>
            <circle cx="23" cy="22" r="3" fill="#f5f0eb" opacity="0.6"/>
          </svg>
          <span>JurisMap</span>
        </div>
        <Outlet />
      </main>
    </div>
  );
}
