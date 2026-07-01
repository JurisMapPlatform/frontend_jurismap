import { useState } from 'react';
import { Link } from 'react-router-dom';
import { authApi } from '../services/api';
import s from '../components/FormCard.module.css';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await authApi.forgotPassword(email);
      setSent(true);
    } catch (err) {
      setError(err.response?.data?.detail || 'Error al enviar el correo');
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className={s.card}>
        <div className={s.stepsRow}>
          <span className={s.stepTitle}>(B) Correo enviado</span>
          <span className={`${s.stepDot} ${s.stepInactive}`}>1</span>
          <span className={s.stepLine} />
          <span className={`${s.stepDot} ${s.stepActive}`}>2</span>
          <span className={s.stepLine} />
          <span className={`${s.stepDot} ${s.stepInactive}`}>3</span>
        </div>
        <div className={s.infoBox}>
          <h2 className={s.infoTitle}>Revisa tu correo</h2>
          <p className={s.infoText}>Te enviamos un enlace de recuperación a:</p>
          <span className={s.emailChip}>{email}</span>
          <p className={s.infoText}>El enlace expira en <span className={s.bold}>1 hora</span>.</p>
          <Link to="/login" className={s.backLink}>← Volver al inicio de sesión</Link>
        </div>
      </div>
    );
  }

  return (
    <div className={s.card}>
      <div className={s.stepsRow}>
        <span className={s.stepTitle}>(A) Solicitar recuperación</span>
        <span className={`${s.stepDot} ${s.stepActive}`}>1</span>
        <span className={s.stepLine} />
        <span className={`${s.stepDot} ${s.stepInactive}`}>2</span>
        <span className={s.stepLine} />
        <span className={`${s.stepDot} ${s.stepInactive}`}>3</span>
      </div>

      <h2 className={s.title}>Recuperar contraseña</h2>
      <p className={s.subtitle}>Ingresa tu correo registrado y te enviaremos un enlace para restablecer tu contraseña.</p>

      {error && <div className={s.globalError}>{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className={s.field}>
          <label className={s.label}>Correo electrónico</label>
          <input type="email" className={s.input} value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <button type="submit" className={s.btn} disabled={loading}>
          {loading ? 'Enviando...' : 'Enviar enlace de recuperación'}
        </button>
      </form>

      <div style={{ textAlign: 'center' }}>
        <Link to="/login" className={s.backLink}>← Volver al inicio de sesión</Link>
      </div>
    </div>
  );
}
