import axios from 'axios';

export const TOKEN_KEY = 'token';

const api = axios.create({ baseURL: 'http://localhost:3000/api' });

// Junta o token a todos os pedidos
api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Se o token expirar ou for inválido, volta ao login
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const isAuthRoute = err.config?.url?.startsWith('/auth/');
    if (err.response?.status === 401 && !isAuthRoute) {
      localStorage.removeItem(TOKEN_KEY);
      window.location.reload();
    }
    return Promise.reject(err);
  }
);

export default api;