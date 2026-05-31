import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Printer, Eye, EyeOff, ArrowRight, Sun, Moon } from 'lucide-react';

const DEMO_ACCOUNTS = [
  { label: 'Owner', email: 'owner@printshop.com', password: 'owner123', color: 'bg-purple-100 text-purple-700 border-purple-200 hover:bg-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800' },
  { label: 'Manager', email: 'manager@printshop.com', password: 'manager123', color: 'bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800' },
  { label: 'Cashier', email: 'cashier@printshop.com', password: 'cashier123', color: 'bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800' },
  { label: 'Print Operator', email: 'operator@printshop.com', password: 'operator123', color: 'bg-orange-100 text-orange-700 border-orange-200 hover:bg-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800' },
  { label: 'Inventory Officer', email: 'inventory@printshop.com', password: 'inventory123', color: 'bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800' },
];

export default function Login() {
  const { login, user } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (user) navigate('/');
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-indigo-900 to-slate-900 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900 flex items-center justify-center p-4 transition-colors duration-200">
      {/* Theme toggle */}
      <button
        onClick={toggleTheme}
        className="fixed top-4 right-4 p-2.5 rounded-xl bg-white/10 text-white hover:bg-white/20 transition-colors"
        title={isDark ? 'Light mode' : 'Dark mode'}
      >
        {isDark ? <Sun size={18} /> : <Moon size={18} />}
      </button>

      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-white/10 backdrop-blur rounded-2xl flex items-center justify-center mx-auto mb-4 border border-white/20 shadow-lg">
            <Printer size={30} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white">PrintShop Manager</h1>
          <p className="text-indigo-200 mt-1.5 text-sm">Printing Press · Bookstore · Stationery</p>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl shadow-indigo-950/40 p-8 border border-slate-100 dark:border-slate-700">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6">Welcome back</h2>

          {/* Demo accounts */}
          <div className="mb-6">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">Quick Demo Login</p>
            <div className="grid grid-cols-2 gap-2">
              {DEMO_ACCOUNTS.map(acc => (
                <button
                  key={acc.label}
                  type="button"
                  onClick={() => { setEmail(acc.email); setPassword(acc.password); setError(''); }}
                  className={`text-xs font-semibold py-2 px-3 rounded-xl border transition-all hover:scale-[1.02] active:scale-95 ${acc.color}`}
                >
                  {acc.label}
                </button>
              ))}
            </div>
          </div>

          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200 dark:border-slate-600" />
            </div>
            <div className="relative text-center">
              <span className="bg-white dark:bg-slate-800 px-3 text-xs text-slate-400 font-medium">or enter credentials</span>
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label dark:text-slate-300">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white dark:placeholder-slate-400"
                placeholder="your@email.com"
                required
                autoComplete="email"
              />
            </div>
            <div>
              <label className="label dark:text-slate-300">Password</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="input pr-10 dark:bg-slate-700 dark:border-slate-600 dark:text-white dark:placeholder-slate-400"
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3 flex items-center justify-center gap-2 text-base"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>Sign In <ArrowRight size={18} /></>
              )}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-700">
            <div className="grid grid-cols-1 gap-2 text-xs text-slate-500 dark:text-slate-400">
              <div className="text-center font-medium text-slate-400 dark:text-slate-500 mb-1">Role access guide</div>
              <div className="grid grid-cols-2 gap-1">
                <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg px-2 py-1.5">
                  <div className="font-semibold text-slate-700 dark:text-slate-300">Owner / Manager</div>
                  <div className="text-slate-400 dark:text-slate-500">Full access → Dashboard</div>
                </div>
                <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg px-2 py-1.5">
                  <div className="font-semibold text-slate-700 dark:text-slate-300">Cashier</div>
                  <div className="text-slate-400 dark:text-slate-500">POS, Cash, Customers</div>
                </div>
                <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg px-2 py-1.5">
                  <div className="font-semibold text-slate-700 dark:text-slate-300">Print Operator</div>
                  <div className="text-slate-400 dark:text-slate-500">Print job queue</div>
                </div>
                <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg px-2 py-1.5">
                  <div className="font-semibold text-slate-700 dark:text-slate-300">Inv. Officer</div>
                  <div className="text-slate-400 dark:text-slate-500">Inventory & Suppliers</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
