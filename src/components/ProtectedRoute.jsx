import { Navigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';

// Bloque B: protege rutas que no están dentro de AppLayout (p. ej. /mindmap/:id).
// Sin token, redirige a /login en vez de dejar cargar la pantalla.
export default function ProtectedRoute({ children }) {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return children;
}
