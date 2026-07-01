import { useState } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { authApi } from '../services/api';
import s from '../components/FormCard.module.css';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirm) { setError('Las contraseñas no coinciden'); return; }
    if (password.length < 8) { setError('Mínimo 8 caracteres'); return; }
    setLoading(true);
    setError('');
    try {
      await authApi.resetPassword({ token, new_password: password });
      setDone(true);
    } catch (err) {
      setError(err.response?.data?.detail || 'Token inválido o expirado');
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className={s.card}>
        <div className={s.stepsRow}>
          <span className={s.stepTitle}>(C) Confirmar restablecimiento</span>
          <span className={`${s.stepDot} ${s.stepInactive}`}>1</span>
          <span className={s.stepLine} />
          <span className={`${s.stepDot} ${s.stepInactive}`}>2</span>
          <span className={s.stepLine} />
          <span className={`${s.stepDot} ${s.stepActive}`}>3</span>
        </div>
        <div className={s.infoBox}>
          <h2 className={s.infoTitle}>Contraseña actualizada</h2>
          <p className={s.infoText}>Ya puedes iniciar sesión con tu nueva contraseña.</p>
          <button className={s.btn} style={{ marginTop: 20 }} onClick={() => navigate('/login')}>
            Ir al inicio de sesión
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={s.card}>
      <div className={s.stepsRow}>
        <span className={s.stepTitle}>(C) Nueva contraseña</span>
        <span className={`${s.stepDot} ${s.stepInactive}`}>1</span>
        <span className={s.stepLine} />
        <span className={`${s.stepDot} ${s.stepInactive}`}>2</span>
        <span className={s.stepLine} />
        <span className={`${s.stepDot} ${s.stepActive}`}>3</span>
      </div>

      <h2 className={s.title}>Nueva contraseña</h2>
      <p className={s.subtitle}>Ingresa tu nueva contraseña para completar el restablecimiento.</p>

      {error && <div className={s.globalError}>{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className={s.field}>
          <label className={s.label}>Nueva contraseña</label>
          <input type="password" className={s.input} value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <div className={s.field}>
          <label className={s.label}>Confirmar contraseña</label>
          <input type="password" className={s.input} value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        </div>
        <button type="submit" className={s.btn} disabled={loading}>
          {loading ? 'Guardando...' : 'Restablecer contraseña'}
        </button>
      </form>

      <div style={{ textAlign: 'center' }}>
        <Link to="/login" className={s.backLink}>← Volver al inicio de sesión</Link>
      </div>
    </div>
  );
}
