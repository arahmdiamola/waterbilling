import { createContext, useContext, useState, useEffect } from 'react';
import { fetchWithAuth } from './api';

const SettingsContext = createContext({
  billingType: 'METERED',
  flatRate: 0,
  isFlat: false,
  settings: null,
  refreshSettings: () => {},
});

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(null);

  const fetchSettings = () => {
    if (localStorage.getItem('token')) {
      fetchWithAuth('/api/settings')
        .then(res => res.json())
        .then(data => {
          if (data && data.billing_type) {
            setSettings(data);
          }
        })
        .catch(() => {});
    } else {
      setSettings(null);
    }
  };

  useEffect(() => {
    fetchSettings();

    const handleAuthChange = () => {
      fetchSettings();
    };
    window.addEventListener('auth-change', handleAuthChange);
    return () => window.removeEventListener('auth-change', handleAuthChange);
  }, []);

  const value = {
    billingType: settings?.billing_type || 'METERED',
    flatRate: settings?.flat_rate || 0,
    isFlat: settings?.billing_type === 'FLAT',
    settings,
    refreshSettings: fetchSettings,
  };

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}

export default SettingsContext;
