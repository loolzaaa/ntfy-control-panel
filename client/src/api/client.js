import axios from 'axios';

const client = axios.create({
  baseURL: '/api',
  timeout: 20000,
  withCredentials: true,
});

let csrfToken = null;
let unauthorizedHandler = null;

export function setCsrfToken(token) {
  csrfToken = token || null;
}

export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = handler;
}

client.interceptors.request.use((config) => {
  const method = (config.method || 'get').toLowerCase();
  if (csrfToken && !['get', 'head', 'options'].includes(method)) {
    config.headers['X-CSRF-Token'] = csrfToken;
  }
  return config;
});

client.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response && error.response.status;
    const payload = error.response && error.response.data;
    const apiError = payload && payload.error;

    if (status === 401 && unauthorizedHandler) {
      unauthorizedHandler();
    }

    const normalized = new Error(apiError && apiError.message ? apiError.message : 'Network error');
    normalized.status = status;
    normalized.code = apiError ? apiError.code : status ? 'internal_error' : 'network_error';
    normalized.details = apiError ? apiError.details : undefined;
    return Promise.reject(normalized);
  }
);

export default client;
