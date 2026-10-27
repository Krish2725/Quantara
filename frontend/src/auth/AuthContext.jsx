import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { authRequest } from '../services/portfolioApi.js';

const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [status, setStatus] = useState('loading');
  const [user, setUser] = useState(null);
  const [serviceError, setServiceError] = useState('');
  useEffect(() => {
    let active = true;
    authRequest('/api/auth/me').then(({ user: profile }) => { if (active) { setUser(profile); setStatus('authenticated'); } })
      .catch((error) => { if (!active) return; if (error.status === 401) setStatus('unauthenticated'); else { setServiceError(error.message); setStatus('error'); } });
    return () => { active = false; };
  }, []);
  const value = useMemo(() => ({ status, user, serviceError,
    async login(credentials) { const result = await authRequest('/api/auth/login', { method: 'POST', body: credentials }); setUser(result.user); setServiceError(''); setStatus('authenticated'); },
    async register(details) { const result = await authRequest('/api/auth/register', { method: 'POST', body: details }); setUser(result.user); setServiceError(''); setStatus('authenticated'); },
    async logout() { await authRequest('/api/auth/logout', { method: 'POST' }); setUser(null); setStatus('unauthenticated'); },
    async retry() { setStatus('loading'); setServiceError(''); try { const result = await authRequest('/api/auth/me'); setUser(result.user); setStatus('authenticated'); } catch (error) { if (error.status === 401) setStatus('unauthenticated'); else { setServiceError(error.message); setStatus('error'); } } },
  }), [status, user, serviceError]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() { return useContext(AuthContext); }
