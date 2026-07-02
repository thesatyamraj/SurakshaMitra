import axios from 'axios';
const BASE = import.meta.env.VITE_API_URL || '/api';
const store = {
  get access()  { return localStorage.getItem('sm_access'); },
  get refresh() { return localStorage.getItem('sm_refresh'); },
  get anon()    { return localStorage.getItem('sm_anon'); },
  setTokens({ accessToken, refreshToken }) {
    if (accessToken)  localStorage.setItem('sm_access', accessToken);
    if (refreshToken) localStorage.setItem('sm_refresh', refreshToken);
  },
  setAnon(t) { if (t) localStorage.setItem('sm_anon', t); },
  clear() { localStorage.removeItem('sm_access'); localStorage.removeItem('sm_refresh'); },
};
const api = axios.create({ baseURL: BASE });
api.interceptors.request.use((config) => {
  const token = store.access || store.anon;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
let refreshing = null;
api.interceptors.response.use(
  (res) => { const anon = res.headers['x-auth-token']; if (anon) store.setAnon(anon); return res; },
  async (error) => {
    const { response, config } = error;
    const anon = response?.headers?.['x-auth-token']; if (anon) store.setAnon(anon);
    if (response?.status === 401 && response?.data?.code === 'TOKEN_EXPIRED' && !config._retry && store.refresh) {
      config._retry = true;
      try {
        refreshing = refreshing || axios.post(`${BASE}/auth/refresh`, { refreshToken: store.refresh });
        const { data } = await refreshing; refreshing = null;
        store.setTokens({ accessToken: data.accessToken });
        config.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(config);
      } catch (e) { refreshing = null; store.clear(); }
    }
    return Promise.reject(error);
  }
);
export { api, store };
export default api;
