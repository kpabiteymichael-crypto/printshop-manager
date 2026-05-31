import { useEffect, useState } from 'react';
import { cashApi } from '../lib/api';
import { Wallet, Lock, Unlock, Clock, CheckCircle, Plus } from 'lucide-react';
import clsx from 'clsx';

const php = (v: string | number) => `₱${Number(v).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;

export default function Cash() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [current, setCurrent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showOpen, setShowOpen] = useState(false);
  const [showClose, setShowClose] = useState(false);
  const [form, setForm] = useState({ openingBalance: '5000', notes: '' });
  const [closeForm, setCloseForm] = useState({ closingBalance: '', notes: '' });
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([cashApi.sessions(), cashApi.currentSession()])
      .then(([s, c]) => { setSessions(s); setCurrent(c); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleOpen = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const s = await cashApi.openSession({ openingBalance: form.openingBalance, notes: form.notes });
      setCurrent(s);
      setSessions(prev => [s, ...prev]);
      setShowOpen(false);
      setForm({ openingBalance: '5000', notes: '' });
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
    } catch (err: any) { alert(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="page-title dark:text-white flex items-center gap-2"><Wallet size={24} className="text-indigo-600" /> Cash Management</h1>
          <p className="page-subtitle dark:text-slate-400">Manage cash sessions and daily cash flow</p>
        </div>
        {!current && <button onClick={() => setShowOpen(true)} className="btn-primary flex items-center gap-2"><Plus size={16} /> Open Session</button>}
      </div>

      {/* Current session */}
      {current ? (
        <div className="card dark:bg-slate-800 dark:border-slate-700/50 border-l-4 border-l-emerald-500">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-900/30 rounded-xl flex items-center justify-center">
                <Unlock size={20} className="text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <div className="font-bold text-slate-900 dark:text-white">Active Cash Session</div>
                <div className="text-sm text-slate-500 dark:text-slate-400">Opened by {current.openedByName || 'Unknown'} · {new Date(current.openedAt).toLocaleTimeString('en-PH')}</div>
              </div>
            </div>
            <button onClick={() => { setCloseForm({ closingBalance: String(parseFloat(current.openingBalance) + parseFloat(current.totalSales || 0) - parseFloat(current.totalExpenses || 0)), notes: '' }); setShowClose(true); }} className="btn-secondary text-sm flex items-center gap-2">
              <Lock size={14} /> Close Session
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Opening Balance', value: php(current.openingBalance), color: 'text-slate-700 dark:text-slate-200' },
              { label: 'Total Sales', value: php(current.totalSales || 0), color: 'text-emerald-600 dark:text-emerald-400' },
              { label: 'Total Expenses', value: php(current.totalExpenses || 0), color: 'text-red-600 dark:text-red-400' },
              { label: 'Expected Balance', value: php(parseFloat(current.openingBalance) + parseFloat(current.totalSales || 0) - parseFloat(current.totalExpenses || 0)), color: 'text-indigo-600 dark:text-indigo-400 font-bold text-lg' },
            ].map(s => (
              <div key={s.label} className="text-center p-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
                <div className={clsx('text-xl font-bold', s.color)}>{s.value}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="card dark:bg-slate-800 dark:border-slate-700/50 text-center py-8">
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
          <div className="flex items-center justify-center h-32"><div className="w-6 h-6 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-700/30 border-b border-slate-100 dark:border-slate-700">
                  <th className="table-header px-4 py-3 text-left">Opened</th>
                  <th className="table-header px-4 py-3 text-left">Opened By</th>
                  <th className="table-header px-4 py-3 text-right">Opening</th>
                  <th className="table-header px-4 py-3 text-right">Sales</th>
                  <th className="table-header px-4 py-3 text-right">Expenses</th>
                  <th className="table-header px-4 py-3 text-right">Closing</th>
                  <th className="table-header px-4 py-3 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {sessions.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-8 text-slate-400 dark:text-slate-500">No sessions yet</td></tr>
                ) : sessions.map(s => (
                  <tr key={s.id} className="border-b border-slate-50 dark:border-slate-700/30 hover:bg-slate-50 dark:hover:bg-slate-700/20">
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{new Date(s.openedAt).toLocaleString('en-PH')}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{s.openedByName || '—'}</td>
                    <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-200">{php(s.openingBalance)}</td>
                    <td className="px-4 py-3 text-right text-emerald-600 dark:text-emerald-400">{php(s.totalSales)}</td>
                    <td className="px-4 py-3 text-right text-red-500 dark:text-red-400">{php(s.totalExpenses)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900 dark:text-white">{s.closingBalance ? php(s.closingBalance) : '—'}</td>
                    <td className="px-4 py-3">
                      <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold', s.status === 'open' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300')}>
                        {s.status === 'open' ? <><Unlock size={10} /> Open</> : <><CheckCircle size={10} /> Closed</>}
                      </span>
                    </td>
                  </tr>
                ))}
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
                <label className="label dark:text-slate-300">Opening Balance (₱) *</label>
                <input required type="number" step="0.01" value={form.openingBalance} onChange={e => setForm(p => ({ ...p, openingBalance: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
              </div>
              <div>
                <label className="label dark:text-slate-300">Notes</label>
                <input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="Optional notes..." />
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
              <div>
                <label className="label dark:text-slate-300">Actual Closing Balance (₱) *</label>
                <input required type="number" step="0.01" value={closeForm.closingBalance} onChange={e => setCloseForm(p => ({ ...p, closingBalance: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
              </div>
              <div>
                <label className="label dark:text-slate-300">Notes</label>
                <textarea rows={2} value={closeForm.notes} onChange={e => setCloseForm(p => ({ ...p, notes: e.target.value }))} className="input resize-none dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
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
