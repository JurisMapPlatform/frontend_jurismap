import { Outlet, Navigate, useNavigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import useIdleLogout from '../hooks/useIdleLogout';
import AppHeader from '../components/AppHeader';
import styles from './AppLayout.module.css';

export default function AppLayout() {
  const { token, logout } = useAuthStore();
  const navigate = useNavigate();

  // HU-05: cerrar sesión tras 30 min de inactividad
  useIdleLogout(() => {
    logout();
    navigate('/login');
  }, 30);

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
