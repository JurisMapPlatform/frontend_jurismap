import { Outlet, Link, Navigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import BrandMark from '../components/BrandMark';
import styles from './AuthLayout.module.css';

export default function AuthLayout() {
  const token = useAuthStore((s) => s.token);
  if (token) return <Navigate to="/" replace />;

  return (
    <div className={styles.wrapper}>
      <header className={styles.header}>
        <Link to="/login" className={styles.logoLink}>
          <BrandMark />
        </Link>
        <Link to="/login" className={styles.headerLink}>Iniciar sesión</Link>
      </header>
      <main className={styles.main}>
        <div className={styles.logoCenter}>
          <BrandMark size="lg" showText={false} />
          <span className={styles.logoWord}>JurisMap</span>
        </div>
        <Outlet />
      </main>
    </div>
  );
}
