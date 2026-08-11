import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: `${API_BASE}/api/v1`,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Endpoints donde un 401 significa "credenciales inválidas" (no una sesión expirada):
// en esos casos NO redirigimos ni recargamos; dejamos que la pantalla muestre el error.
const AUTH_SUBMIT_ENDPOINTS = [
  '/auth/login', '/auth/register', '/auth/google',
  '/auth/forgot-password', '/auth/reset-password',
];

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const url = err.config?.url || '';
    const isAuthSubmit = AUTH_SUBMIT_ENDPOINTS.some((e) => url.includes(e));
    if (err.response?.status === 401 && !isAuthSubmit) {
      // Sesión expirada o token inválido en un endpoint protegido: cerrar sesión y volver a login.
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export const authApi = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  googleAuth: (credential) => api.post('/auth/google', { credential }),
  verifyEmail: (token) => api.post(`/auth/verify-email/${token}`),
  forgotPassword: (email) => api.post('/auth/forgot-password', { email }),
  resetPassword: (data) => api.post('/auth/reset-password', data),
  me: () => api.get('/auth/me'),
};

export const documentApi = {
  upload: (file) => {
    const form = new FormData();
    form.append('file', file);
    return api.post('/documents/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  validate: (file) => {
    const form = new FormData();
    form.append('file', file);
    return api.post('/documents/validate', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  delete: (id) => api.delete(`/documents/${id}`),
};

export const analysisApi = {
  create: (data) => api.post('/analyses', data),
  list: (params) => api.get('/analyses', { params }),
  detail: (id) => api.get(`/analyses/${id}`),
  rename: (id, title) => api.patch(`/analyses/${id}`, { title }),
  delete: (id) => api.delete(`/analyses/${id}`),
  cancel: (id) => api.post(`/analyses/${id}/cancel`),
  stats: () => api.get('/analyses/stats'),
  search: (query) => api.get('/analyses', { params: { search: query } }),
};

export const mindmapApi = {
  generateNode: (id, data) => api.post(`/mindmap/${id}/generate-node`, data),
  renameNode: (id, data) => api.patch(`/mindmap/${id}/rename-node`, data),
  deleteNode: (id, data) => api.delete(`/mindmap/${id}/node`, { data }),
  autoSave: (id, data) => api.put(`/mindmap/${id}/auto-save`, data),
  regenerate: (id) => api.post(`/mindmap/${id}/regenerate`),
  reorganize: (id) => api.post(`/mindmap/${id}/reorganize`),
};

export const exportApi = {
  json: (id) => api.get(`/export/${id}/json`, { responseType: 'blob' }),
  image: (id) => api.get(`/export/${id}/image`, { responseType: 'blob' }),
  pdf: (id) => api.get(`/export/${id}/pdf`, { responseType: 'blob' }),
};

export function connectWebSocket(token, onMessage) {
  const wsBase = API_BASE.replace(/^http/, 'ws');
  const ws = new WebSocket(`${wsBase}/ws?token=${token}`);
  ws.onmessage = (e) => onMessage(JSON.parse(e.data));
  ws.onerror = () => {};
  return ws;
}

export default api;
