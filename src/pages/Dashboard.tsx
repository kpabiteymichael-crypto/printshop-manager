import { useEffect, useState, useCallback } from 'react';
import { dashboardApi, analyticsApi } from '../lib/api';
import {
  ShoppingCart, Printer, Package, Users, AlertTriangle, TrendingUp,
  Wallet, BarChart2, TrendingDown, DollarSign, Lightbulb, RefreshCw,
  CreditCard, ArrowUp, ArrowDown,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend, ComposedChart, Line,
} from 'recharts';
import clsx from 'clsx';

const fmt = (v: number) => `₵${Math.abs(v).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const SEVERITY_STYLE = {
  info: 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300',
  warning: 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300',
  alert: 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300',
};
const SEVERITY_ICON = {
  info: 'text-blue-500',
  warning: 'text-amber-500',
  alert: 'text-red-500',
};

interface Insight { type: string; severity: 'info' | 'warning' | 'alert'; message: string; metric?: string }

function InsightsPanel() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    analyticsApi.insights()
      .then(d => { setInsights(d.insights ?? []); setLastUpdated(new Date(d.generatedAt)); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="card dark:bg-slate-800 dark:border-slate-700/50">
      <div className="flex items-center justify-between mb-4">
        <h2 className="section-title mb-0 dark:text-white flex items-center gap-2">
          <Lightbulb size={16} className="text-amber-500" /> AI Insights
        </h2>
        <div className="flex items-center gap-2">
          {lastUpdated && <span className="text-xs text-slate-400 dark:text-slate-500 hidden sm:block">Updated {lastUpdated.toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit' })}</span>}
          <button onClick={load} disabled={loading} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors" title="Refresh insights">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <div key={i} className="h-14 rounded-xl bg-slate-100 dark:bg-slate-700/50 animate-pulse" />)}
        </div>
      ) : insights.length === 0 ? (
        <div className="text-center py-6 text-slate-400 dark:text-slate-500 text-sm">No insights available — add sales data to generate recommendations.</div>
      ) : (
        <div className="space-y-2">
          {insights.map((ins, i) => (
            <div key={i} className={clsx('flex items-start gap-3 p-3 rounded-xl border text-sm', SEVERITY_STYLE[ins.severity])}>
              <Lightbulb size={15} className={clsx('flex-shrink-0 mt-0.5', SEVERITY_ICON[ins.severity])} />
              <div className="flex-1 min-w-0">
                <p className="leading-snug">{ins.message}</p>
              </div>
              {ins.metric && <span className="flex-shrink-0 font-bold text-xs">{ins.metric}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProfitCard({ profit }: { profit: any }) {
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('today');
  if (!profit) return null;
  const data = profit[period];
  const periodLabels: Record<string, string> = { today: 'Today', week: 'This Week', month: 'This Month' };
  return (
    <div className="card dark:bg-slate-800 dark:border-slate-700/50">
      <div className="flex items-center justify-between mb-4">
        <h2 className="section-title mb-0 dark:text-white flex items-center gap-2">
          <DollarSign size={16} className="text-slate-400" /> Profit Summary
        </h2>
        <div className="flex rounded-lg border border-slate-200 dark:border-slate-600 overflow-hidden">
          {(['today', 'week', 'month'] as const).map(p => (
            <button key={p} onClick={() => setPeriod(p)} className={clsx('px-3 py-1 text-xs font-semibold transition-colors', period === p ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700')}>
              {periodLabels[p]}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="text-center p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl">
          <TrendingUp size={16} className="text-emerald-500 mx-auto mb-1" />
          <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{fmt(data.revenue)}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">Revenue</div>
        </div>
        <div className="text-center p-3 bg-red-50 dark:bg-red-900/20 rounded-xl">
          <TrendingDown size={16} className="text-red-500 mx-auto mb-1" />
          <div className="text-lg font-bold text-red-600 dark:text-red-400">{fmt(data.expenses)}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">Expenses</div>
        </div>
        <div className={clsx('text-center p-3 rounded-xl', data.profit >= 0 ? 'bg-indigo-50 dark:bg-indigo-900/20' : 'bg-red-50 dark:bg-red-900/20')}>
          <DollarSign size={16} className={clsx('mx-auto mb-1', data.profit >= 0 ? 'text-indigo-500' : 'text-red-500')} />
          <div className={clsx('text-lg font-bold', data.profit >= 0 ? 'text-indigo-600 dark:text-indigo-400' : 'text-red-600 dark:text-red-400')}>
            {data.profit < 0 ? '-' : ''}{fmt(data.profit)}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400">Net Profit</div>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [summary, setSummary] = useState<any>(null);
  const [revenueTrend, setRevenueTrend] = useState<any[]>([]);
  const [financialSummary, setFinancialSummary] = useState<any[]>([]);
  const [topCustomers, setTopCustomers] = useState<any[]>([]);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [trendDays, setTrendDays] = useState(30);

  useEffect(() => {
    Promise.all([
      dashboardApi.summary(),
      analyticsApi.revenueTrend(trendDays),
      analyticsApi.financialSummary(6),
      analyticsApi.topCustomers(5, 30),
      analyticsApi.topProducts(5, 30),
    ])
      .then(([s, trend, fin, customers, products]) => {
        setSummary(s);
        setRevenueTrend(trend);
        setFinancialSummary(fin);
        setTopCustomers(customers);
        setTopProducts(products);
      })
      .catch(() => setError('Failed to load dashboard'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    analyticsApi.revenueTrend(trendDays).then(setRevenueTrend).catch(() => {});
  }, [trendDays]);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (error) return (
    <div className="p-6 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-2xl border border-red-200 dark:border-red-800">{error}</div>
  );

  const chartData = revenueTrend.map(d => ({
    date: new Date(d.date).toLocaleDateString('en-GH', { month: 'short', day: 'numeric' }),
    revenue: d.revenue,
    expenses: d.expenses,
    orders: d.orders,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title dark:text-white">Dashboard</h1>
        <p className="page-subtitle dark:text-slate-400">Today's overview — {new Date().toLocaleDateString('en-GH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
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

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {[
          { icon: <ShoppingCart size={18} className="text-indigo-600" />, label: "Today's Sales", value: fmt(summary?.todaySales.total ?? 0), sub: `${summary?.todaySales.count ?? 0} orders`, color: 'bg-indigo-50 dark:bg-indigo-900/30' },
          { icon: <Wallet size={18} className="text-emerald-600" />, label: 'Monthly Revenue', value: fmt(summary?.profit?.month?.revenue ?? 0), sub: 'this month', color: 'bg-emerald-50 dark:bg-emerald-900/30' },
          { icon: <DollarSign size={18} className="text-purple-600" />, label: 'Net Profit', value: fmt(summary?.profit?.month?.profit ?? 0), sub: 'this month', color: 'bg-purple-50 dark:bg-purple-900/30' },
          { icon: <Printer size={18} className="text-orange-600" />, label: 'Print Jobs', value: (summary?.inProgressJobs ?? 0) + (summary?.pendingJobs ?? 0), sub: 'active', color: 'bg-orange-50 dark:bg-orange-900/30' },
          { icon: <Package size={18} className="text-red-600" />, label: 'Inv. Value', value: fmt(summary?.inventoryValue ?? 0), sub: `${(summary?.lowStockItems ?? 0)} low stock`, color: 'bg-red-50 dark:bg-red-900/30' },
          { icon: <CreditCard size={18} className="text-rose-600" />, label: 'Outstanding Debts', value: fmt(summary?.outstandingDebts ?? 0), sub: 'open credit balance', color: 'bg-rose-50 dark:bg-rose-900/30' },
        ].map(c => (
          <div key={c.label} className="card dark:bg-slate-800 dark:border-slate-700/50 flex items-start gap-3 p-4">
            <div className={clsx('w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0', c.color)}>
              {c.icon}
            </div>
            <div className="min-w-0">
              <div className="text-lg font-bold text-slate-900 dark:text-white leading-tight truncate">{c.value}</div>
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-0.5">{c.label}</div>
              {c.sub && <div className="text-[11px] text-slate-400 dark:text-slate-500">{c.sub}</div>}
            </div>
          </div>
        ))}
      </div>

      {/* Profit Summary */}
      {summary?.profit && <ProfitCard profit={summary.profit} />}

      {/* Revenue vs Expenses Trend */}
      <div className="card dark:bg-slate-800 dark:border-slate-700/50">
        <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
          <h2 className="section-title mb-0 dark:text-white flex items-center gap-2">
            <TrendingUp size={16} className="text-indigo-500" /> Revenue vs Expenses
          </h2>
          <div className="flex rounded-lg border border-slate-200 dark:border-slate-600 overflow-hidden">
            {([{ v: 1, label: 'Today' }, { v: 7, label: '7d' }, { v: 30, label: '30d' }, { v: 365, label: '12m' }]).map(({ v, label }) => (
              <button key={v} onClick={() => setTrendDays(v)} className={clsx('px-3 py-1 text-xs font-semibold transition-colors', trendDays === v ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700')}>
                {label}
              </button>
            ))}
          </div>
        </div>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:stroke-slate-700" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} />
              <YAxis tick={{ fontSize: 10 }} tickLine={false} tickFormatter={v => `₵${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                formatter={(v: number, name: string) => [fmt(v), name === 'revenue' ? 'Revenue' : 'Expenses']}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              <Legend formatter={v => v === 'revenue' ? 'Revenue' : 'Expenses'} />
              <Area type="monotone" dataKey="revenue" stroke="#4f46e5" strokeWidth={2} fill="url(#revGrad)" />
              <Bar dataKey="expenses" fill="#ef4444" opacity={0.7} radius={[2, 2, 0, 0]} />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-48 text-slate-400 dark:text-slate-500 text-sm">No sales data yet</div>
        )}
      </div>

      {/* Financial Summary + AI Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 6-Month P&L */}
        <div className="card dark:bg-slate-800 dark:border-slate-700/50">
          <h2 className="section-title dark:text-white mb-4 flex items-center gap-2">
            <BarChart2 size={16} className="text-indigo-500" /> 6-Month P&amp;L
          </h2>
          {financialSummary.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={financialSummary} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:stroke-slate-700" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} tickLine={false} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} tickFormatter={v => `₵${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number, name: string) => [fmt(v), name.charAt(0).toUpperCase() + name.slice(1)]} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                <Legend />
                <Bar dataKey="revenue" fill="#4f46e5" radius={[2, 2, 0, 0]} />
                <Bar dataKey="expenses" fill="#ef4444" radius={[2, 2, 0, 0]} />
                <Bar dataKey="profit" fill="#10b981" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-48 text-slate-400 dark:text-slate-500 text-sm">No data available</div>
          )}
        </div>

        {/* AI Insights */}
        <InsightsPanel />
      </div>

      {/* Top Customers & Best-Selling Items */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card dark:bg-slate-800 dark:border-slate-700/50">
          <h2 className="section-title dark:text-white mb-4 flex items-center gap-2">
            <Users size={16} className="text-indigo-500" /> Top Customers (30d)
          </h2>
          {topCustomers.length === 0 ? (
            <div className="text-center py-6 text-slate-400 dark:text-slate-500 text-sm">No customer sales data yet</div>
          ) : (
            <div className="space-y-3">
              {topCustomers.map((c: any, i) => (
                <div key={c.id} className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 text-xs font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-900 dark:text-white truncate">{c.name}</div>
                    <div className="text-xs text-slate-400 dark:text-slate-500">{Number(c.total_orders)} orders</div>
                  </div>
                  <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400">{fmt(parseFloat(c.total_spent))}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card dark:bg-slate-800 dark:border-slate-700/50">
          <h2 className="section-title dark:text-white mb-4 flex items-center gap-2">
            <ShoppingCart size={16} className="text-indigo-500" /> Best Sellers (30d)
          </h2>
          {topProducts.length === 0 ? (
            <div className="text-center py-6 text-slate-400 dark:text-slate-500 text-sm">No sales data yet</div>
          ) : (
            <div className="space-y-3">
              {topProducts.map((p: any, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-900 dark:text-white truncate">{p.product_name || p.description}</div>
                    <div className="text-xs text-slate-400 dark:text-slate-500">Qty: {Number(p.total_quantity)}</div>
                  </div>
                  <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{fmt(parseFloat(p.total_revenue))}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
