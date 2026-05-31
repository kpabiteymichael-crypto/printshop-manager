import { useEffect, useState } from 'react';
import { printJobsApi, productsApi, customersApi } from '../lib/api';
import { Printer, Plus, Clock, CheckCircle, AlertCircle, XCircle, Eye, RefreshCw, Filter } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../context/AuthContext';

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending:     { label: 'Pending',     color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',    icon: <Clock size={12} /> },
  in_progress: { label: 'In Progress', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',        icon: <RefreshCw size={12} /> },
  completed:   { label: 'Completed',   color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', icon: <CheckCircle size={12} /> },
  cancelled:   { label: 'Cancelled',   color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',             icon: <XCircle size={12} /> },
};

const php = (v: string | number) => `₱${Number(v).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;

export default function PrintJobs() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState<any[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [selectedJob, setSelectedJob] = useState<any>(null);
  const [services, setServices] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [form, setForm] = useState({ title: '', customerId: '', serviceId: '', quantity: '1', unitPrice: '', dueDate: '', notes: '', description: '' });
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    printJobsApi.list().then(setJobs).finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    productsApi.services().then(setServices);
    customersApi.list().then(setCustomers);
  }, []);

  const filtered = filter === 'all' ? jobs : jobs.filter(j => j.status === filter);

  const handleStatusChange = async (id: number, status: string) => {
    try {
      await printJobsApi.updateStatus(id, status);
      setJobs(prev => prev.map(j => j.id === id ? { ...j, status } : j));
    } catch (err: any) { alert(err.message); }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const job = await printJobsApi.create({
        ...form,
        customerId: form.customerId ? Number(form.customerId) : undefined,
        serviceId: form.serviceId ? Number(form.serviceId) : undefined,
        quantity: Number(form.quantity),
      });
      setJobs(prev => [job, ...prev]);
      setShowNew(false);
      setForm({ title: '', customerId: '', serviceId: '', quantity: '1', unitPrice: '', dueDate: '', notes: '', description: '' });
    } catch (err: any) { alert(err.message); }
    finally { setSaving(false); }
  };

  const canUpdateStatus = ['owner', 'manager', 'print_operator'].includes(user?.role ?? '');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="page-title dark:text-white flex items-center gap-2"><Printer size={24} className="text-indigo-600" /> Print Jobs</h1>
          <p className="page-subtitle dark:text-slate-400">Manage your print queue</p>
        </div>
        {['owner', 'manager', 'cashier'].includes(user?.role ?? '') && (
          <button onClick={() => setShowNew(true)} className="btn-primary flex items-center gap-2">
            <Plus size={16} /> New Job
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {['all', 'pending', 'in_progress', 'completed', 'cancelled'].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={clsx('px-3 py-1.5 rounded-lg text-xs font-semibold transition-all capitalize', filter === s ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 hover:border-indigo-300')}>
            {s === 'all' ? `All (${jobs.length})` : `${STATUS_CONFIG[s]?.label} (${jobs.filter(j => j.status === s).length})`}
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
                  <th className="table-header px-4 py-3 text-left">Job #</th>
                  <th className="table-header px-4 py-3 text-left">Title</th>
                  <th className="table-header px-4 py-3 text-left">Customer</th>
                  <th className="table-header px-4 py-3 text-left">Status</th>
                  <th className="table-header px-4 py-3 text-right">Amount</th>
                  <th className="table-header px-4 py-3 text-left">Due Date</th>
                  {canUpdateStatus && <th className="table-header px-4 py-3 text-left">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-12 text-slate-400 dark:text-slate-500">No print jobs found</td></tr>
                ) : filtered.map(job => {
                  const sc = STATUS_CONFIG[job.status];
                  const isOverdue = job.dueDate && new Date(job.dueDate) < new Date() && job.status !== 'completed';
                  return (
                    <tr key={job.id} className="border-b border-slate-50 dark:border-slate-700/30 hover:bg-slate-50 dark:hover:bg-slate-700/20 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-indigo-600 dark:text-indigo-400">{job.jobNumber}</td>
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-white max-w-48 truncate">{job.title}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{job.customerName || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold', sc?.color)}>
                          {sc?.icon}{sc?.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900 dark:text-white">{php(job.totalAmount)}</td>
                      <td className={clsx('px-4 py-3 text-xs', isOverdue ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-slate-500 dark:text-slate-400')}>
                        {job.dueDate ? new Date(job.dueDate).toLocaleDateString('en-PH') : '—'}
                        {isOverdue && ' (Overdue)'}
                      </td>
                      {canUpdateStatus && (
                        <td className="px-4 py-3">
                          <select
                            value={job.status}
                            onChange={e => handleStatusChange(job.id, e.target.value)}
                            className="text-xs border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                          >
                            <option value="pending">Pending</option>
                            <option value="in_progress">In Progress</option>
                            <option value="completed">Completed</option>
                            <option value="cancelled">Cancelled</option>
                          </select>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* New Job Modal */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowNew(false)} />
          <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg animate-fade-in border border-slate-100 dark:border-slate-700 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-700 sticky top-0 bg-white dark:bg-slate-800 z-10">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">New Print Job</h3>
              <button onClick={() => setShowNew(false)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700">✕</button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div>
                <label className="label dark:text-slate-300">Job Title *</label>
                <input required value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="e.g. School ID Printing 2026" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label dark:text-slate-300">Customer</label>
                  <select value={form.customerId} onChange={e => setForm(p => ({ ...p, customerId: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                    <option value="">Walk-in</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label dark:text-slate-300">Service</label>
                  <select value={form.serviceId} onChange={e => { setForm(p => ({ ...p, serviceId: e.target.value, unitPrice: services.find(s => String(s.id) === e.target.value)?.pricePerUnit || '' })); }} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                    <option value="">Select service</option>
                    {services.map(s => <option key={s.id} value={s.id}>{s.name} — ₱{s.pricePerUnit}/{s.unit}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label dark:text-slate-300">Quantity *</label>
                  <input required type="number" min="1" value={form.quantity} onChange={e => setForm(p => ({ ...p, quantity: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
                </div>
                <div>
                  <label className="label dark:text-slate-300">Unit Price (₱) *</label>
                  <input required type="number" step="0.01" value={form.unitPrice} onChange={e => setForm(p => ({ ...p, unitPrice: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="0.00" />
                </div>
              </div>
              <div>
                <label className="label dark:text-slate-300">Due Date</label>
                <input type="datetime-local" value={form.dueDate} onChange={e => setForm(p => ({ ...p, dueDate: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
              </div>
              <div>
                <label className="label dark:text-slate-300">Notes</label>
                <textarea rows={2} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white resize-none" placeholder="Special instructions..." />
              </div>
              {form.quantity && form.unitPrice && (
                <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-xl p-3 text-sm">
                  <span className="text-slate-600 dark:text-slate-300">Estimated Total: </span>
                  <span className="font-bold text-indigo-700 dark:text-indigo-400">{php(Number(form.quantity) * Number(form.unitPrice))}</span>
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowNew(false)} className="flex-1 btn-secondary">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 btn-primary">{saving ? 'Creating...' : 'Create Job'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
