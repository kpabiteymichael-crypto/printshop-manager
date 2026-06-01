import { useEffect, useState } from 'react';
import { settingsApi } from '../lib/api';
import api from '../lib/api';
import { UserCog, Plus, Shield, CheckCircle, XCircle, Activity, RefreshCw, ShieldAlert } from 'lucide-react';
import clsx from 'clsx';

const ROLES = [
  { value: 'owner', label: 'Owner', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
  { value: 'manager', label: 'Manager', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  { value: 'cashier', label: 'Cashier', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
  { value: 'print_operator', label: 'Print Operator', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' },
  { value: 'inventory_officer', label: 'Inv. Officer', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
];

const roleColor = (role: string) => ROLES.find(r => r.value === role)?.color ?? '';
const roleLabel = (role: string) => ROLES.find(r => r.value === role)?.label ?? role;

interface StaffMember {
  id: number;
  name: string;
  email: string;
  role: string;
  phone?: string;
  isActive: boolean;
  createdAt: string;
  totalSales?: number;
  totalRevenue?: number;
  printJobsCount?: number;
  lastSaleAt?: string;
  lastLoginAt?: string | null;
}

interface ActivityEntry {
  id: number;
  userId: number;
  userName: string;
  activityType: string;
  description: string;
  createdAt: string;
}

function ActivityLog({ staffId, staffName }: { staffId: number | null; staffName: string }) {
  const [logs, setLogs] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (staffId === null) {
      setLoading(true);
      api.get('/settings/staff/activity').then(r => setLogs(r.data)).catch(() => setLogs([])).finally(() => setLoading(false));
    } else {
      setLoading(true);
      api.get(`/settings/staff/activity?userId=${staffId}`).then(r => setLogs(r.data)).catch(() => setLogs([])).finally(() => setLoading(false));
    }
  }, [staffId]);

  const activityTypeColor = (type: string) => {
    if (type === 'sale') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
    if (type === 'print_job') return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400';
    if (type === 'login') return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
    return 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300';
  };

  return (
    <div className="card dark:bg-slate-800 dark:border-slate-700/50">
      <div className="flex items-center justify-between mb-4">
        <h2 className="section-title mb-0 dark:text-white flex items-center gap-2">
          <Activity size={16} className="text-indigo-500" />
          {staffId !== null ? `Activity — ${staffName}` : 'All Staff Activity'}
        </h2>
        <button onClick={() => {
          setLoading(true);
          const url = staffId !== null ? `/settings/staff/activity?userId=${staffId}` : '/settings/staff/activity';
          api.get(url).then(r => setLogs(r.data)).catch(() => {}).finally(() => setLoading(false));
        }} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>
      {loading ? (
        <div className="flex items-center justify-center h-32"><div className="w-6 h-6 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : logs.length === 0 ? (
        <div className="text-center py-8 text-slate-400 dark:text-slate-500 text-sm">No activity recorded yet</div>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {logs.map(log => (
            <div key={log.id} className="flex items-start gap-3 py-2 border-b border-slate-50 dark:border-slate-700/50 last:border-0">
              <span className={clsx('inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase flex-shrink-0 mt-0.5', activityTypeColor(log.activityType))}>
                {log.activityType?.replace('_', ' ')}
              </span>
              <div className="flex-1 min-w-0">
                {staffId === null && <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">{log.userName}</div>}
                <div className="text-xs text-slate-600 dark:text-slate-300">{log.description}</div>
                <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                  {new Date(log.createdAt).toLocaleString('en-GH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface SecurityEvent {
  id: number;
  userId: number | null;
  userName: string | null;
  userEmail: string | null;
  userRole: string | null;
  route: string;
  method: string;
  requiredRoles: string[];
  ipAddress: string | null;
  createdAt: string;
}

function SecurityEvents() {
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    settingsApi.securityEvents(100)
      .then(setEvents)
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const methodColor = (m: string) => {
    if (m === 'GET') return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
    if (m === 'POST') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
    if (m === 'PUT' || m === 'PATCH') return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
    if (m === 'DELETE') return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    return 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300';
  };

  return (
    <div className="card dark:bg-slate-800 dark:border-slate-700/50">
      <div className="flex items-center justify-between mb-4">
        <h2 className="section-title mb-0 dark:text-white flex items-center gap-2">
          <ShieldAlert size={16} className="text-red-500" />
          Security Events
          {events.length > 0 && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
              {events.length}
            </span>
          )}
        </h2>
        <button onClick={load} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
        Unauthorized API access attempts (403 Forbidden) recorded in the last 100 events.
      </p>
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-6 h-6 border-4 border-red-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : events.length === 0 ? (
        <div className="text-center py-10">
          <ShieldAlert size={32} className="mx-auto text-slate-300 dark:text-slate-600 mb-2" />
          <p className="text-sm text-slate-400 dark:text-slate-500">No unauthorized access attempts recorded</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-700/30 border-b border-slate-100 dark:border-slate-700">
                <th className="table-header px-3 py-2.5 text-left">Staff Member</th>
                <th className="table-header px-3 py-2.5 text-left">Role</th>
                <th className="table-header px-3 py-2.5 text-left">Method</th>
                <th className="table-header px-3 py-2.5 text-left">Route Attempted</th>
                <th className="table-header px-3 py-2.5 text-left">Required Roles</th>
                <th className="table-header px-3 py-2.5 text-left">IP Address</th>
                <th className="table-header px-3 py-2.5 text-left">Time</th>
              </tr>
            </thead>
            <tbody>
              {events.map(ev => (
                <tr key={ev.id} className="border-b border-slate-50 dark:border-slate-700/30 hover:bg-red-50/30 dark:hover:bg-red-900/10 transition-colors">
                  <td className="px-3 py-2.5">
                    {ev.userName ? (
                      <div>
                        <div className="font-medium text-slate-900 dark:text-white text-xs">{ev.userName}</div>
                        <div className="text-[11px] text-slate-400 dark:text-slate-500">{ev.userEmail}</div>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400 dark:text-slate-500 italic">Unknown</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {ev.userRole ? (
                      <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold', roleColor(ev.userRole))}>
                        <Shield size={9} />{roleLabel(ev.userRole)}
                      </span>
                    ) : <span className="text-xs text-slate-400">—</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={clsx('inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase', methodColor(ev.method))}>
                      {ev.method}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <code className="text-[11px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-1.5 py-0.5 rounded font-mono break-all">
                      {ev.route}
                    </code>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {(ev.requiredRoles ?? []).map(r => (
                        <span key={r} className={clsx('inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold', roleColor(r))}>
                          {roleLabel(r)}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                    {ev.ipAddress ?? '—'}
                  </td>
                  <td className="px-3 py-2.5 text-[11px] text-slate-400 dark:text-slate-500 whitespace-nowrap">
                    {new Date(ev.createdAt).toLocaleString('en-GH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function EditStaffModal({ member, onClose, onUpdated }: { member: StaffMember; onClose: () => void; onUpdated: (s: StaffMember) => void }) {
  const [form, setForm] = useState({ name: member.name, phone: member.phone ?? '', role: member.role });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await settingsApi.updateStaff(member.id, { name: form.name, phone: form.phone, role: form.role });
      onUpdated({ ...member, name: form.name, phone: form.phone, role: form.role });
      onClose();
    } catch (err: any) { setError(err.message ?? 'Failed to update'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm border border-slate-100 dark:border-slate-700">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <h3 className="font-bold text-slate-900 dark:text-white">Edit Staff — {member.name}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"><XCircle size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-xl p-3">{error}</div>}
          <div>
            <label className="label dark:text-slate-300">Full Name</label>
            <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" required />
          </div>
          <div>
            <label className="label dark:text-slate-300">Phone</label>
            <input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="+233 ..." />
          </div>
          <div>
            <label className="label dark:text-slate-300">Role</label>
            <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white">
              {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 btn-primary">{saving ? 'Saving...' : 'Save Changes'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Staff() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [editStaff, setEditStaff] = useState<StaffMember | null>(null);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'cashier', phone: '' });
  const [saving, setSaving] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);
  const [activeTab, setActiveTab] = useState<'list' | 'activity' | 'security'>('list');
  const [securityCount, setSecurityCount] = useState(0);

  useEffect(() => {
    settingsApi.getStaff().then(setStaff).finally(() => setLoading(false));
    settingsApi.securityEventsCount().then((d: any) => setSecurityCount(d.count ?? 0)).catch(() => {});
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const s = await settingsApi.createStaff(form);
      setStaff(prev => [...prev, s]);
      setShowNew(false);
      setForm({ name: '', email: '', password: '', role: 'cashier', phone: '' });
    } catch (err: any) { alert(err.message); }
    finally { setSaving(false); }
  };

  const handleToggleActive = async (id: number, isActive: boolean) => {
    try {
      await settingsApi.updateStaff(id, { isActive: !isActive });
      setStaff(prev => prev.map(s => s.id === id ? { ...s, isActive: !isActive } : s));
    } catch (err: any) { alert(err.message); }
  };

  const activeCount = staff.filter(s => s.isActive).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="page-title dark:text-white flex items-center gap-2"><UserCog size={24} className="text-indigo-600" /> Staff Management</h1>
          <p className="page-subtitle dark:text-slate-400">{activeCount} active of {staff.length} total staff</p>
        </div>
        <button onClick={() => setShowNew(true)} className="btn-primary flex items-center gap-2"><Plus size={16} /> Add Staff</button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-700">
        <button onClick={() => setActiveTab('list')}
          className={clsx('px-5 py-3 text-sm font-semibold transition-colors border-b-2 -mb-px',
            activeTab === 'list' ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200')}>
          Staff List
        </button>
        <button onClick={() => setActiveTab('activity')}
          className={clsx('px-5 py-3 text-sm font-semibold transition-colors border-b-2 -mb-px',
            activeTab === 'activity' ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200')}>
          Activity Log
        </button>
        <button onClick={() => setActiveTab('security')}
          className={clsx('px-5 py-3 text-sm font-semibold transition-colors border-b-2 -mb-px flex items-center gap-2',
            activeTab === 'security' ? 'border-red-500 text-red-600 dark:text-red-400 dark:border-red-400' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200')}>
          <ShieldAlert size={14} />
          Security Events
          {securityCount > 0 && (
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold bg-red-500 text-white">
              {securityCount > 99 ? '99+' : securityCount}
            </span>
          )}
        </button>
      </div>

      {activeTab === 'list' ? (
        loading ? (
          <div className="flex items-center justify-center h-48"><div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>
        ) : (
          <div className="card dark:bg-slate-800 dark:border-slate-700/50 overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-700/30 border-b border-slate-100 dark:border-slate-700">
                    <th className="table-header px-4 py-3 text-left">Name</th>
                    <th className="table-header px-4 py-3 text-left">Role</th>
                    <th className="table-header px-4 py-3 text-right">Sales (30d)</th>
                    <th className="table-header px-4 py-3 text-right">Revenue (30d)</th>
                    <th className="table-header px-4 py-3 text-right">Print Jobs (30d)</th>
                    <th className="table-header px-4 py-3 text-left">Last Sale</th>
                    <th className="table-header px-4 py-3 text-left">Last Login</th>
                    <th className="table-header px-4 py-3 text-left">Status</th>
                    <th className="table-header px-4 py-3 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {staff.map(s => (
                    <tr key={s.id} className="border-b border-slate-50 dark:border-slate-700/30 hover:bg-slate-50 dark:hover:bg-slate-700/20 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center text-indigo-700 dark:text-indigo-400 font-bold text-sm flex-shrink-0">
                            {s.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-medium text-slate-900 dark:text-white">{s.name}</div>
                            <div className="text-xs text-slate-400 dark:text-slate-500">{s.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold', roleColor(s.role))}>
                          <Shield size={10} />{roleLabel(s.role)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-slate-700 dark:text-slate-200">{s.totalSales ?? 0}</td>
                      <td className="px-4 py-3 text-right font-medium text-emerald-600 dark:text-emerald-400">
                        {s.totalRevenue ? `₵${Number(s.totalRevenue).toLocaleString('en-GH', { minimumFractionDigits: 2 })}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-orange-600 dark:text-orange-400">{s.printJobsCount ?? 0}</td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs">
                        {s.lastSaleAt ? new Date(s.lastSaleAt).toLocaleDateString('en-GH') : '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs">
                        {s.lastLoginAt ? new Date(s.lastLoginAt).toLocaleString('en-GH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold', s.isActive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400')}>
                          {s.isActive ? <><CheckCircle size={10} /> Active</> : <><XCircle size={10} /> Inactive</>}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <button
                            onClick={() => setEditStaff(s)}
                            className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => { setSelectedStaff(s); setActiveTab('activity'); }}
                            className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors"
                          >
                            Log
                          </button>
                          <button
                            onClick={() => handleToggleActive(s.id, s.isActive)}
                            className={clsx('text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors', s.isActive ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100' : 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100')}
                          >
                            {s.isActive ? 'Deactivate' : 'Activate'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : activeTab === 'activity' ? (
        <div className="space-y-4">
          {selectedStaff && (
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm text-slate-500 dark:text-slate-400">Viewing:</span>
              <button onClick={() => setSelectedStaff(null)} className="text-xs px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">
                All Staff ×
              </button>
              {staff.map(s => (
                <button key={s.id} onClick={() => setSelectedStaff(s)}
                  className={clsx('text-xs px-2.5 py-1 rounded-full transition-colors', selectedStaff?.id === s.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600')}>
                  {s.name}
                </button>
              ))}
            </div>
          )}
          <ActivityLog staffId={selectedStaff?.id ?? null} staffName={selectedStaff?.name ?? ''} />
        </div>
      ) : (
        <SecurityEvents />
      )}

      {editStaff && (
        <EditStaffModal
          member={editStaff}
          onClose={() => setEditStaff(null)}
          onUpdated={(updated) => {
            setStaff(prev => prev.map(s => s.id === updated.id ? { ...s, ...updated } : s));
            setEditStaff(null);
          }}
        />
      )}

      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowNew(false)} />
          <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md animate-fade-in border border-slate-100 dark:border-slate-700">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
              <h3 className="font-bold text-slate-900 dark:text-white">Add Staff Member</h3>
              <button onClick={() => setShowNew(false)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700">✕</button>
            </div>
            <form onSubmit={handleCreate} className="p-5 space-y-4">
              <div>
                <label className="label dark:text-slate-300">Full Name *</label>
                <input required value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" minLength={2} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label dark:text-slate-300">Email *</label>
                  <input required type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
                </div>
                <div>
                  <label className="label dark:text-slate-300">Phone</label>
                  <input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
                </div>
              </div>
              <div>
                <label className="label dark:text-slate-300">Password *</label>
                <input required type="password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" minLength={6} placeholder="Min. 6 characters" />
              </div>
              <div>
                <label className="label dark:text-slate-300">Role *</label>
                <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                  {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowNew(false)} className="flex-1 btn-secondary">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 btn-primary">{saving ? 'Adding...' : 'Add Staff'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
