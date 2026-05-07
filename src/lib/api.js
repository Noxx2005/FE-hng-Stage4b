import axios from 'axios';
import { mockApi } from './mockApi';

const useMockApi = import.meta.env.VITE_USE_MOCK_API === 'true';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'https://whisperbox.koyeb.app',
});

const PUBLIC_PATHS = ['/auth/login', '/auth/register', '/auth/refresh'];

api.interceptors.request.use((config) => {
  const isPublic = PUBLIC_PATHS.some((path) => config.url?.includes(path));
  if (!isPublic) {
    const token = sessionStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

async function request(method, url, data, config = {}) {
  if (useMockApi) {
    return mockApi.request(method, url, data, config);
  }

  try {
    if (method === 'get') {
      return api.get(url, config);
    }
    if (method === 'post') {
      return api.post(url, data, config);
    }
    if (method === 'patch') {
      return api.patch(url, data, config);
    }
    return api.request({ method, url, data, ...config });
  } catch (error) {
    if (useMockApi) {
      return mockApi.request(method, url, data, config);
    }
    throw error;
  }
}

export const apiClient = {
  get: (url, config) => request('get', url, undefined, config),
  post: (url, data, config) => request('post', url, data, config),
  patch: (url, data, config) => request('patch', url, data, config),
};

export default api;
