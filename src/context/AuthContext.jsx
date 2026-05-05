import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { importPublicKey } from '../lib/crypto';
import { apiClient } from '../lib/api';
import { clearPrivateKey, loadPrivateKey, storePrivateKey } from '../lib/keyStore';

const AuthContext = createContext(null);

function loadTokens() {
  return {
    accessToken: sessionStorage.getItem('access_token'),
    refreshToken: sessionStorage.getItem('refresh_token'),
  };
}

function loadStoredUser() {
  const rawUser = sessionStorage.getItem('whisperbox_user');
  if (!rawUser) {
    return null;
  }

  try {
    return JSON.parse(rawUser);
  } catch (error) {
    console.error('Stored user profile is invalid', error);
    sessionStorage.removeItem('whisperbox_user');
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [publicKey, setPublicKey] = useState(null);
  const [privateKey, setPrivateKey] = useState(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [authError, setAuthError] = useState(null);

  const isAuthenticated = Boolean(user && loadTokens().accessToken);

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const tokens = loadTokens();
        const storedUser = loadStoredUser();

        if (!tokens.accessToken) {
          setIsBootstrapping(false);
          return;
        }

        if (!storedUser?.id) {
          setIsBootstrapping(false);
          return;
        }

        setUser(storedUser);

        const storedPrivateKey = await loadPrivateKey(storedUser.id);
        if (storedPrivateKey) {
          setPrivateKey(storedPrivateKey);
        }

        const publicKeyResponse = await apiClient.get(`/users/${storedUser.id}/public-key`);
        if (publicKeyResponse.data?.public_key) {
          const restoredPublicKey = await importPublicKey(publicKeyResponse.data.public_key);
          setPublicKey(restoredPublicKey);
        }

        setIsBootstrapping(false);
      } catch (error) {
        console.error('Session bootstrap failed', error);
        sessionStorage.removeItem('access_token');
        sessionStorage.removeItem('refresh_token');
        sessionStorage.removeItem('whisperbox_user');
        setUser(null);
        setPrivateKey(null);
        setPublicKey(null);
        setIsBootstrapping(false);
      }
    };

    bootstrap();
  }, []);

  const login = async ({ user: nextUser, tokens, privateKey: nextPrivateKey, publicKey: nextPublicKey }) => {
    sessionStorage.setItem('access_token', tokens.access_token);
    sessionStorage.setItem('refresh_token', tokens.refresh_token);
    sessionStorage.setItem('whisperbox_user', JSON.stringify(nextUser));
    setUser(nextUser);
    setPrivateKey(nextPrivateKey);
    setPublicKey(nextPublicKey || null);
    if (nextPrivateKey?.algorithm) {
      await storePrivateKey(nextUser.id, nextPrivateKey);
    }
  };

  const logout = async () => {
    const tokens = loadTokens();
    if (tokens.refreshToken) {
      try {
        await apiClient.post('/auth/logout', { refresh_token: tokens.refreshToken });
      } catch (error) {
        console.error('Logout request failed', error);
      }
    }

    if (user?.id) {
      await clearPrivateKey(user.id);
    }

    sessionStorage.removeItem('access_token');
    sessionStorage.removeItem('refresh_token');
    sessionStorage.removeItem('whisperbox_user');
    setUser(null);
    setPrivateKey(null);
    setPublicKey(null);
  };

  const value = useMemo(
    () => ({
      user,
      publicKey,
      privateKey,
      isBootstrapping,
      isAuthenticated,
      authError,
      setAuthError,
      login,
      logout,
      setUser,
      setPublicKey,
      setPrivateKey,
      reloadPrivateKey: async () => {
        if (!user?.id) {
          return null;
        }
        const key = await loadPrivateKey(user.id);
        setPrivateKey(key);
        return key;
      },
    }),
    [user, publicKey, privateKey, isBootstrapping, isAuthenticated, authError]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return value;
}
