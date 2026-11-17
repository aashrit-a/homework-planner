import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useAccount } from '../store/AccountContext';
import { useStore } from '../store/AppStore';
import { useUI } from '../store/UIContext';
import { isEmptyData } from '../lib/merge';
import { href, navigate } from '../lib/router';
import { Logo } from '../components/Navigation';

export function SignIn({ initialMode = 'login' }: { initialMode?: 'login' | 'signup' }) {
  const { available, email: signedInAs, signIn } = useAccount();
  const { data } = useStore();
  const { toast } = useUI();
  const [mode, setMode] = useState<'login' | 'signup'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const hasLocal = !isEmptyData(data);
  const counts = `${data.assignments.length} assignment${data.assignments.length === 1 ? '' : 's'} and ${data.courses.length} class${data.courses.length === 1 ? '' : 'es'}`;

  if (!available) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <Logo />
          <h1 className="auth-title">Accounts aren’t available here</h1>
          <p className="auth-sub">This copy of Margin runs without a server. Open your Cloudflare site to sign in and sync between devices.</p>
          <a className="btn btn-secondary" href={href('/')}>
            Back to planner
          </a>
        </div>
      </div>
    );
  }

  if (signedInAs) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <Logo />
          <h1 className="auth-title">You’re signed in</h1>
          <p className="auth-sub">
            Signed in as <strong>{signedInAs}</strong>. Your planner syncs automatically.
          </p>
          <a className="btn btn-primary" href={href('/')}>
            Go to planner
          </a>
        </div>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    if (mode === 'signup' && password.length < 8) {
      setError('Use a password with at least 8 characters.');
      return;
    }
    setBusy(true);
    try {
      await signIn(mode, email, password);
      toast(mode === 'signup' ? 'Account created. Your planner is now synced.' : 'Signed in. Your planner is synced.', { tone: 'success' });
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const isSignup = mode === 'signup';
  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={submit} noValidate>
        <Logo />
        <div>
          <h1 className="auth-title">{isSignup ? 'Create your account' : 'Sign in'}</h1>
          <p className="auth-sub">Use the same account on any device to see the same planner.</p>
        </div>

        <label className="field">
          <span className="field-label">Email</span>
          <input
            id="auth-email"
            className="input"
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
          />
        </label>
        <label className="field">
          <span className="field-label">Password</span>
          <div className="input-with-clear">
            <input
              id="auth-password"
              className="input"
              type={showPassword ? 'text' : 'password'}
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={isSignup ? 8 : undefined}
            />
            <button
              type="button"
              className="clear-btn"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          {isSignup && <span className="field-hint">At least 8 characters.</span>}
        </label>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {busy ? (isSignup ? 'Creating account…' : 'Signing in…') : isSignup ? 'Create account' : 'Sign in'}
        </button>

        {hasLocal && (
          <p className="auth-note">
            The {counts} on this device will be kept and added to your account. A backup copy is saved first.
          </p>
        )}

        <p className="auth-switch">
          {isSignup ? 'Already have an account?' : 'New here?'}{' '}
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              setMode(isSignup ? 'login' : 'signup');
              setError('');
            }}
          >
            {isSignup ? 'Sign in' : 'Create an account'}
          </button>
        </p>
        <a className="auth-skip" href={href('/')}>
          Continue without an account
        </a>
      </form>
    </div>
  );
}
