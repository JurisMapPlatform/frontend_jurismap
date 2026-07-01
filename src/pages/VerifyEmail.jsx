import { useLocation, Link } from 'react-router-dom';
import { Mail } from 'lucide-react';
import s from '../components/FormCard.module.css';

export default function VerifyEmail() {
  const location = useLocation();
  const email = location.state?.email || 'tu correo';

  return (
    <div className={s.card}>
      <div className={s.infoBox}>
        <div className={s.infoIcon}><Mail size={40} strokeWidth={1.5} /></div>
        <h2 className={s.infoTitle}>Revisa tu correo</h2>
        <p className={s.infoText}>Hemos enviado un enlace de verificación a:</p>
        <span className={s.emailChip}>{email}</span>
        <p className={s.infoText}>Haz clic en el enlace para activar tu cuenta.</p>
        <p className={s.infoText}>El enlace expira en <span className={s.bold}>24 horas</span>.</p>
        <button className={s.btn} style={{ marginTop: 24 }}>Reenviar enlace</button>
        <Link to="/login" className={s.backLink}>← Volver al inicio de sesión</Link>
      </div>
    </div>
  );
}
