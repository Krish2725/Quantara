import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';
import BrandLogo from '../components/BrandLogo.jsx';

function AuthFrame({ title, subtitle, children, footer }) {
  return <main className="auth-page flex min-h-screen items-center justify-center bg-canvas px-5 py-10 text-ink"><div className="auth-theme-control"><ThemeToggle compact/></div><section className="auth-card w-full max-w-md rounded-2xl border border-line bg-white p-7 shadow-card sm:p-9"><BrandLogo/><h1 className="mt-6 text-3xl font-semibold tracking-tight">{title}</h1><p className="mt-2 text-sm leading-6 text-muted">{subtitle}</p>{children}<div className="mt-6 text-center text-sm text-slate-500">{footer}</div></section></main>;
}
function AuthForm({ mode }) {
  const isRegister = mode === 'register';
  const { status, user, login, register, serviceError, retry } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  if (status === 'authenticated' || user) return <Navigate to="/dashboard" replace />;
  if (status === 'loading') return <div className="flex min-h-screen items-center justify-center text-sm text-slate-500" role="status">Checking your session…</div>;
  async function submit(event) {
    event.preventDefault(); setError('');
    if (isRegister && password !== confirmation) { setError('Passwords do not match.'); return; }
    if (isRegister && password.length < 12) { setError('Use at least 12 characters for your password.'); return; }
    setBusy(true);
    try { if (isRegister) await register({ name, email, password, confirmPassword: confirmation }); else await login({ email, password }); navigate('/dashboard', { replace: true }); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <AuthFrame title={isRegister ? 'Create your account' : 'Welcome back'} subtitle={isRegister ? 'Your portfolio stays private to your account.' : 'Sign in to access your portfolio.'} footer={isRegister ? <>Already have an account? <Link className="font-semibold text-[#256b59]" to="/login">Sign in</Link></> : <>New to Quantara? <Link className="font-semibold text-[#256b59]" to="/register">Create an account</Link></>}>
    <form className="mt-7 space-y-4" onSubmit={submit}>
      {status === 'error' && <div role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Session check failed: {serviceError} <button type="button" className="font-semibold underline" onClick={retry}>Retry</button></div>}
      {isRegister && <label className="block text-sm font-medium">Name<input autoComplete="name" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 outline-none focus:border-[#78a996]" /></label>}
      <label className="block text-sm font-medium">Email<input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 outline-none focus:border-[#78a996]" /></label>
      <label className="block text-sm font-medium">Password<input type={showPassword ? 'text' : 'password'} autoComplete={isRegister ? 'new-password' : 'current-password'} required minLength={isRegister ? 12 : undefined} maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 outline-none focus:border-[#78a996]" />{isRegister && <span className="mt-1 block text-xs font-normal text-slate-500">Use at least 12 characters.</span>}</label>
      {isRegister && <label className="block text-sm font-medium">Confirm password<input type="password" autoComplete="new-password" required value={confirmation} onChange={(e) => setConfirmation(e.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 outline-none focus:border-[#78a996]" /></label>}
      {!isRegister && <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={showPassword} onChange={(e) => setShowPassword(e.target.checked)} />Show password</label>}
      {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
      <button disabled={busy} className="w-full rounded-lg bg-[#256b59] px-4 py-3 text-sm font-semibold text-white hover:bg-[#1d5849] disabled:opacity-60">{busy ? (isRegister ? 'Creating account…' : 'Signing in…') : (isRegister ? 'Create account' : 'Sign in')}</button>
    </form>
  </AuthFrame>;
}
export function LoginPage() { return <AuthForm mode="login" />; }
export function RegisterPage() { return <AuthForm mode="register" />; }
