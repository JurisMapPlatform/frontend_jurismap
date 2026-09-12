import { Navigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import useSession from '../hooks/useSession';

// Bloque B: protege rutas que no están dentro de AppLayout (p. ej. /mindmap/:id).
// Sin token, redirige a /login en vez de dejar cargar la pantalla.
export default function ProtectedRoute({ children }) {
  const token = useAuthStore((s) => s.token);
  // HU-05: el mapa mental también cierra la sesión por inactividad y renueva el token.
  useSession();
  if (!token) return <Navigate to="/login" replace />;
  return children;
}
