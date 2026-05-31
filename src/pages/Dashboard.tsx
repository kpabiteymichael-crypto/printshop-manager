import { useEffect, useState } from 'react';
import { dashboardApi } from '../lib/api';
import { LayoutDashboard, ShoppingCart, Printer, Package, Users, AlertTriangle, TrendingUp, Wallet } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import clsx from 'clsx';

interface Summary {
  todaySales: { count: number; total: number };
  todayExpenses: number;
  pendingJobs: number;
  inProgressJobs: number;
  totalCustomers: number;
  lowStockItems: number;
  hasOpenSession: boolean;
  openSession: any;
  monthlySales: { date: string; total: string; count: number }[];
}

function StatCard({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div className="card flex items-center gap-4 dark:bg-slate-800 dark:border-slate-700/50">
      <div className={clsx('w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0', color)}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-bold text-slate-900 dark:text-white">{value}</div>
        <div className="text-sm text-slate-500 dark:text-slate-400 font-medium">{label}</div>
        {sub && <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    dashboardApi.summary()
      .then(setSummary)
      .catch(() => setError('Failed to load dashboard'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (error) return (
    <div className="p-6 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-2xl border border-red-200 dark:border-red-800">{error}</div>
  );

  const php = (v: number) => `₱${v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const chartData = summary?.monthlySales.map(d => ({
    date: new Date(d.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }),
    sales: parseFloat(d.total),
    orders: d.count,
  })) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title dark:text-white">Dashboard</h1>
        <p className="page-subtitle dark:text-slate-400">Today's overview — {new Date().toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
      </div>

      {!summary?.hasOpenSession && (
        <div className="flex items-center gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl text-amber-700 dark:text-amber-400">
          <AlertTriangle size={18} className="flex-shrink-0" />
          <div>
            <div className="font-semibold text-sm">No active cash session</div>
            <div className="text-xs mt-0.5">Go to <a href="/cash" className="underline font-semibold">Cash Management</a> to open a session before processing sales.</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<ShoppingCart size={22} className="text-indigo-600" />}
          label="Today's Sales"
          value={php(summary?.todaySales.total ?? 0)}
          sub={`${summary?.todaySales.count ?? 0} transactions`}
          color="bg-indigo-50 dark:bg-indigo-900/30"
        />
        <StatCard
          icon={<Wallet size={22} className="text-emerald-600" />}
          label="Net Today"
          value={php((summary?.todaySales.total ?? 0) - (summary?.todayExpenses ?? 0))}
          sub={`Expenses: ${php(summary?.todayExpenses ?? 0)}`}
          color="bg-emerald-50 dark:bg-emerald-900/30"
        />
        <StatCard
          icon={<Printer size={22} className="text-orange-600" />}
          label="Active Print Jobs"
          value={(summary?.inProgressJobs ?? 0) + (summary?.pendingJobs ?? 0)}
          sub={`${summary?.pendingJobs ?? 0} pending, ${summary?.inProgressJobs ?? 0} in progress`}
          color="bg-orange-50 dark:bg-orange-900/30"
        />
        <StatCard
          icon={<Package size={22} className="text-red-600" />}
          label="Low Stock Items"
          value={summary?.lowStockItems ?? 0}
          sub={summary?.lowStockItems ? 'Needs restocking' : 'All good'}
          color="bg-red-50 dark:bg-red-900/30"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card dark:bg-slate-800 dark:border-slate-700/50">
          <div className="flex items-center justify-between mb-4">
            <h2 className="section-title mb-0 dark:text-white">Sales Trend (30 days)</h2>
            <TrendingUp size={18} className="text-slate-400" />
          </div>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
                <defs>
                  <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} tickFormatter={v => `₱${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => php(v)} />
                <Area type="monotone" dataKey="sales" stroke="#4f46e5" strokeWidth={2} fill="url(#salesGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-48 text-slate-400 dark:text-slate-500 text-sm">No sales data yet</div>
          )}
        </div>

        <div className="card dark:bg-slate-800 dark:border-slate-700/50">
          <h2 className="section-title dark:text-white">Quick Stats</h2>
          <div className="space-y-4">
            {[
              { label: 'Total Customers', value: summary?.totalCustomers ?? 0, icon: <Users size={16} />, color: 'text-blue-500' },
              { label: 'Pending Print Jobs', value: summary?.pendingJobs ?? 0, icon: <Printer size={16} />, color: 'text-amber-500' },
              { label: 'In-Progress Jobs', value: summary?.inProgressJobs ?? 0, icon: <Printer size={16} />, color: 'text-indigo-500' },
              { label: 'Low Stock Alerts', value: summary?.lowStockItems ?? 0, icon: <Package size={16} />, color: 'text-red-500' },
            ].map(s => (
              <div key={s.label} className="flex items-center justify-between py-2 border-b border-slate-50 dark:border-slate-700/50 last:border-0">
                <div className="flex items-center gap-2.5 text-sm text-slate-600 dark:text-slate-300">
                  <span className={s.color}>{s.icon}</span>
                  {s.label}
                </div>
                <span className="font-bold text-slate-900 dark:text-white">{s.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
