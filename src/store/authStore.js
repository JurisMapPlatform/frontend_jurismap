import { create } from 'zustand';
import { authApi } from '../services/api';

const useAuthStore = create((set) => ({
  user: JSON.parse(localStorage.getItem('user')),
  token: localStorage.getItem('token'),
  loading: false,
  error: null,

  login: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const { data } = await authApi.login({ email, password });
      localStorage.setItem('token', data.access_token);
      const { data: user } = await authApi.me();
      localStorage.setItem('user', JSON.stringify(user));
      set({ token: data.access_token, user, loading: false });
      return true;
    } catch (err) {
      set({ error: err.response?.data?.detail || 'Error al iniciar sesión', loading: false });
      return false;
    }
  },

  register: async (fullName, email, password) => {
    set({ loading: true, error: null });
    try {
      await authApi.register({ full_name: fullName, email, password });
      set({ loading: false });
      return true;
    } catch (err) {
      set({ error: err.response?.data?.detail || 'Error al registrarse', loading: false });
      return false;
    }
  },

  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    set({ user: null, token: null });
  },

  clearError: () => set({ error: null }),

  refreshUser: async () => {
    try {
      const { data } = await authApi.me();
      localStorage.setItem('user', JSON.stringify(data));
      set({ user: data });
    } catch {
      /* ignore */
    }
  },
}));

export default useAuthStore;
