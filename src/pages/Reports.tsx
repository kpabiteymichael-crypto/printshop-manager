import { useEffect, useState } from 'react';
import { reportsApi } from '../lib/api';
import {
  BarChart3, TrendingUp, ShoppingBag, Printer, RefreshCw,
  Download, FileSpreadsheet, Users, CreditCard, UserCog, Package,
  DollarSign, Calendar,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import clsx from 'clsx';

const fmt = (v: number) => `₵${Number(v).toLocaleString('en-GH', { minimumFractionDigits: 2 })}`;

interface ReportType {
  id: string;
  label: string;
  icon: React.ReactNode;
  description: string;
  hasDateRange: boolean;
}

const REPORT_TYPES: ReportType[] = [
  { id: 'daily-sales', label: 'Daily Sales', icon: <Calendar size={16} />, description: 'Sales breakdown by day', hasDateRange: true },
  { id: 'weekly-sales', label: 'Weekly Sales', icon: <TrendingUp size={16} />, description: 'Sales grouped by week', hasDateRange: true },
  { id: 'monthly-sales', label: 'Monthly Sales', icon: <BarChart3 size={16} />, description: 'Monthly revenue trends', hasDateRange: true },
  { id: 'pnl', label: 'P&L Statement', icon: <DollarSign size={16} />, description: 'Revenue vs expenses vs profit', hasDateRange: true },
  { id: 'inventory', label: 'Inventory', icon: <Package size={16} />, description: 'Stock levels and values', hasDateRange: false },
  { id: 'cash-flow', label: 'Cash Flow', icon: <TrendingUp size={16} />, description: 'Daily cash in and out', hasDateRange: true },
  { id: 'customer', label: 'Customers', icon: <Users size={16} />, description: 'Customer purchase history', hasDateRange: true },
  { id: 'debtors', label: 'Debtors', icon: <CreditCard size={16} />, description: 'Outstanding credit balances', hasDateRange: false },
  { id: 'staff-performance', label: 'Staff Performance', icon: <UserCog size={16} />, description: 'Sales and jobs per staff', hasDateRange: true },
  { id: 'print-jobs', label: 'Print Jobs', icon: <Printer size={16} />, description: 'Print job history and revenue', hasDateRange: true },
];

const numericTypes = ['revenue', 'expenses', 'profit', 'total_amount', 'stock_value', 'paid_amount', 'balance', 'amount',
  'total_spent', 'avg_order', 'total_sales', 'revenue_generated', 'cost_price', 'selling_price'];

function renderCell(col: string, val: any) {
  const key = col.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  if (val === null || val === undefined) return '—';
  if (typeof val === 'object' && val instanceof Date) return val.toLocaleDateString('en-GH');
  if (typeof val === 'string' && val.match(/^\d{4}-\d{2}-\d{2}T/)) return new Date(val).toLocaleDateString('en-GH');
  if (numericTypes.some(t => key.includes(t)) && !isNaN(Number(val))) return fmt(Number(val));
  return String(val);
}

export default function Reports() {
  const [activeReport, setActiveReport] = useState<string>('daily-sales');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);

  const today = new Date();
  const [from, setFrom] = useState(new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0]);
  const [to, setTo] = useState(today.toISOString().split('T')[0]);

  const activeType = REPORT_TYPES.find(r => r.id === activeReport)!;

  const generate = () => {
    setLoading(true);
    setGenerated(false);
    reportsApi.generate(activeReport, activeType.hasDateRange ? from : undefined, activeType.hasDateRange ? to : undefined)
      .then(d => { setData(d); setGenerated(true); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  const handleExport = (format: 'csv' | 'xlsx') => {
    const token = localStorage.getItem('ps_token');
    const url = reportsApi.exportUrl(activeReport, activeType.hasDateRange ? from : undefined, activeType.hasDateRange ? to : undefined, format);
    const a = document.createElement('a');
    a.href = url;
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.blob())
      .then(blob => {
        const objUrl = URL.createObjectURL(blob);
        a.href = objUrl;
        a.download = `${activeReport}-report.${format}`;
        a.click();
        URL.revokeObjectURL(objUrl);
      });
  };

  const chartData = data?.rows?.slice(0, 30).map((r: any) => ({
    name: r.period || r.date || r.name || r['Period'] || r['Date'] || r['Name'] || '',
    revenue: Number(r.revenue || r['Revenue'] || 0),
    expenses: Number(r.expenses || r['Expenses'] || 0),
    profit: Number(r.profit || r['Net Profit'] || 0),
    orders: Number(r.orders || r['Orders'] || 0),
  })) ?? [];

  const hasChart = ['daily-sales', 'weekly-sales', 'monthly-sales', 'pnl'].includes(activeReport) && chartData.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title dark:text-white flex items-center gap-2"><BarChart3 size={24} className="text-indigo-600" /> Reports</h1>
        <p className="page-subtitle dark:text-slate-400">Generate and export business reports</p>
      </div>

      <div className="flex gap-6 flex-col lg:flex-row">
        {/* Sidebar */}
        <div className="lg:w-56 flex-shrink-0">
          <div className="card dark:bg-slate-800 dark:border-slate-700/50 p-2">
            <div className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider px-2 mb-2">Report Types</div>
            <nav className="space-y-0.5">
              {REPORT_TYPES.map(rt => (
                <button
                  key={rt.id}
                  onClick={() => { setActiveReport(rt.id); setData(null); setGenerated(false); }}
                  className={clsx(
                    'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors text-left',
                    activeReport === rt.id
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/60'
                  )}
                >
                  {rt.icon}
                  {rt.label}
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* Main Panel */}
        <div className="flex-1 space-y-4">
          {/* Config */}
          <div className="card dark:bg-slate-800 dark:border-slate-700/50">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">{activeType.icon}{activeType.label}</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{activeType.description}</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {activeType.hasDateRange && (
                  <>
                    <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="input text-sm w-36 dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
                    <span className="text-slate-400 dark:text-slate-500 text-sm">to</span>
                    <input type="date" value={to} onChange={e => setTo(e.target.value)} className="input text-sm w-36 dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
                  </>
                )}
                <button onClick={generate} disabled={loading} className="btn-primary flex items-center gap-1.5 text-sm px-3 py-2">
                  <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Generate
                </button>
              </div>
            </div>

            {generated && (
              <div className="flex gap-2 mt-4 pt-4 border-t border-slate-100 dark:border-slate-700">
                <button onClick={() => handleExport('csv')} className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 rounded-xl hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors">
                  <Download size={14} /> CSV
                </button>
                <button onClick={() => handleExport('xlsx')} className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 rounded-xl hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors">
                  <FileSpreadsheet size={14} /> Excel
                </button>
                <button onClick={() => handleExport('pdf' as any)} className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-xl hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors">
                  <Download size={14} /> PDF
                </button>
              </div>
            )}
          </div>

          {/* Chart */}
          {hasChart && (
            <div className="card dark:bg-slate-800 dark:border-slate-700/50">
              <h3 className="section-title dark:text-white mb-4">{activeType.label} Chart</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:stroke-slate-700" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} tickLine={false} />
                  <YAxis tick={{ fontSize: 10 }} tickLine={false} tickFormatter={v => `₵${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                  {(activeReport === 'pnl') ? (
                    <>
                      <Bar dataKey="revenue" fill="#4f46e5" radius={[2, 2, 0, 0]} name="Revenue" />
                      <Bar dataKey="expenses" fill="#ef4444" radius={[2, 2, 0, 0]} name="Expenses" />
                      <Bar dataKey="profit" fill="#10b981" radius={[2, 2, 0, 0]} name="Profit" />
                    </>
                  ) : (
                    <Bar dataKey="revenue" fill="#4f46e5" radius={[2, 2, 0, 0]} name="Revenue" />
                  )}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Table */}
          {loading ? (
            <div className="card dark:bg-slate-800 dark:border-slate-700/50 flex items-center justify-center h-48">
              <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : generated && data ? (
            <div className="card dark:bg-slate-800 dark:border-slate-700/50 overflow-hidden p-0">
              <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
                <h3 className="font-semibold text-slate-900 dark:text-white text-sm">{data.title}</h3>
                <span className="text-xs text-slate-400 dark:text-slate-500">{data.rows?.length ?? 0} rows</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-700/30 border-b border-slate-100 dark:border-slate-700">
                      {(data.columns ?? []).map((col: string) => (
                        <th key={col} className="px-3 py-2.5 text-left font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(data.rows ?? []).length === 0 ? (
                      <tr><td colSpan={data.columns?.length ?? 1} className="text-center py-8 text-slate-400 dark:text-slate-500">No data for selected period</td></tr>
                    ) : (data.rows ?? []).map((row: any, i: number) => (
                      <tr key={i} className="border-b border-slate-50 dark:border-slate-700/30 hover:bg-slate-50 dark:hover:bg-slate-700/20">
                        {(data.columns ?? []).map((col: string, j: number) => {
                          const rowKeys = Object.keys(row);
                          const val = row[col] ?? row[rowKeys[j]];
                          return <td key={j} className="px-3 py-2.5 text-slate-700 dark:text-slate-200 whitespace-nowrap">{renderCell(col, val)}</td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : !generated && (
            <div className="card dark:bg-slate-800 dark:border-slate-700/50 flex flex-col items-center justify-center h-48 text-slate-400 dark:text-slate-500">
              <BarChart3 size={36} className="mb-3 opacity-40" />
              <p className="text-sm">Select a report type and click <strong>Generate</strong></p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
