import { Outlet, NavLink, Navigate, useNavigate, Link } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import useAuthStore from '../store/authStore';
import styles from './AppLayout.module.css';

export default function AppLayout() {
  const { user, token, logout } = useAuthStore();
  const navigate = useNavigate();

  if (!token) return <Navigate to="/login" replace />;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className={styles.wrapper}>
      <header className={styles.header}>
        <Link to="/" className={styles.logoLink}>
          <svg className={styles.logoIcon} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="32" height="32" rx="8" fill="#1a1a1a"/>
            <path d="M8 10h4v12H8V10zm6 0h4v12h-4V10zm6 0h4v6h-4v-6z" fill="#f5f0eb" opacity="0.9"/>
            <circle cx="23" cy="22" r="3" fill="#f5f0eb" opacity="0.6"/>
          </svg>
          <span className={styles.logoText}>JurisMind</span>
        </Link>
        <div className={styles.spacer} />
        <nav className={styles.nav}>
          <NavLink to="/" end className={({ isActive }) => isActive ? styles.active : styles.link}>Inicio</NavLink>
          <NavLink to="/analysis" className={({ isActive }) => isActive ? styles.active : styles.link}>Análisis</NavLink>
          <NavLink to="/history" className={({ isActive }) => isActive ? styles.active : styles.link}>Historial</NavLink>
        </nav>
        <div className={styles.right}>
          <span className={styles.userName}>{user?.full_name?.split(' ')[0]}</span>
          <button onClick={handleLogout} className={styles.logoutBtn} title="Cerrar sesión">
            <LogOut size={16} />
          </button>
        </div>
      </header>
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
