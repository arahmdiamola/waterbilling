const API = '';

export const fetchWithAuth = async (endpoint, options = {}) => {
  const token = localStorage.getItem('token');
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API}${endpoint}`, {
    ...options,
    headers,
  });

  if (response.status === 401 || response.status === 403) {
    // Only redirect if it's not the login endpoint
    if (!endpoint.includes('/api/auth/login')) {
      localStorage.removeItem('token');
      localStorage.removeItem('username');
      window.dispatchEvent(new Event('auth-change'));
    }
  }

  return response;
};
