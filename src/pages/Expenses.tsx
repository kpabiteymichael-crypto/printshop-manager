import { useEffect, useState, useCallback } from 'react';
import { expensesApi, cashApi } from '../lib/api';
import { Receipt, Plus, Trash2, Filter, X } from 'lucide-react';
import clsx from 'clsx';

const fmt = (v: string | number) => `GH₵${Number(v).toLocaleString('en-GH', { minimumFractionDigits: 2 })}`;

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Cash', mtn_momo: 'MTN MoMo', telecel_cash: 'Telecel Cash',
  airteltigo: 'AirtelTigo', bank_transfer: 'Bank Transfer',
};

function today() { return new Date().toISOString().split('T')[0]; }
function firstOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
}

export default function Expenses() {
  const [expenses, setExpenses] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(today());
  const [catFilter, setCatFilter] = useState('all');
  const [form, setForm] = useState({
    categoryId: '', description: '', amount: '', paymentMethod: 'cash',
    referenceNumber: '', expenseDate: today(), notes: '',
  });
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    expensesApi.list({ from, to, category: catFilter !== 'all' ? catFilter : undefined })
      .then(setExpenses).finally(() => setLoading(false));
  }, [from, to, catFilter]);

  useEffect(() => {
    load();
    expensesApi.categories().then(setCategories);
    cashApi.currentSession().then(setSession).catch(() => {});
  }, [load]);

  const totalByCategory = categories.map(cat => ({
    name: cat.name,
    total: expenses.filter(e => e.categoryId === cat.id).reduce((s, e) => s + parseFloat(e.amount), 0),
  })).filter(c => c.total > 0);

  const grandTotal = expenses.reduce((s, e) => s + parseFloat(e.amount), 0);

  const handleCreate = async (e_: React.FormEvent) => {
    e_.preventDefault();
    setSaving(true);
    try {
      const exp = await expensesApi.create({
        ...form,
        categoryId: form.categoryId ? Number(form.categoryId) : undefined,
        cashSessionId: session?.id,
      });
      setExpenses(prev => [exp, ...prev]);
      setShowNew(false);
      setForm({ categoryId: '', description: '', amount: '', paymentMethod: 'cash', referenceNumber: '', expenseDate: today(), notes: '' });
    } catch (err: any) { alert(err.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this expense?')) return;
    try { await expensesApi.delete(id); setExpenses(prev => prev.filter(e => e.id !== id)); }
    catch (err: any) { alert(err.message); }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="page-title dark:text-white flex items-center gap-2"><Receipt size={24} className="text-indigo-600" /> Expenses</h1>
          <p className="page-subtitle dark:text-slate-400">Track and manage business expenses</p>
        </div>
        <button onClick={() => setShowNew(true)} className="btn-primary flex items-center gap-2"><Plus size={16} /> Add Expense</button>
      </div>

      {/* Filters */}
      <div className="card dark:bg-slate-800 dark:border-slate-700/50 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label dark:text-slate-300 text-xs">From</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white text-sm py-1.5" />
          </div>
          <div>
            <label className="label dark:text-slate-300 text-xs">To</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white text-sm py-1.5" />
          </div>
          <div>
            <label className="label dark:text-slate-300 text-xs">Category</label>
            <select value={catFilter} onChange={e => setCatFilter(e.target.value)} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white text-sm py-1.5">
              <option value="all">All Categories</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <button onClick={() => { setFrom(firstOfMonth()); setTo(today()); setCatFilter('all'); }} className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5">
            <X size={13} /> Reset
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="card dark:bg-slate-800 dark:border-slate-700/50">
          <div className="text-xl font-bold text-red-600 dark:text-red-400">{fmt(grandTotal)}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">Total ({expenses.length} records)</div>
        </div>
        {totalByCategory.slice(0, 3).map(c => (
          <div key={c.name} className="card dark:bg-slate-800 dark:border-slate-700/50">
            <div className="text-xl font-bold text-slate-900 dark:text-white">{fmt(c.total)}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">{c.name}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48"><div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="card dark:bg-slate-800 dark:border-slate-700/50 overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-700/30 border-b border-slate-100 dark:border-slate-700">
                  {['Date','Description','Category','Payment','Amount','By',''].map((h, i) => (
                    <th key={i} className={clsx('table-header px-4 py-3', h === 'Amount' ? 'text-right' : 'text-left')}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {expenses.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-10 text-slate-400 dark:text-slate-500">No expenses found for the selected period</td></tr>
                ) : expenses.map(exp => (
                  <tr key={exp.id} className="border-b border-slate-50 dark:border-slate-700/30 hover:bg-slate-50 dark:hover:bg-slate-700/20">
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap text-xs">{new Date(exp.expenseDate).toLocaleDateString('en-GH')}</td>
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-white max-w-48 truncate">{exp.description}</td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs">{exp.categoryName || 'Uncategorized'}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded text-xs font-semibold">{PAYMENT_LABELS[exp.paymentMethod] || exp.paymentMethod}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-red-600 dark:text-red-400">{fmt(exp.amount)}</td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs">{exp.recordedByName || '—'}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => handleDelete(exp.id)} className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500 transition-colors"><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
              {expenses.length > 0 && (
                <tfoot>
                  <tr className="bg-slate-50 dark:bg-slate-700/30 border-t border-slate-200 dark:border-slate-700">
                    <td colSpan={4} className="px-4 py-3 font-semibold text-slate-600 dark:text-slate-300 text-sm">Total</td>
                    <td className="px-4 py-3 text-right font-bold text-red-600 dark:text-red-400">{fmt(grandTotal)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowNew(false)} />
          <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md animate-fade-in border border-slate-100 dark:border-slate-700">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
              <h3 className="font-bold text-slate-900 dark:text-white">Add Expense</h3>
              <button onClick={() => setShowNew(false)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"><X size={18} /></button>
            </div>
            <form onSubmit={handleCreate} className="p-5 space-y-4">
              <div>
                <label className="label dark:text-slate-300">Description *</label>
                <input required value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="e.g. Ink cartridge refill" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label dark:text-slate-300">Amount (GH₵) *</label>
                  <input required type="number" step="0.01" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="0.00" />
                </div>
                <div>
                  <label className="label dark:text-slate-300">Date</label>
                  <input type="date" value={form.expenseDate} onChange={e => setForm(p => ({ ...p, expenseDate: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label dark:text-slate-300">Category</label>
                  <select value={form.categoryId} onChange={e => setForm(p => ({ ...p, categoryId: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                    <option value="">Uncategorized</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label dark:text-slate-300">Payment Method</label>
                  <select value={form.paymentMethod} onChange={e => setForm(p => ({ ...p, paymentMethod: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                    {Object.entries(PAYMENT_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="label dark:text-slate-300">Reference #</label>
                <input value={form.referenceNumber} onChange={e => setForm(p => ({ ...p, referenceNumber: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="Invoice / receipt number" />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowNew(false)} className="flex-1 btn-secondary">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 btn-primary">{saving ? 'Saving...' : 'Add Expense'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
