import { useEffect, useState } from 'react';
import { useSearchParams, useLocation, Link, useNavigate } from 'react-router-dom';
import { Mail, CheckCircle, XCircle } from 'lucide-react';
import { authApi } from '../services/api';
import s from '../components/FormCard.module.css';

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const location = useLocation();
  const navigate = useNavigate();
  const email = location.state?.email || 'tu correo';
  const [status, setStatus] = useState(token ? 'verifying' : 'info');

  useEffect(() => {
    if (!token) return;
    authApi.verifyEmail(token).then(() => setStatus('success')).catch(() => setStatus('error'));
  }, [token]);

  if (status === 'verifying') {
    return (
      <div className={s.card}>
        <div className={s.infoBox}>
          <div className={s.infoIcon}><Mail size={40} strokeWidth={1.5} /></div>
          <h2 className={s.infoTitle}>Verificando...</h2>
          <p className={s.infoText}>Un momento, estamos activando tu cuenta.</p>
        </div>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className={s.card}>
        <div className={s.infoBox}>
          <div className={s.infoIcon}><CheckCircle size={40} strokeWidth={1.5} /></div>
          <h2 className={s.infoTitle}>Cuenta verificada</h2>
          <p className={s.infoText}>Tu cuenta fue activada correctamente. Ya puedes iniciar sesión.</p>
          <button className={s.btn} style={{ marginTop: 20 }} onClick={() => navigate('/login')}>
            Iniciar sesión
          </button>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className={s.card}>
        <div className={s.infoBox}>
          <div className={s.infoIcon}><XCircle size={40} strokeWidth={1.5} /></div>
          <h2 className={s.infoTitle}>Enlace inválido o expirado</h2>
          <p className={s.infoText}>No pudimos verificar tu cuenta. El enlace puede haber expirado o ya fue usado.</p>
          <Link to="/login" className={s.backLink}>← Volver al inicio de sesión</Link>
        </div>
      </div>
    );
  }

  // Sin token: pantalla informativa tras el registro
  return (
    <div className={s.card}>
      <div className={s.infoBox}>
        <div className={s.infoIcon}><Mail size={40} strokeWidth={1.5} /></div>
        <h2 className={s.infoTitle}>Revisa tu correo</h2>
        <p className={s.infoText}>Hemos enviado un enlace de verificación a:</p>
        <span className={s.emailChip}>{email}</span>
        <p className={s.infoText}>Haz clic en el enlace para activar tu cuenta.</p>
        <p className={s.infoText}>El enlace expira en <span className={s.bold}>24 horas</span>.</p>
        <Link to="/login" className={s.backLink}>← Volver al inicio de sesión</Link>
      </div>
    </div>
  );
}
