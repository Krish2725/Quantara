import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import TransactionTracker from './components/TransactionTracker.jsx';
import { AuthProvider, useAuth } from './auth/AuthContext.jsx';
import { LoginPage, RegisterPage } from './auth/AuthPages.jsx';
import PublicLanding from './components/PublicLanding.jsx';
import { ThemeProvider } from './theme/ThemeContext.jsx';

function ProtectedDashboard() {
  const { status, user, serviceError, retry, logout } = useAuth();
  if (status === 'loading') return <div className="flex min-h-screen items-center justify-center text-sm text-slate-500" role="status">Loading your secure session…</div>;
  if (status === 'error') return <div className="flex min-h-screen items-center justify-center p-6"><section className="max-w-md rounded-xl border border-rose-200 bg-white p-6"><h1 className="font-semibold">We couldn’t verify your session</h1><p className="mt-2 text-sm text-slate-600">{serviceError}</p><button className="mt-4 rounded-lg bg-[#256b59] px-4 py-2 text-sm text-white" onClick={retry}>Try again</button></section></div>;
  if (status !== 'authenticated') return <Navigate to="/login" replace />;
  return <TransactionTracker user={user} onLogout={logout} />;
}
function GuestRoute({ children }) { const { status } = useAuth(); if (status === 'loading') return <div className="flex min-h-screen items-center justify-center text-sm text-slate-500" role="status">Loading your secure session…</div>; return status === 'authenticated' ? <Navigate to="/dashboard" replace /> : children; }
function PublicHome() { const { status } = useAuth(); if (status === 'loading') return <div className="flex min-h-screen items-center justify-center text-sm text-slate-500" role="status">Loading your secure session…</div>; return status === 'authenticated' ? <Navigate to="/dashboard" replace /> : <PublicLanding />; }
export function AppRoutes() { return <Routes><Route path="/login" element={<GuestRoute><LoginPage /></GuestRoute>} /><Route path="/register" element={<GuestRoute><RegisterPage /></GuestRoute>} /><Route path="/dashboard" element={<ProtectedDashboard />} /><Route path="/" element={<PublicHome />} /><Route path="*" element={<Navigate to="/" replace />} /></Routes>; }
export default function App() { return <ThemeProvider><BrowserRouter><AuthProvider><AppRoutes /></AuthProvider></BrowserRouter></ThemeProvider>; }
