import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMe, login as apiLogin, logout as apiLogout } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(true);
  const [needsPasswordChange, setNeedsPasswordChange] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    getMe()
      .then(({ employee }) => setEmployee(employee))
      .catch(() => {}) // not logged in
      .finally(() => setLoading(false));
  }, []);

  // Re-fetch employee on window focus so nav items (like is_external_scorer) stay current
  useEffect(() => {
    function onFocus() {
      getMe()
        .then(({ employee }) => setEmployee(employee))
        .catch(() => {});
    }
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  // Handle session expiry from API interceptor
  useEffect(() => {
    function handleExpiry() {
      setEmployee(null);
      setNeedsPasswordChange(false);
      navigate('/login', { replace: true });
    }
    window.addEventListener('session-expired', handleExpiry);
    return () => window.removeEventListener('session-expired', handleExpiry);
  }, [navigate]);

  async function login(email, password) {
    const data = await apiLogin(email, password);
    setEmployee(data.employee);
    setNeedsPasswordChange(data.needsPasswordChange);
    return data;
  }

  async function logout() {
    await apiLogout();
    setEmployee(null);
    setNeedsPasswordChange(false);
  }

  return (
    <AuthContext.Provider value={{ employee, loading, login, logout, needsPasswordChange, setNeedsPasswordChange }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
