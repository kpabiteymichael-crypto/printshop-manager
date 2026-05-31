import { useEffect, useState, useCallback } from 'react';
import { debtsApi } from '../lib/api';
import { CreditCard, AlertCircle, CheckCircle, Clock, X, DollarSign } from 'lucide-react';
import clsx from 'clsx';

const fmt = (v: string | number) => `GH₵${Number(v).toLocaleString('en-GH', { minimumFractionDigits: 2 })}`;

const STATUS_STYLES: Record<string, string> = {
  open: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  partial: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  paid: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  open: <AlertCircle size={12} />,
  partial: <Clock size={12} />,
  paid: <CheckCircle size={12} />,
};

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Cash', mtn_momo: 'MTN MoMo', telecel_cash: 'Telecel Cash',
  airteltigo: 'AirtelTigo', bank_transfer: 'Bank Transfer',
};

export default function Debts() {
  const [debts, setDebts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [selected, setSelected] = useState<any>(null);
  const [detail, setDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showPay, setShowPay] = useState(false);
  const [payForm, setPayForm] = useState({ amount: '', paymentMethod: 'cash', paymentReference: '', notes: '' });
  const [paying, setPaying] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    debtsApi.list(statusFilter !== 'all' ? statusFilter : undefined)
      .then(setDebts).finally(() => setLoading(false));
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (debt: any) => {
    setSelected(debt);
    setDetailLoading(true);
    try {
      const d = await debtsApi.get(debt.id);
      setDetail(d);
    } catch { setDetail(null); }
    finally { setDetailLoading(false); }
  };

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    setPaying(true);
    try {
      await debtsApi.addPayment(selected.id, payForm);
      load();
      const updated = await debtsApi.get(selected.id);
      setDetail(updated);
      setSelected({ ...selected, status: updated.status, balance: updated.balance, paidAmount: updated.paidAmount });
      setShowPay(false);
      setPayForm({ amount: '', paymentMethod: 'cash', paymentReference: '', notes: '' });
    } catch (err: any) { alert(err.message); }
    finally { setPaying(false); }
  };

  const totals = {
    total: debts.reduce((s, d) => s + parseFloat(d.total_amount || d.totalAmount || 0), 0),
    paid: debts.reduce((s, d) => s + parseFloat(d.paid_amount || d.paidAmount || 0), 0),
    balance: debts.reduce((s, d) => s + parseFloat(d.balance || 0), 0),
  };

  const overdueCount = debts.filter(d =>
    d.due_date && new Date(d.due_date) < new Date() && d.status !== 'paid'
  ).length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="page-title dark:text-white flex items-center gap-2"><CreditCard size={24} className="text-indigo-600" /> Debt Ledger</h1>
          <p className="page-subtitle dark:text-slate-400">{debts.length} records · {overdueCount > 0 && <span className="text-red-500 font-semibold">{overdueCount} overdue</span>}</p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Owed', value: fmt(totals.total), color: 'text-slate-900 dark:text-white', bg: 'bg-slate-50 dark:bg-slate-700/50' },
          { label: 'Total Collected', value: fmt(totals.paid), color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
          { label: 'Outstanding', value: fmt(totals.balance), color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/20' },
        ].map(s => (
          <div key={s.label} className={clsx('card dark:border-slate-700/50 text-center py-4', s.bg)}>
            <div className={clsx('text-2xl font-bold', s.color)}>{s.value}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {['all', 'open', 'partial', 'paid'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)} className={clsx('px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all', statusFilter === s ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 hover:border-indigo-300')}>
            {s === 'all' ? `All (${debts.length})` : `${s.charAt(0).toUpperCase()+s.slice(1)} (${debts.filter(d => d.status === s).length})`}
          </button>
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
                  {['Customer','Sale #','Total','Paid','Balance','Due Date','Status',''].map(h => (
                    <th key={h} className="table-header px-4 py-3 text-left text-xs">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {debts.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-10 text-slate-400 dark:text-slate-500">No debts found</td></tr>
                ) : debts.map(d => {
                  const isOverdue = d.due_date && new Date(d.due_date) < new Date() && d.status !== 'paid';
                  return (
                    <tr key={d.id} className={clsx('border-b border-slate-50 dark:border-slate-700/30 hover:bg-slate-50 dark:hover:bg-slate-700/20 cursor-pointer', isOverdue && 'bg-red-50/40 dark:bg-red-900/10')} onClick={() => openDetail(d)}>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900 dark:text-white">{d.customer_name}</div>
                        <div className="text-xs text-slate-400">{d.customer_phone}</div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-indigo-600 dark:text-indigo-400 font-bold">{d.sale_number || '—'}</td>
                      <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">{fmt(d.total_amount)}</td>
                      <td className="px-4 py-3 text-emerald-600 dark:text-emerald-400">{fmt(d.paid_amount)}</td>
                      <td className="px-4 py-3 font-bold text-red-600 dark:text-red-400">{fmt(d.balance)}</td>
                      <td className={clsx('px-4 py-3 text-xs whitespace-nowrap', isOverdue ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-slate-500 dark:text-slate-400')}>
                        {d.due_date ? new Date(d.due_date).toLocaleDateString('en-GH') : '—'}{isOverdue && ' ⚠'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold capitalize', STATUS_STYLES[d.status])}>
                          {STATUS_ICONS[d.status]}{d.status}
                        </span>
                      </td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        {d.status !== 'paid' && (
                          <button onClick={() => { setSelected(d); setShowPay(true); }} className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1">
                            <DollarSign size={12} /> Pay
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detail panel */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => { setSelected(null); setDetail(null); }} />
          <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg animate-fade-in border border-slate-100 dark:border-slate-700 max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-700 shrink-0">
              <div>
                <div className="font-bold text-slate-900 dark:text-white">{selected.customer_name}</div>
                {selected.sale_number && <div className="text-xs text-slate-400">Sale: {selected.sale_number}</div>}
              </div>
              <div className="flex items-center gap-2">
                {selected.status !== 'paid' && (
                  <button onClick={() => setShowPay(true)} className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5">
                    <DollarSign size={13} /> Add Payment
                  </button>
                )}
                <button onClick={() => { setSelected(null); setDetail(null); }} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"><X size={18} /></button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
                  <div className="font-bold text-slate-900 dark:text-white">{fmt(selected.total_amount || selected.totalAmount)}</div>
                  <div className="text-xs text-slate-500">Total</div>
                </div>
                <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl">
                  <div className="font-bold text-emerald-600 dark:text-emerald-400">{fmt(detail?.paidAmount ?? selected.paid_amount ?? 0)}</div>
                  <div className="text-xs text-slate-500">Paid</div>
                </div>
                <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-xl">
                  <div className="font-bold text-red-600 dark:text-red-400">{fmt(detail?.balance ?? selected.balance ?? 0)}</div>
                  <div className="text-xs text-slate-500">Balance</div>
                </div>
              </div>

              <div>
                <div className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">Payment History</div>
                {detailLoading ? (
                  <div className="flex items-center justify-center h-16"><div className="w-5 h-5 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>
                ) : !detail?.payments?.length ? (
                  <div className="text-center py-4 text-slate-400 text-sm">No payments recorded</div>
                ) : (
                  <div className="space-y-2">
                    {detail.payments.map((p: any) => (
                      <div key={p.id} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl text-sm">
                        <div>
                          <div className="font-semibold text-emerald-600 dark:text-emerald-400">{fmt(p.amount)}</div>
                          <div className="text-xs text-slate-400">{PAYMENT_LABELS[p.payment_method] || p.payment_method} · {new Date(p.paid_at).toLocaleDateString('en-GH')}</div>
                          {p.notes && <div className="text-xs text-slate-400 italic">{p.notes}</div>}
                        </div>
                        <div className="text-xs text-slate-400">{p.paid_by_name}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick payment modal */}
      {showPay && selected && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60" onClick={() => setShowPay(false)} />
          <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm animate-fade-in border border-slate-100 dark:border-slate-700">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
              <h4 className="font-bold text-slate-900 dark:text-white">Record Payment</h4>
              <button onClick={() => setShowPay(false)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"><X size={16} /></button>
            </div>
            <form onSubmit={handlePay} className="p-5 space-y-4">
              <div className="text-sm">
                <span className="text-slate-500 dark:text-slate-400">Outstanding: </span>
                <strong className="text-red-600 dark:text-red-400">{fmt(detail?.balance ?? selected.balance ?? 0)}</strong>
                <span className="text-slate-400"> · {selected.customer_name}</span>
              </div>
              <div>
                <label className="label dark:text-slate-300">Amount (GH₵) *</label>
                <input required type="number" step="0.01" max={detail?.balance ?? selected.balance} value={payForm.amount} onChange={e => setPayForm(p => ({ ...p, amount: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="0.00" />
              </div>
              <div>
                <label className="label dark:text-slate-300">Payment Method</label>
                <select value={payForm.paymentMethod} onChange={e => setPayForm(p => ({ ...p, paymentMethod: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                  {Object.entries(PAYMENT_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="label dark:text-slate-300">Reference #</label>
                <input value={payForm.paymentReference} onChange={e => setPayForm(p => ({ ...p, paymentReference: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="Transaction ID / Receipt #" />
              </div>
              <div>
                <label className="label dark:text-slate-300">Notes</label>
                <input value={payForm.notes} onChange={e => setPayForm(p => ({ ...p, notes: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowPay(false)} className="flex-1 btn-secondary">Cancel</button>
                <button type="submit" disabled={paying} className="flex-1 btn-primary">{paying ? 'Recording...' : 'Record Payment'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
