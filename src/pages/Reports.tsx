import { useEffect, useState } from 'react';
import { reportsApi } from '../lib/api';
import {
  BarChart3, TrendingUp, ShoppingBag, Printer, RefreshCw,
  Download, FileSpreadsheet, Users, CreditCard, UserCog, Package,
  DollarSign, Calendar, TrendingDown, ArrowUpDown,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import clsx from 'clsx';

const fmt = (v: number) => `₵${Number(v).toLocaleString('en-GH', { minimumFractionDigits: 2 })}`;
const fmtN = (v: any) => Number(v ?? 0);

interface ReportType {
  id: string;
  label: string;
  icon: React.ReactNode;
  description: string;
  hasDateRange: boolean;
}

const REPORT_TYPES: ReportType[] = [
  { id: 'daily-sales',       label: 'Daily Sales',       icon: <Calendar size={16} />,       description: 'Sales breakdown by day',                hasDateRange: true },
  { id: 'weekly-sales',      label: 'Weekly Sales',      icon: <TrendingUp size={16} />,      description: 'Sales grouped by week',                 hasDateRange: true },
  { id: 'monthly-sales',     label: 'Monthly Sales',     icon: <BarChart3 size={16} />,       description: 'Monthly revenue trends',                hasDateRange: true },
  { id: 'pnl',               label: 'P&L Statement',     icon: <DollarSign size={16} />,      description: 'Revenue vs expenses vs profit',         hasDateRange: true },
  { id: 'profit-analysis',   label: 'Profit Analysis',   icon: <TrendingUp size={16} />,      description: 'Per-product profit, margin & net position', hasDateRange: true },
  { id: 'inventory',         label: 'Inventory',         icon: <Package size={16} />,         description: 'Stock levels and values',               hasDateRange: false },
  { id: 'cash-flow',         label: 'Cash Flow',         icon: <TrendingUp size={16} />,      description: 'Daily cash in and out',                 hasDateRange: true },
  { id: 'customer',          label: 'Customers',         icon: <Users size={16} />,           description: 'Customer purchase history',             hasDateRange: true },
  { id: 'debtors',           label: 'Debtors',           icon: <CreditCard size={16} />,      description: 'Outstanding credit balances',           hasDateRange: false },
  { id: 'staff-performance', label: 'Staff Performance', icon: <UserCog size={16} />,         description: 'Sales and jobs per staff',              hasDateRange: true },
  { id: 'print-jobs',        label: 'Print Jobs',        icon: <Printer size={16} />,         description: 'Print job history and revenue',         hasDateRange: true },
];

const MONEY_COLS = new Set([
  'revenue', 'expenses', 'profit', 'total_amount', 'stock_value', 'paid_amount', 'balance',
  'amount', 'total_spent', 'avg_order', 'total_sales', 'revenue_generated', 'cost_price',
  'selling_price', 'cogs', 'gross_profit', 'restock_cost', 'net_profit', 'margin_per_unit',
]);

function renderCell(col: string, val: any) {
  const key = col.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  if (val === null || val === undefined) return '—';
  if (typeof val === 'object' && val instanceof Date) return val.toLocaleDateString('en-GH');
  if (typeof val === 'string' && val.match(/^\d{4}-\d{2}-\d{2}T/)) return new Date(val).toLocaleDateString('en-GH');
  if (MONEY_COLS.has(key) && !isNaN(Number(val))) return fmt(Number(val));
  return String(val);
}

interface SummaryKpiProps { label: string; value: number; sub?: string; color: string; icon: React.ReactNode }
function SummaryKpi({ label, value, sub, color, icon }: SummaryKpiProps) {
  const pos = value >= 0;
  return (
    <div className={clsx('rounded-2xl p-4 border', color)}>
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs font-semibold uppercase tracking-wide opacity-70">{label}</span>
      </div>
      <div className={clsx('text-xl font-black', pos ? '' : 'text-red-600 dark:text-red-400')}>{fmt(value)}</div>
      {sub && <div className="text-xs mt-0.5 opacity-60">{sub}</div>}
    </div>
  );
}

type SortDir = 'asc' | 'desc';

function ProfitAnalysisTable({ data }: { data: any }) {
  const { summary, rows } = data;
  const [sortCol, setSortCol] = useState<string>('gross_profit');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const sorted = [...(rows ?? [])].sort((a, b) => {
    const av = Number(a[sortCol] ?? 0);
    const bv = Number(b[sortCol] ?? 0);
    return sortDir === 'desc' ? bv - av : av - bv;
  });

  const toggleSort = (col: string) => {
    if (sortCol === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortCol(col); setSortDir('desc'); }
  };

  const ColHeader = ({ col, label }: { col: string; label: string }) => (
    <th
      onClick={() => toggleSort(col)}
      className="px-3 py-2.5 text-right font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 select-none"
    >
      <span className="inline-flex items-center gap-1 justify-end">
        {label}
        <ArrowUpDown size={10} className={sortCol === col ? 'text-indigo-500' : 'opacity-30'} />
      </span>
    </th>
  );

  return (
    <div className="space-y-4">
      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
        <SummaryKpi
          label="Revenue from Sales"
          value={fmtN(summary?.totalRevenue)}
          sub={`${summary?.productCount ?? 0} products`}
          color="border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300"
          icon={<ShoppingBag size={14} className="text-blue-500" />}
        />
        <SummaryKpi
          label="Cost of Goods Sold"
          value={fmtN(summary?.totalCogs)}
          sub="Based on units sold"
          color="border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
          icon={<Package size={14} className="text-slate-500" />}
        />
        <SummaryKpi
          label="Gross Profit"
          value={fmtN(summary?.totalGrossProfit)}
          sub="Revenue − COGS"
          color="border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-300"
          icon={<TrendingUp size={14} className="text-emerald-500" />}
        />
        <SummaryKpi
          label="Restock Cost"
          value={fmtN(summary?.totalRestockCost)}
          sub="Cost of current stock"
          color="border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300"
          icon={<TrendingDown size={14} className="text-amber-500" />}
        />
        <SummaryKpi
          label="Net Profit"
          value={fmtN(summary?.totalNetProfit)}
          sub="Gross profit − Restock"
          color={fmtN(summary?.totalNetProfit) >= 0
            ? 'border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-800 dark:text-indigo-300'
            : 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300'}
          icon={<DollarSign size={14} className={fmtN(summary?.totalNetProfit) >= 0 ? 'text-indigo-500' : 'text-red-500'} />}
        />
      </div>

      {/* Per-product Table */}
      <div className="card dark:bg-slate-800 dark:border-slate-700/50 overflow-hidden p-0">
        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
          <h3 className="font-semibold text-slate-900 dark:text-white text-sm flex items-center gap-2">
            <TrendingUp size={14} className="text-indigo-500" /> Per-Product Breakdown
          </h3>
          <span className="text-xs text-slate-400 dark:text-slate-500">{sorted.length} products</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-700/30 border-b border-slate-100 dark:border-slate-700">
                <th className="px-3 py-2.5 text-left font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Product</th>
                <th className="px-3 py-2.5 text-left font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Category</th>
                <ColHeader col="cost_price"    label="Cost" />
                <ColHeader col="selling_price" label="Price" />
                <ColHeader col="margin_pct"    label="Margin %" />
                <ColHeader col="units_sold"    label="Sold" />
                <ColHeader col="revenue"       label="Revenue" />
                <ColHeader col="cogs"          label="COGS" />
                <ColHeader col="gross_profit"  label="Gross Profit" />
                <ColHeader col="current_stock" label="Stock" />
                <ColHeader col="restock_cost"  label="Restock Cost" />
                <ColHeader col="net_profit"    label="Net Profit" />
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr><td colSpan={12} className="text-center py-8 text-slate-400 dark:text-slate-500">No products found</td></tr>
              ) : sorted.map((row: any, i: number) => {
                const gp = fmtN(row.gross_profit);
                const np = fmtN(row.net_profit);
                const marginPct = fmtN(row.margin_pct);
                return (
                  <tr key={i} className="border-b border-slate-50 dark:border-slate-700/30 hover:bg-slate-50 dark:hover:bg-slate-700/20">
                    <td className="px-3 py-2.5 text-slate-900 dark:text-white font-medium whitespace-nowrap">
                      <div>{row.name}</div>
                      <div className="text-slate-400 dark:text-slate-500 text-[10px]">{row.sku}</div>
                    </td>
                    <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400 whitespace-nowrap">{row.category}</td>
                    <td className="px-3 py-2.5 text-right text-slate-700 dark:text-slate-200 whitespace-nowrap">{fmt(fmtN(row.cost_price))}</td>
                    <td className="px-3 py-2.5 text-right text-slate-700 dark:text-slate-200 whitespace-nowrap">{fmt(fmtN(row.selling_price))}</td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      <span className={clsx('font-semibold', marginPct >= 30 ? 'text-emerald-600 dark:text-emerald-400' : marginPct >= 10 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400')}>
                        {marginPct}%
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right text-slate-700 dark:text-slate-200">{Number(row.units_sold).toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right text-slate-700 dark:text-slate-200 whitespace-nowrap">{fmt(fmtN(row.revenue))}</td>
                    <td className="px-3 py-2.5 text-right text-slate-500 dark:text-slate-400 whitespace-nowrap">{fmt(fmtN(row.cogs))}</td>
                    <td className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">
                      <span className={gp >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>
                        {fmt(gp)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right text-slate-700 dark:text-slate-200">{Number(row.current_stock).toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right text-amber-600 dark:text-amber-400 whitespace-nowrap">{fmt(fmtN(row.restock_cost))}</td>
                    <td className="px-3 py-2.5 text-right font-bold whitespace-nowrap">
                      <span className={np >= 0 ? 'text-indigo-600 dark:text-indigo-400' : 'text-red-600 dark:text-red-400'}>
                        {fmt(np)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-slate-50 dark:bg-slate-700/30 border-t-2 border-slate-200 dark:border-slate-600">
              <tr>
                <td colSpan={6} className="px-3 py-2.5 font-bold text-slate-700 dark:text-slate-200 text-xs uppercase tracking-wide">Totals</td>
                <td className="px-3 py-2.5 text-right font-bold text-blue-700 dark:text-blue-300 text-xs whitespace-nowrap">{fmt(fmtN(summary?.totalRevenue))}</td>
                <td className="px-3 py-2.5 text-right font-bold text-slate-600 dark:text-slate-300 text-xs whitespace-nowrap">{fmt(fmtN(summary?.totalCogs))}</td>
                <td className="px-3 py-2.5 text-right font-bold text-emerald-700 dark:text-emerald-300 text-xs whitespace-nowrap">{fmt(fmtN(summary?.totalGrossProfit))}</td>
                <td className="px-3 py-2.5" />
                <td className="px-3 py-2.5 text-right font-bold text-amber-700 dark:text-amber-300 text-xs whitespace-nowrap">{fmt(fmtN(summary?.totalRestockCost))}</td>
                <td className="px-3 py-2.5 text-right font-bold text-xs whitespace-nowrap">
                  <span className={fmtN(summary?.totalNetProfit) >= 0 ? 'text-indigo-700 dark:text-indigo-300' : 'text-red-700 dark:text-red-300'}>
                    {fmt(fmtN(summary?.totalNetProfit))}
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
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

  const handleExport = (format: 'csv' | 'xlsx' | 'pdf') => {
    const token = localStorage.getItem('ps_token');
    const url = reportsApi.exportUrl(activeReport, activeType.hasDateRange ? from : undefined, activeType.hasDateRange ? to : undefined, format);
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.blob())
      .then(blob => {
        const objUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
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
  const isProfitAnalysis = activeReport === 'profit-analysis';

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
                <button onClick={() => handleExport('pdf')} className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-xl hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors">
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
                  {activeReport === 'pnl' ? (
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

          {/* Content */}
          {loading ? (
            <div className="card dark:bg-slate-800 dark:border-slate-700/50 flex items-center justify-center h-48">
              <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : generated && data ? (
            isProfitAnalysis ? (
              <ProfitAnalysisTable data={data} />
            ) : (
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
            )
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
