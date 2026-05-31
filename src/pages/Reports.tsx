import { useEffect, useState } from 'react';
import { reportsApi } from '../lib/api';
import { BarChart3, TrendingUp, ShoppingBag, Printer, RefreshCw } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const php = (v: number) => `₱${v.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;

export default function Reports() {
  const [data, setData] = useState<any>(null);
  const [jobsData, setJobsData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const today = new Date();
  const [from, setFrom] = useState(new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0]);
  const [to, setTo] = useState(today.toISOString().split('T')[0]);

  const load = () => {
    setLoading(true);
    Promise.all([reportsApi.salesSummary(from, to), reportsApi.printJobsSummary()])
      .then(([s, j]) => { setData(s); setJobsData(j); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const chartData = data?.dailySales.map((d: any) => ({
    date: new Date(d.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }),
    sales: parseFloat(d.total),
    orders: d.count,
  })) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="page-title dark:text-white flex items-center gap-2"><BarChart3 size={24} className="text-indigo-600" /> Reports</h1>
          <p className="page-subtitle dark:text-slate-400">Sales and performance analytics</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="input text-sm w-36 dark:bg-slate-800 dark:border-slate-600 dark:text-white" />
          <span className="text-slate-400 dark:text-slate-500 text-sm">to</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className="input text-sm w-36 dark:bg-slate-800 dark:border-slate-600 dark:text-white" />
          <button onClick={load} className="btn-primary flex items-center gap-1.5 text-sm px-3 py-2"><RefreshCw size={14} /> Apply</button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48"><div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {[
              { label: 'Total Sales', value: php(data?.summary.totalSales ?? 0), icon: <ShoppingBag size={18} />, color: 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400' },
              { label: 'Total Orders', value: String(data?.summary.totalOrders ?? 0), icon: <BarChart3 size={18} />, color: 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' },
              { label: 'Avg. Order', value: php(data?.summary.avgOrder ?? 0), icon: <TrendingUp size={18} />, color: 'bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400' },
              { label: 'Total Expenses', value: php(data?.summary.totalExpenses ?? 0), icon: <BarChart3 size={18} />, color: 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400' },
              { label: 'Net Revenue', value: php(data?.summary.netRevenue ?? 0), icon: <TrendingUp size={18} />, color: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' },
            ].map(s => (
              <div key={s.label} className="card dark:bg-slate-800 dark:border-slate-700/50">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${s.color}`}>{s.icon}</div>
                <div className="text-xl font-bold text-slate-900 dark:text-white">{s.value}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card dark:bg-slate-800 dark:border-slate-700/50">
              <h2 className="section-title dark:text-white mb-4">Daily Sales</h2>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} />
                    <YAxis tick={{ fontSize: 11 }} tickLine={false} tickFormatter={v => `₱${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: number) => php(v)} />
                    <Bar dataKey="sales" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <div className="flex items-center justify-center h-48 text-slate-400 dark:text-slate-500 text-sm">No data for selected period</div>}
            </div>

            <div className="card dark:bg-slate-800 dark:border-slate-700/50">
              <h2 className="section-title dark:text-white mb-4">Top Products / Services</h2>
              <div className="space-y-3 max-h-60 overflow-y-auto">
                {(data?.topProducts ?? []).length === 0 ? (
                  <div className="text-center py-8 text-slate-400 dark:text-slate-500 text-sm">No data for selected period</div>
                ) : data?.topProducts.map((p: any, i: number) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 text-xs font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-900 dark:text-white truncate">{p.description}</div>
                      <div className="text-xs text-slate-400 dark:text-slate-500">Qty: {p.totalQuantity}</div>
                    </div>
                    <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400">{php(parseFloat(p.totalRevenue))}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {jobsData && (
            <div className="card dark:bg-slate-800 dark:border-slate-700/50">
              <h2 className="section-title dark:text-white mb-4 flex items-center gap-2"><Printer size={18} className="text-indigo-600" /> Print Jobs Summary</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {(jobsData.byStatus ?? []).map((s: any) => (
                  <div key={s.status} className="text-center p-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
                    <div className="text-2xl font-bold text-slate-900 dark:text-white">{s.count}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 capitalize mt-0.5">{s.status.replace('_', ' ')}</div>
                    <div className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 mt-1">{s.total ? php(parseFloat(s.total)) : '₱0.00'}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
