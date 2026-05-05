import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { apiClient } from '../lib/api';
import { deriveWrappingKey, importPublicKey, unwrapPrivateKey } from '../lib/crypto';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, setAuthError } = useAuth();
  const [username, setUsername] = useState('alice');
  const [password, setPassword] = useState('password123');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await apiClient.post('/auth/login', { username, password });
      const authPayload = response.data?.user ? response.data : { ...response.data, user: response.data };
      const { user, access_token, refresh_token } = authPayload;
      const keySource = authPayload.user || authPayload;
      const publicKeyValue = keySource.public_key;
      const wrappedPrivateKeyValue = keySource.wrapped_private_key;
      const pbkdf2SaltValue = keySource.pbkdf2_salt;

      if (!publicKeyValue || !wrappedPrivateKeyValue || !pbkdf2SaltValue) {
        throw new Error('Login response did not include the key material required to restore your session.');
      }

      const wrappingKey = await deriveWrappingKey(password, pbkdf2SaltValue);
      const privateKey = await unwrapPrivateKey(wrappedPrivateKeyValue, wrappingKey);
      const importedPublicKey = await importPublicKey(publicKeyValue);

      await login({
        user,
        tokens: { access_token, refresh_token },
        privateKey,
        publicKey: importedPublicKey,
      });

      setAuthError(null);
      navigate('/', { replace: true });
    } catch (err) {
      const message = err?.response?.data?.message || err.message || 'Unable to sign in';
      setError(message);
      setAuthError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-layout">
      <section className="auth-hero">
        <div className="brand-mark">
          <ShieldCheck size={28} />
        </div>
        <p className="eyebrow">WhisperBox</p>
        <h1>Private conversations, encrypted on device.</h1>
        <p className="auth-copy">
          Sign in to continue your end-to-end encrypted conversations. The server stores ciphertext only.
        </p>
      </section>

      <section className="auth-card">
        <div className="auth-card__header">
          <h2>Welcome back</h2>
          <p>Use your secure account to restore your private messages.</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            Username
            <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />
          </label>
          {error ? <div className="form-alert">{error}</div> : null}
          <button type="submit" className="primary-button" disabled={loading}>
            {loading ? 'Decrypting session...' : 'Sign in securely'}
          </button>
        </form>

        <p className="auth-footer">
          New to WhisperBox? <Link to="/register">Create an account</Link>
        </p>
      </section>
    </div>
  );
}
