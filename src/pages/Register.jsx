import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import useGoogleAuth from '../hooks/useGoogleAuth';
import { authApi } from '../services/api';
import s from '../components/FormCard.module.css';

function getStrength(pw) {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return score;
}

const strengthColors = ['#dc2626', '#f59e0b', '#f59e0b', '#16a34a', '#16a34a'];
const strengthLabels = ['', 'Débil', 'Regular', 'Buena', 'Fuerte'];

export default function Register() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [terms, setTerms] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const { register, loading, error, clearError } = useAuthStore();
  const navigate = useNavigate();

  const strength = getStrength(password);

  const handleGoogleCredential = async (credential) => {
    try {
      const { data } = await authApi.googleAuth(credential);
      localStorage.setItem('token', data.access_token);
      const { data: user } = await authApi.me();
      localStorage.setItem('user', JSON.stringify(user));
      useAuthStore.setState({ token: data.access_token, user });
      navigate('/');
    } catch (err) {
      useAuthStore.setState({ error: err.response?.data?.detail || 'Error con Google' });
    }
  };

  useGoogleAuth(handleGoogleCredential, 'google-signup-btn');

  const validate = () => {
    const errs = {};
    if (!fullName.trim()) errs.fullName = 'Nombre requerido';
    if (!email.trim()) errs.email = 'Correo requerido';
    if (password.length < 8) errs.password = 'Mínimo 8 caracteres';
    if (password !== confirm) errs.confirm = 'Las contraseñas no coinciden';
    if (!terms) errs.terms = 'Debes aceptar los términos';
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    const ok = await register(fullName, email, password);
    if (ok) navigate('/verify-email', { state: { email } });
  };

  return (
    <div className={s.card}>
      <h1 className={s.title}>Crear cuenta</h1>
      <p className={s.subtitle}>Ingresa tus datos para registrarte</p>

      {error && <div className={s.globalError}>{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className={s.field}>
          <label className={s.label}>Nombre completo</label>
          <input className={s.input} value={fullName} onChange={(e) => setFullName(e.target.value)} />
          {fieldErrors.fullName && <div className={s.error}>{fieldErrors.fullName}</div>}
        </div>

        <div className={s.field}>
          <label className={s.label}>Correo electrónico</label>
          <input type="email" className={`${s.input} ${error ? s.inputError : ''}`} value={email}
            onChange={(e) => { setEmail(e.target.value); clearError(); }} />
          {fieldErrors.email && <div className={s.error}>{fieldErrors.email}</div>}
        </div>

        <div className={s.field}>
          <label className={s.label}>Contraseña</label>
          <input type="password" className={s.input} value={password} onChange={(e) => setPassword(e.target.value)} />
          {password && (
            <div className={s.strengthBar} style={{
              width: `${strength * 25}%`,
              background: strengthColors[strength],
            }} />
          )}
          {fieldErrors.password && <div className={s.error}>{fieldErrors.password}</div>}
        </div>

        <div className={s.field}>
          <label className={s.label}>Confirmar contraseña</label>
          <input type="password" className={s.input} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          {fieldErrors.confirm && <div className={s.error}>{fieldErrors.confirm}</div>}
        </div>

        <div className={s.checkRow}>
          <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
          <span>Acepto los <a href="#">Términos y condiciones</a></span>
        </div>
        {fieldErrors.terms && <div className={s.error}>{fieldErrors.terms}</div>}

        <button type="submit" className={s.btn} disabled={loading}>
          {loading ? 'Registrando...' : 'Registrarse'}
        </button>
      </form>

      <div className={s.divider}>o continúa con</div>
      <div id="google-signup-btn" className={s.googleContainer} />

      <p className={s.footer}>
        ¿Ya tienes cuenta? <Link to="/login" className={s.footerLink}>Inicia sesión</Link>
      </p>
    </div>
  );
}
