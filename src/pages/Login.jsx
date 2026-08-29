import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import useAuthStore from '../store/authStore';
import useGoogleAuth from '../hooks/useGoogleAuth';
import { authApi } from '../services/api';
import s from '../components/FormCard.module.css';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendMsg, setResendMsg] = useState('');
  const { login, loading, error, clearError } = useAuthStore();
  const navigate = useNavigate();

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

  useGoogleAuth(handleGoogleCredential);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const ok = await login(email, password);
    if (ok) navigate('/');
  };

  // HU-02: si la cuenta no está verificada, ofrecer reenviar el correo de validación.
  const needsVerify = !!error && /verificar/i.test(error);

  const handleResend = async () => {
    setResending(true);
    setResendMsg('');
    try {
      await authApi.resendVerification(email);
      setResendMsg('Te enviamos un nuevo enlace de verificación a tu correo.');
    } catch {
      setResendMsg('No se pudo reenviar. Intenta de nuevo en unos momentos.');
    }
    setResending(false);
  };

  return (
    <div className={s.card}>
      <h1 className={s.title}>Bienvenido</h1>
      <p className={s.subtitle}>Ingresa tus credenciales para continuar</p>

      {error && <div className={s.globalError}>{error}</div>}

      {needsVerify && !resendMsg && (
        <button type="button" className={s.footerLink}
          style={{ display: 'block', marginBottom: 16, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          onClick={handleResend} disabled={resending}>
          {resending ? 'Enviando...' : 'Reenviar correo de validación'}
        </button>
      )}
      {resendMsg && <div className={s.infoText} style={{ marginBottom: 16, textAlign: 'left' }}>{resendMsg}</div>}

      <form onSubmit={handleSubmit}>
        <div className={s.field}>
          <label className={s.label}>Correo electrónico</label>
          <input
            type="email"
            className={`${s.input} ${error ? s.inputError : ''}`}
            value={email}
            onChange={(e) => { setEmail(e.target.value); clearError(); }}
            required
          />
        </div>

        <div className={s.field}>
          <label className={s.label}>Contraseña</label>
          <div className={s.passwordWrap}>
            <input
              type={showPassword ? 'text' : 'password'}
              className={`${s.input} ${error ? s.inputError : ''}`}
              value={password}
              onChange={(e) => { setPassword(e.target.value); clearError(); }}
              required
            />
            <button
              type="button"
              className={s.eyeBtn}
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              title={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          <div className={s.textRight}>
            <Link to="/forgot-password" className={s.smallLink}>¿Olvidaste tu contraseña?</Link>
          </div>
        </div>

        <button type="submit" className={s.btn} disabled={loading}>
          {loading ? 'Ingresando...' : 'Iniciar sesión'}
        </button>
      </form>

      <div className={s.divider}>o continúa con</div>
      <div id="google-signin-btn" className={s.googleContainer} />

      <p className={s.footer}>
        ¿No tienes cuenta? <Link to="/register" className={s.footerLink}>Regístrate</Link>
      </p>
    </div>
  );
}
