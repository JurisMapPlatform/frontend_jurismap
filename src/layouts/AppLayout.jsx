import { Outlet, Navigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import useSession from '../hooks/useSession';
import AppHeader from '../components/AppHeader';
import styles from './AppLayout.module.css';

export default function AppLayout() {
  const token = useAuthStore((s) => s.token);

  // HU-05: cierre por inactividad (30 min) y renovación del token mientras hay actividad.
  useSession();

  if (!token) return <Navigate to="/login" replace />;

  return (
    <div className={styles.wrapper}>
      <AppHeader />
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
