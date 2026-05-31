import { useEffect, useState, useCallback } from 'react';
import { printJobsApi, productsApi, customersApi } from '../lib/api';
import {
  Printer, Plus, Clock, CheckCircle, XCircle,
  RefreshCw, LayoutGrid, List, Truck, ChevronRight, X, User,
} from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../context/AuthContext';

const STATUSES = [
  { key: 'pending',     label: 'Pending',     color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',       border: 'border-amber-300 dark:border-amber-700',    icon: <Clock size={13} /> },
  { key: 'in_progress', label: 'In Progress', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',           border: 'border-blue-300 dark:border-blue-700',      icon: <RefreshCw size={13} /> },
  { key: 'printed',     label: 'Printed',     color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',   border: 'border-purple-300 dark:border-purple-700',  icon: <Printer size={13} /> },
  { key: 'delivered',   label: 'Delivered',   color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300',   border: 'border-indigo-300 dark:border-indigo-700',  icon: <Truck size={13} /> },
  { key: 'completed',   label: 'Completed',   color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300', border: 'border-emerald-300 dark:border-emerald-700', icon: <CheckCircle size={13} /> },
  { key: 'cancelled',   label: 'Cancelled',   color: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',               border: 'border-red-300 dark:border-red-700',        icon: <XCircle size={13} /> },
];

const STATUS_MAP = Object.fromEntries(STATUSES.map(s => [s.key, s]));
const NEXT_STATUS: Record<string, string> = {
  pending: 'in_progress', in_progress: 'printed',
  printed: 'delivered', delivered: 'completed',
};

const fmt = (v: string | number) => `GH₵${Number(v).toLocaleString('en-GH', { minimumFractionDigits: 2 })}`;
const isOverdue = (job: any) =>
  job.dueDate && new Date(job.dueDate) < new Date() &&
  !['completed', 'cancelled', 'delivered'].includes(job.status);

function JobCard({ job, canUpdateStatus, canAssign, operators, onStatusChange, onAssign }: any) {
  const sc = STATUS_MAP[job.status];
  const overdue = isOverdue(job);
  return (
    <div className={clsx(
      'bg-white dark:bg-slate-800 rounded-xl border p-3 shadow-sm text-sm transition-all hover:shadow-md',
      overdue ? 'border-red-400 dark:border-red-600' : 'border-slate-200 dark:border-slate-700'
    )}>
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <span className="font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400">{job.jobNumber}</span>
        {overdue && <span className="text-[9px] font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-1.5 py-0.5 rounded shrink-0">OVERDUE</span>}
      </div>
      <div className="font-semibold text-slate-900 dark:text-white text-xs mb-1 line-clamp-2">{job.title}</div>
      {job.serviceName && <div className="text-[11px] text-slate-400 dark:text-slate-500 mb-1">{job.serviceName}</div>}
      <div className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 mb-1.5">
        <User size={10} />
        <span className="truncate">{job.customerName || 'Walk-in'}</span>
      </div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] text-slate-400">×{job.quantity}</span>
        <span className="font-bold text-xs text-slate-900 dark:text-white">{fmt(job.totalAmount)}</span>
      </div>
      {job.dueDate && (
        <div className={clsx('text-[11px] mb-1.5', overdue ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-slate-400')}>
          Due: {new Date(job.dueDate).toLocaleDateString('en-GH', { month: 'short', day: 'numeric' })}
        </div>
      )}
      {job.operatorName && (
        <div className="text-[11px] text-slate-400 mb-1.5 truncate">👤 {job.operatorName}</div>
      )}
      <div className="flex gap-1.5">
        {canUpdateStatus && NEXT_STATUS[job.status] && (
          <button
            onClick={() => onStatusChange(job.id, NEXT_STATUS[job.status])}
            className="flex-1 flex items-center justify-center gap-1 text-[11px] py-1 px-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors font-semibold"
          >
            <ChevronRight size={10} /> {STATUS_MAP[NEXT_STATUS[job.status]]?.label}
          </button>
        )}
        {canUpdateStatus && !['completed', 'cancelled'].includes(job.status) && (
          <button
            onClick={() => onStatusChange(job.id, 'cancelled')}
            className="text-[11px] py-1 px-1.5 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 transition-colors"
          >Cancel</button>
        )}
      </div>
      {canAssign && !['completed', 'cancelled'].includes(job.status) && (
        <select
          value={job.assignedTo ?? ''}
          onChange={e => onAssign(job.id, e.target.value ? Number(e.target.value) : null)}
          className="mt-2 w-full text-[11px] border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-400"
        >
          <option value="">Unassigned</option>
          {operators.map((o: any) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      )}
    </div>
  );
}

export default function PrintJobs() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'kanban' | 'table'>('kanban');
  const [filterStatus, setFilterStatus] = useState('all');
  const [services, setServices] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [operators, setOperators] = useState<any[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({
    title: '', customerId: '', serviceId: '', quantity: '1',
    unitPrice: '', dueDate: '', notes: '', description: '', assignedTo: '',
    pageCount: '', paymentStatus: 'unpaid',
  });
  const [uploadFile, setUploadFile] = useState<{ name: string; data: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    printJobsApi.list().then(setJobs).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    productsApi.services().then(setServices);
    customersApi.list().then(setCustomers);
    printJobsApi.operators().then(setOperators);
  }, [load]);

  const handleStatusChange = async (id: number, status: string) => {
    try {
      await printJobsApi.updateStatus(id, status);
      setJobs(prev => prev.map(j => j.id === id ? { ...j, status } : j));
    } catch (err: any) { alert(err.message); }
  };

  const handleAssign = async (id: number, assignedTo: number | null) => {
    try {
      await printJobsApi.assign(id, assignedTo);
      const op = operators.find((o: any) => o.id === assignedTo);
      setJobs(prev => prev.map(j => j.id === id ? { ...j, assignedTo, operatorName: op?.name ?? null } : j));
    } catch (err: any) { alert(err.message); }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      setUploadFile({ name: file.name, data: base64 });
    };
    reader.readAsDataURL(file);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const job = await printJobsApi.create({
        ...form,
        customerId: form.customerId ? Number(form.customerId) : undefined,
        serviceId: form.serviceId ? Number(form.serviceId) : undefined,
        assignedTo: form.assignedTo ? Number(form.assignedTo) : undefined,
        quantity: Number(form.quantity),
        pageCount: form.pageCount ? Number(form.pageCount) : undefined,
      });
      if (uploadFile) {
        try {
          await printJobsApi.uploadFile(job.id, { filename: uploadFile.name, fileData: uploadFile.data });
        } catch { /* file upload failure is non-fatal */ }
      }
      setJobs(prev => [job, ...prev]);
      setShowNew(false);
      setForm({ title: '', customerId: '', serviceId: '', quantity: '1', unitPrice: '', dueDate: '', notes: '', description: '', assignedTo: '', pageCount: '', paymentStatus: 'unpaid' });
      setUploadFile(null);
    } catch (err: any) { alert(err.message); }
    finally { setSaving(false); }
  };

  const canUpdateStatus = ['owner', 'manager', 'print_operator'].includes(user?.role ?? '');
  const canAssign = ['owner', 'manager'].includes(user?.role ?? '');
  const canCreate = ['owner', 'manager', 'cashier'].includes(user?.role ?? '');

  const kanbanCols = filterStatus === 'all' ? STATUSES : STATUSES.filter(s => s.key === filterStatus);
  const filteredJobs = filterStatus === 'all' ? jobs : jobs.filter(j => j.status === filterStatus);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="page-title dark:text-white flex items-center gap-2"><Printer size={24} className="text-indigo-600" /> Print Jobs</h1>
          <p className="page-subtitle dark:text-slate-400">{jobs.length} total · {jobs.filter(j => isOverdue(j)).length} overdue</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl border border-slate-200 dark:border-slate-600 overflow-hidden">
            {(['kanban', 'table'] as const).map(v => (
              <button key={v} onClick={() => setView(v)} className={clsx('px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 transition-colors', view === v ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700')}>
                {v === 'kanban' ? <><LayoutGrid size={13} /> Board</> : <><List size={13} /> Table</>}
              </button>
            ))}
          </div>
          {canCreate && (
            <button onClick={() => setShowNew(true)} className="btn-primary flex items-center gap-2">
              <Plus size={16} /> New Job
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setFilterStatus('all')} className={clsx('px-3 py-1.5 rounded-lg text-xs font-semibold transition-all', filterStatus === 'all' ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 hover:border-indigo-300')}>
          All ({jobs.length})
        </button>
        {STATUSES.map(s => (
          <button key={s.key} onClick={() => setFilterStatus(s.key)} className={clsx('px-3 py-1.5 rounded-lg text-xs font-semibold transition-all', filterStatus === s.key ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 hover:border-indigo-300')}>
            {s.label} ({jobs.filter(j => j.status === s.key).length})
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48"><div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : view === 'kanban' ? (
        <div className={clsx('grid gap-3 items-start', kanbanCols.length === 1 ? 'grid-cols-1 max-w-xs' : kanbanCols.length <= 3 ? 'grid-cols-2 md:grid-cols-3' : 'grid-cols-2 md:grid-cols-3 xl:grid-cols-6')}>
          {kanbanCols.map(s => {
            const colJobs = jobs.filter(j => j.status === s.key);
            return (
              <div key={s.key} className="flex flex-col gap-2 min-w-0">
                <div className={clsx('flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border', s.color, s.border)}>
                  {s.icon}
                  <span className="text-xs font-bold flex-1 truncate">{s.label}</span>
                  <span className="text-xs font-bold opacity-70 shrink-0">{colJobs.length}</span>
                </div>
                {colJobs.length === 0 ? (
                  <div className="text-center py-8 text-xs text-slate-400 dark:text-slate-600 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl">Empty</div>
                ) : colJobs.map(job => (
                  <JobCard key={job.id} job={job} canUpdateStatus={canUpdateStatus} canAssign={canAssign} operators={operators} onStatusChange={handleStatusChange} onAssign={handleAssign} />
                ))}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card dark:bg-slate-800 dark:border-slate-700/50 overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-700/30 border-b border-slate-100 dark:border-slate-700">
                  {['Job #','Title','Customer','Service','Status','Amount','Due Date','Operator'].map(h => (
                    <th key={h} className="table-header px-4 py-3 text-left">{h}</th>
                  ))}
                  {canUpdateStatus && <th className="table-header px-4 py-3 text-left">Action</th>}
                </tr>
              </thead>
              <tbody>
                {filteredJobs.length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-12 text-slate-400 dark:text-slate-500">No print jobs found</td></tr>
                ) : filteredJobs.map(job => {
                  const sc = STATUS_MAP[job.status];
                  const overdue = isOverdue(job);
                  return (
                    <tr key={job.id} className={clsx('border-b border-slate-50 dark:border-slate-700/30 hover:bg-slate-50 dark:hover:bg-slate-700/20', overdue && 'bg-red-50/40 dark:bg-red-900/10')}>
                      <td className="px-4 py-3 font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400">{job.jobNumber}</td>
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-white max-w-40 truncate">{job.title}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">{job.customerName || 'Walk-in'}</td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs">{job.serviceName || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold', sc?.color)}>
                          {sc?.icon}{sc?.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900 dark:text-white">{fmt(job.totalAmount)}</td>
                      <td className={clsx('px-4 py-3 text-xs whitespace-nowrap', overdue ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-slate-500 dark:text-slate-400')}>
                        {job.dueDate ? new Date(job.dueDate).toLocaleDateString('en-GH') : '—'}{overdue && ' ⚠'}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{job.operatorName || '—'}</td>
                      {canUpdateStatus && (
                        <td className="px-4 py-3">
                          <select value={job.status} onChange={e => handleStatusChange(job.id, e.target.value)} className="text-xs border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-400">
                            {STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
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

      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowNew(false)} />
          <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg animate-fade-in border border-slate-100 dark:border-slate-700 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-700 sticky top-0 bg-white dark:bg-slate-800 z-10">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">New Print Job</h3>
              <button onClick={() => setShowNew(false)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"><X size={18} /></button>
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
                    {customers.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label dark:text-slate-300">Service</label>
                  <select value={form.serviceId} onChange={e => {
                    const svc = services.find((s: any) => String(s.id) === e.target.value);
                    setForm(p => ({ ...p, serviceId: e.target.value, unitPrice: svc?.pricePerUnit || '' }));
                  }} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                    <option value="">Select service</option>
                    {services.map((s: any) => <option key={s.id} value={s.id}>{s.name} — GH₵{s.pricePerUnit}/{s.unit}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label dark:text-slate-300">Quantity *</label>
                  <input required type="number" min="1" value={form.quantity} onChange={e => setForm(p => ({ ...p, quantity: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
                </div>
                <div>
                  <label className="label dark:text-slate-300">Unit Price (GH₵) *</label>
                  <input required type="number" step="0.01" value={form.unitPrice} onChange={e => setForm(p => ({ ...p, unitPrice: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="0.00" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label dark:text-slate-300">Assign Operator</label>
                  <select value={form.assignedTo} onChange={e => setForm(p => ({ ...p, assignedTo: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                    <option value="">Unassigned</option>
                    {operators.map((o: any) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label dark:text-slate-300">Due Date</label>
                  <input type="datetime-local" value={form.dueDate} onChange={e => setForm(p => ({ ...p, dueDate: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label dark:text-slate-300">Page Count</label>
                  <input type="number" min="1" value={form.pageCount} onChange={e => setForm(p => ({ ...p, pageCount: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="e.g. 50" />
                </div>
                <div>
                  <label className="label dark:text-slate-300">Payment Status</label>
                  <select value={form.paymentStatus} onChange={e => setForm(p => ({ ...p, paymentStatus: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                    <option value="unpaid">Unpaid</option>
                    <option value="partial">Partial</option>
                    <option value="paid">Paid</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="label dark:text-slate-300">Attach File (PDF, image, etc.)</label>
                <input type="file" accept=".pdf,.png,.jpg,.jpeg,.docx,.doc" onChange={handleFileChange} className="block w-full text-sm text-slate-500 dark:text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 dark:file:bg-indigo-900/30 dark:file:text-indigo-300 hover:file:bg-indigo-100 dark:hover:file:bg-indigo-900/50 cursor-pointer" />
                {uploadFile && <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">✓ {uploadFile.name}</p>}
              </div>
              <div>
                <label className="label dark:text-slate-300">Notes</label>
                <textarea rows={2} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white resize-none" placeholder="Special instructions..." />
              </div>
              {form.quantity && form.unitPrice && (
                <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-xl p-3 text-sm">
                  <span className="text-slate-600 dark:text-slate-300">Total: </span>
                  <span className="font-bold text-indigo-700 dark:text-indigo-400">{fmt(Number(form.quantity) * Number(form.unitPrice))}</span>
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
