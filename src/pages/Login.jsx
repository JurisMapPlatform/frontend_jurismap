import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import useGoogleAuth from '../hooks/useGoogleAuth';
import { authApi } from '../services/api';
import s from '../components/FormCard.module.css';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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

  return (
    <div className={s.card}>
      <h1 className={s.title}>Bienvenido</h1>
      <p className={s.subtitle}>Ingresa tus credenciales para continuar</p>

      {error && <div className={s.globalError}>{error}</div>}

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
          <input
            type="password"
            className={`${s.input} ${error ? s.inputError : ''}`}
            value={password}
            onChange={(e) => { setPassword(e.target.value); clearError(); }}
            required
          />
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
