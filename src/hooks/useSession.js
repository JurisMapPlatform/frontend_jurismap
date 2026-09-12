import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import { authApi } from '../services/api';
import useIdleLogout from './useIdleLogout';

const IDLE_MINUTES = 30;
const REFRESH_EVERY_MS = 15 * 60 * 1000;
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'];

// HU-05: la sesión se cierra solo por inactividad. Mientras el estudiante esté activo, el token
// (que el backend emite por 60 minutos) se renueva cada 15 minutos para no expulsarlo a mitad
// del trabajo. Se usa en todas las pantallas con sesión, incluido el mapa mental.
export default function useSession() {
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const active = useRef(false);

  useIdleLogout(() => {
    logout();
    navigate('/login');
  }, IDLE_MINUTES);

  useEffect(() => {
    const markActive = () => { active.current = true; };
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, markActive, { passive: true }));
    const timer = setInterval(async () => {
      if (!active.current || !useAuthStore.getState().token) return;
      active.current = false;
      try {
        const { data } = await authApi.refresh();
        localStorage.setItem('token', data.access_token);
        useAuthStore.setState({ token: data.access_token });
      } catch {
        // Si falla, el token sigue vigente hasta su vencimiento y el interceptor 401 cierra la sesión.
      }
    }, REFRESH_EVERY_MS);
    return () => {
      clearInterval(timer);
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, markActive));
    };
  }, []);
}
