import { useEffect, useState, useCallback } from 'react';
import { cashApi } from '../lib/api';
import { Wallet, Lock, Unlock, CheckCircle, Plus, BarChart3 } from 'lucide-react';
import clsx from 'clsx';

const fmt = (v: string | number) => `GH₵${Number(v).toLocaleString('en-GH', { minimumFractionDigits: 2 })}`;

const CHANNEL_LABELS: Record<string, string> = {
  cash: 'Cash', mtn_momo: 'MTN MoMo', telecel_cash: 'Telecel Cash',
  airteltigo: 'AirtelTigo', bank_transfer: 'Bank Transfer',
};

const CHANNEL_COLORS: Record<string, string> = {
  cash: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  mtn_momo: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  telecel_cash: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  airteltigo: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  bank_transfer: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
};

export default function Cash() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [current, setCurrent] = useState<any>(null);
  const [sessionSummary, setSessionSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showOpen, setShowOpen] = useState(false);
  const [showClose, setShowClose] = useState(false);
  const [form, setForm] = useState({ openingBalance: '0', notes: '' });
  const [closeForm, setCloseForm] = useState({ closingBalance: '', notes: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, c] = await Promise.all([cashApi.sessions(), cashApi.currentSession()]);
      setSessions(s);
      setCurrent(c);
      if (c?.id) {
        cashApi.sessionSummary(c.id).then(setSessionSummary).catch(() => {});
      }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleOpen = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const s = await cashApi.openSession({ openingBalance: form.openingBalance, notes: form.notes });
      setCurrent(s);
      setSessions(prev => [s, ...prev]);
      setShowOpen(false);
      setForm({ openingBalance: '0', notes: '' });
    } catch (err: any) { alert(err.message); }
    finally { setSaving(false); }
  };

  const handleClose = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!current) return;
    setSaving(true);
    try {
      await cashApi.closeSession(current.id, { closingBalance: closeForm.closingBalance, notes: closeForm.notes });
      load();
      setShowClose(false);
      setSessionSummary(null);
    } catch (err: any) { alert(err.message); }
    finally { setSaving(false); }
  };

  const expectedBalance = current
    ? parseFloat(current.openingBalance) + parseFloat(current.totalSales || 0) - parseFloat(current.totalExpenses || 0)
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="page-title dark:text-white flex items-center gap-2"><Wallet size={24} className="text-indigo-600" /> Cash Management</h1>
          <p className="page-subtitle dark:text-slate-400">Manage cash sessions and daily cash flow</p>
        </div>
        {!current && <button onClick={() => setShowOpen(true)} className="btn-primary flex items-center gap-2"><Plus size={16} /> Open Session</button>}
      </div>

      {current ? (
        <div className="space-y-4">
          {/* Active session banner */}
          <div className="card dark:bg-slate-800 dark:border-slate-700/50 border-l-4 border-l-emerald-500">
            <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-900/30 rounded-xl flex items-center justify-center">
                  <Unlock size={20} className="text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <div className="font-bold text-slate-900 dark:text-white">Active Cash Session</div>
                  <div className="text-sm text-slate-500 dark:text-slate-400">Opened {new Date(current.openedAt).toLocaleString('en-GH')}</div>
                </div>
              </div>
              <button
                onClick={() => {
                  setCloseForm({ closingBalance: String(expectedBalance.toFixed(2)), notes: '' });
                  setShowClose(true);
                }}
                className="btn-secondary text-sm flex items-center gap-2"
              >
                <Lock size={14} /> Close Session
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              {[
                { label: 'Opening Balance', value: fmt(current.openingBalance), color: 'text-slate-700 dark:text-slate-200' },
                { label: 'Total Sales', value: fmt(current.totalSales || 0), color: 'text-emerald-600 dark:text-emerald-400' },
                { label: 'Total Expenses', value: fmt(current.totalExpenses || 0), color: 'text-red-600 dark:text-red-400' },
                { label: 'Expected Balance', value: fmt(expectedBalance), color: 'text-indigo-600 dark:text-indigo-400 font-bold text-lg' },
              ].map(s => (
                <div key={s.label} className="text-center p-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
                  <div className={clsx('text-xl font-bold', s.color)}>{s.value}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Per-channel breakdown */}
            {sessionSummary?.channelBreakdown?.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <BarChart3 size={15} className="text-slate-400" />
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Sales by Channel</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {Object.keys(CHANNEL_LABELS).map(ch => {
                    const row = sessionSummary.channelBreakdown.find((r: any) => r.payment_method === ch);
                    return (
                      <div key={ch} className={clsx('text-center p-2.5 rounded-xl', CHANNEL_COLORS[ch] || 'bg-slate-100 text-slate-600')}>
                        <div className="text-sm font-bold">{row ? fmt(row.total) : 'GH₵0.00'}</div>
                        <div className="text-[11px] font-medium mt-0.5">{CHANNEL_LABELS[ch]}</div>
                        <div className="text-[10px] opacity-70">{row ? `${row.txn_count} txn` : '0 txn'}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Recent transactions */}
          {sessionSummary?.recentTransactions?.length > 0 && (
            <div className="card dark:bg-slate-800 dark:border-slate-700/50 overflow-hidden p-0">
              <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-700">
                <h2 className="font-bold text-slate-900 dark:text-white text-sm">Recent Transactions (Today)</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-700/30 border-b border-slate-100 dark:border-slate-700">
                      {['Sale #','Customer','Amount','Channel','Time'].map(h => (
                        <th key={h} className="table-header px-4 py-2 text-left text-xs">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sessionSummary.recentTransactions.map((t: any) => (
                      <tr key={t.id} className="border-b border-slate-50 dark:border-slate-700/30 hover:bg-slate-50 dark:hover:bg-slate-700/20">
                        <td className="px-4 py-2 font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400">{t.sale_number}</td>
                        <td className="px-4 py-2 text-xs text-slate-600 dark:text-slate-300">{t.customer_name || 'Walk-in'}</td>
                        <td className="px-4 py-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">{fmt(t.total_amount)}</td>
                        <td className="px-4 py-2"><span className={clsx('text-[11px] font-semibold px-1.5 py-0.5 rounded', CHANNEL_COLORS[t.payment_method])}>{CHANNEL_LABELS[t.payment_method]}</span></td>
                        <td className="px-4 py-2 text-xs text-slate-400">{new Date(t.created_at).toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit' })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : !loading && (
        <div className="card dark:bg-slate-800 dark:border-slate-700/50 text-center py-10">
          <div className="w-16 h-16 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-3">
            <Lock size={28} className="text-slate-400 dark:text-slate-500" />
          </div>
          <div className="font-semibold text-slate-900 dark:text-white">No Active Cash Session</div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 mb-4">Open a cash session to start processing sales.</p>
          <button onClick={() => setShowOpen(true)} className="btn-primary mx-auto flex items-center gap-2"><Plus size={16} /> Open Session</button>
        </div>
      )}

      {/* Session history */}
      <div className="card dark:bg-slate-800 dark:border-slate-700/50 overflow-hidden p-0">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <h2 className="font-bold text-slate-900 dark:text-white">Session History</h2>
        </div>
        {loading ? (
          <div className="flex items-center justify-center h-24"><div className="w-6 h-6 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-700/30 border-b border-slate-100 dark:border-slate-700">
                  {['Opened','Opening','Sales','Expenses','Closing','Variance','Status'].map(h => (
                    <th key={h} className="table-header px-4 py-3 text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sessions.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-8 text-slate-400 dark:text-slate-500">No sessions yet</td></tr>
                ) : sessions.map(s => {
                  const expected = parseFloat(s.openingBalance) + parseFloat(s.totalSales || 0) - parseFloat(s.totalExpenses || 0);
                  const variance = s.closingBalance ? parseFloat(s.closingBalance) - expected : null;
                  return (
                    <tr key={s.id} className="border-b border-slate-50 dark:border-slate-700/30 hover:bg-slate-50 dark:hover:bg-slate-700/20">
                      <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">{new Date(s.openedAt).toLocaleString('en-GH')}</td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{fmt(s.openingBalance)}</td>
                      <td className="px-4 py-3 text-emerald-600 dark:text-emerald-400">{fmt(s.totalSales)}</td>
                      <td className="px-4 py-3 text-red-500 dark:text-red-400">{fmt(s.totalExpenses)}</td>
                      <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">{s.closingBalance ? fmt(s.closingBalance) : '—'}</td>
                      <td className={clsx('px-4 py-3 font-semibold text-sm', variance === null ? 'text-slate-400' : variance >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
                        {variance === null ? '—' : `${variance >= 0 ? '+' : ''}${fmt(variance)}`}
                      </td>
                      <td className="px-4 py-3">
                        <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold', s.status === 'open' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300')}>
                          {s.status === 'open' ? <><Unlock size={10} /> Open</> : <><CheckCircle size={10} /> Closed</>}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowOpen(false)} />
          <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm animate-fade-in border border-slate-100 dark:border-slate-700">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
              <h3 className="font-bold text-slate-900 dark:text-white">Open Cash Session</h3>
              <button onClick={() => setShowOpen(false)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700">✕</button>
            </div>
            <form onSubmit={handleOpen} className="p-5 space-y-4">
              <div>
                <label className="label dark:text-slate-300">Opening Balance (GH₵) *</label>
                <input required type="number" step="0.01" min="0" value={form.openingBalance} onChange={e => setForm(p => ({ ...p, openingBalance: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
              </div>
              <div>
                <label className="label dark:text-slate-300">Notes</label>
                <input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="Optional..." />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowOpen(false)} className="flex-1 btn-secondary">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 btn-primary">{saving ? 'Opening...' : 'Open Session'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showClose && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowClose(false)} />
          <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm animate-fade-in border border-slate-100 dark:border-slate-700">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
              <h3 className="font-bold text-slate-900 dark:text-white">Close Cash Session</h3>
              <button onClick={() => setShowClose(false)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700">✕</button>
            </div>
            <form onSubmit={handleClose} className="p-5 space-y-4">
              <div className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl text-sm space-y-1">
                <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Opening</span><span className="font-semibold text-slate-900 dark:text-white">{fmt(current?.openingBalance || 0)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">+ Sales</span><span className="font-semibold text-emerald-600">{fmt(current?.totalSales || 0)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">− Expenses</span><span className="font-semibold text-red-500">{fmt(current?.totalExpenses || 0)}</span></div>
                <div className="flex justify-between border-t border-slate-200 dark:border-slate-600 pt-1 mt-1"><span className="font-semibold text-slate-700 dark:text-slate-200">Expected</span><span className="font-bold text-indigo-600 dark:text-indigo-400">{fmt(expectedBalance)}</span></div>
              </div>
              <div>
                <label className="label dark:text-slate-300">Actual Cash Counted (GH₵) *</label>
                <input required type="number" step="0.01" value={closeForm.closingBalance} onChange={e => setCloseForm(p => ({ ...p, closingBalance: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
                {closeForm.closingBalance && (
                  <div className={clsx('text-xs mt-1 font-semibold', parseFloat(closeForm.closingBalance) >= expectedBalance ? 'text-emerald-600' : 'text-red-600')}>
                    Variance: {parseFloat(closeForm.closingBalance) >= expectedBalance ? '+' : ''}{fmt(parseFloat(closeForm.closingBalance) - expectedBalance)}
                  </div>
                )}
              </div>
              <div>
                <label className="label dark:text-slate-300">Notes</label>
                <textarea rows={2} value={closeForm.notes} onChange={e => setCloseForm(p => ({ ...p, notes: e.target.value }))} className="input resize-none dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="Any discrepancy notes..." />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowClose(false)} className="flex-1 btn-secondary">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 btn-primary bg-emerald-600 hover:bg-emerald-700">{saving ? 'Closing...' : 'Close Session'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
