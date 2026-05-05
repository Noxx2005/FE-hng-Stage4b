import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShieldPlus } from 'lucide-react';
import { apiClient } from '../lib/api';
import {
  deriveWrappingKey,
  exportPublicKey,
  generateRSAKeyPair,
  generateSalt,
  importPublicKey,
  wrapPrivateKey,
} from '../lib/crypto';
import { useAuth } from '../context/AuthContext';

const USERNAME_PATTERN = /^[A-Za-z0-9_-]+$/;

export default function RegisterPage() {
  const navigate = useNavigate();
  const { login, setAuthError } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const normalizedUsername = username.trim();
      const normalizedDisplayName = displayName.trim();

      if (!USERNAME_PATTERN.test(normalizedUsername)) {
        throw new Error('Username may only contain letters, digits, _ and -');
      }

      if (!normalizedDisplayName) {
        throw new Error('Display name is required');
      }

      const keyPair = await generateRSAKeyPair();
      const salt = generateSalt();
      const wrappingKey = await deriveWrappingKey(password, salt);
      const publicKey = await exportPublicKey(keyPair.publicKey);
      const wrappedPrivateKey = await wrapPrivateKey(keyPair.privateKey, wrappingKey);

      const response = await apiClient.post('/auth/register', {
        username: normalizedUsername,
        display_name: normalizedDisplayName,
        password,
        public_key: publicKey,
        wrapped_private_key: wrappedPrivateKey,
        pbkdf2_salt: salt,
      });

      const { user, access_token, refresh_token } = response.data;
      const importedPublicKey = await importPublicKey(publicKey);

      await login({
        user,
        tokens: { access_token, refresh_token },
        privateKey: keyPair.privateKey,
        publicKey: importedPublicKey,
      });

      navigate('/', { replace: true });
    } catch (err) {
      const message = err?.response?.data?.message || err.message || 'Unable to register';
      setError(message);
      setAuthError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-layout auth-layout--reverse">
      <section className="auth-hero">
        <div className="brand-mark">
          <ShieldPlus size={28} />
        </div>
        <p className="eyebrow">Secure signup</p>
        <h1>Create a private identity that never reveals your plaintext keys.</h1>
        <p className="auth-copy">
          Your RSA pair is generated in the browser. Only the wrapped private key blob leaves the device.
        </p>
      </section>

      <section className="auth-card">
        <div className="auth-card__header">
          <h2>Create account</h2>
          <p>Register with a username and password to begin encrypted messaging.</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            Display name
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              autoComplete="name"
              placeholder="Tisloh Bot"
            />
          </label>
          <label>
            Username
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value.replace(/\s+/g, ''))}
              autoComplete="username"
              placeholder="tisloh_bot2022"
            />
            <small className="field-hint">Use only letters, numbers, underscores, or hyphens.</small>
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
            />
          </label>
          {error ? <div className="form-alert">{error}</div> : null}
          <button type="submit" className="primary-button" disabled={loading}>
            {loading ? 'Generating keys...' : 'Create secure account'}
          </button>
        </form>

        <p className="auth-footer">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </section>
    </div>
  );
}
