import { NavLink, Link, useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import useAuthStore from '../store/authStore';
import BrandMark from './BrandMark';
import styles from './AppHeader.module.css';

/**
 * Barra superior de la aplicación (marca + navegación + sesión).
 * Solo presentación: reutiliza las rutas y el logout que ya existían.
 */
export default function AppHeader() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className={styles.header}>
      <Link to="/" className={styles.logoLink}>
        <BrandMark />
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
          <LogOut size={15} />
        </button>
      </div>
    </header>
  );
}
