import { useEffect, useState } from 'react';
import { settingsApi } from '../lib/api';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { UserCog, Plus, Shield, CheckCircle, XCircle, Activity, RefreshCw, ShieldAlert, Key, Trash2 } from 'lucide-react';
import clsx from 'clsx';

const ROLES = [
  { value: 'owner', label: 'Owner', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
  { value: 'manager', label: 'Manager', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  { value: 'cashier', label: 'Cashier', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
  { value: 'print_operator', label: 'Print Operator', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' },
  { value: 'inventory_officer', label: 'Inv. Officer', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
];

const MODULES = [
  { value: 'dashboard', label: 'Dashboard' },
  { value: 'pos', label: 'POS (Point of Sale)' },
  { value: 'print-jobs', label: 'Print Jobs' },
  { value: 'inventory', label: 'Inventory' },
  { value: 'bookstore', label: 'Bookstore' },
  { value: 'customers', label: 'Customers' },
  { value: 'suppliers', label: 'Suppliers' },
  { value: 'purchase-orders', label: 'Purchase Orders' },
  { value: 'cash', label: 'Cash Management' },
  { value: 'expenses', label: 'Expenses' },
  { value: 'debts', label: 'Debts' },
  { value: 'reports', label: 'Reports' },
  { value: 'receipts', label: 'Receipts' },
  { value: 'sales', label: 'Sales History' },
  { value: 'quotations', label: 'Quotations' },
  { value: 'invoices', label: 'Invoices' },
  { value: 'staff', label: 'Staff Management' },
  { value: 'settings', label: 'Settings' },
];

const moduleLabel = (v: string) => MODULES.find(m => m.value === v)?.label ?? v;
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

interface PermissionOverride {
  id: number;
  userId: number;
  module: string;
  grantedBy: number;
  expiresAt: string;
  reason: string | null;
  isRevoked: boolean;
  createdAt: string;
  userName: string;
  userEmail: string;
  userRole: string;
  grantedByName: string;
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

function GrantOverrideModal({
  staff,
  onClose,
  onGranted,
}: {
  staff: StaffMember[];
  onClose: () => void;
  onGranted: () => void;
}) {
  const [form, setForm] = useState({
    userId: '',
    module: '',
    expiresAt: '',
    reason: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDate = tomorrow.toISOString().slice(0, 10);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.userId || !form.module || !form.expiresAt) {
      setError('Please fill in all required fields');
      return;
    }
    setSaving(true);
    try {
      await settingsApi.grantOverride({
        userId: Number(form.userId),
        module: form.module,
        expiresAt: new Date(form.expiresAt + 'T23:59:59').toISOString(),
        reason: form.reason || undefined,
      });
      onGranted();
      onClose();
    } catch (err: any) {
      setError(err.message ?? 'Failed to grant override');
    } finally {
      setSaving(false);
    }
  };

  const nonOwnerStaff = staff.filter(s => s.role !== 'owner' && s.isActive);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md border border-slate-100 dark:border-slate-700">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Key size={16} className="text-indigo-500" />
            Grant Temporary Access
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"><XCircle size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-xl p-3">{error}</div>}
          <div>
            <label className="label dark:text-slate-300">Staff Member *</label>
            <select
              value={form.userId}
              onChange={e => setForm(p => ({ ...p, userId: e.target.value }))}
              className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white"
              required
            >
              <option value="">Select staff member…</option>
              {nonOwnerStaff.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} ({roleLabel(s.role)})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label dark:text-slate-300">Module to Grant Access To *</label>
            <select
              value={form.module}
              onChange={e => setForm(p => ({ ...p, module: e.target.value }))}
              className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white"
              required
            >
              <option value="">Select module…</option>
              {MODULES.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label dark:text-slate-300">Access Expires On *</label>
            <input
              type="date"
              min={minDate}
              value={form.expiresAt}
              onChange={e => setForm(p => ({ ...p, expiresAt: e.target.value }))}
              className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white"
              required
            />
          </div>
          <div>
            <label className="label dark:text-slate-300">Reason (optional)</label>
            <input
              value={form.reason}
              onChange={e => setForm(p => ({ ...p, reason: e.target.value }))}
              className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white"
              placeholder="e.g. Manager absent — covering reports"
              maxLength={500}
            />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 btn-primary">
              {saving ? 'Granting…' : 'Grant Access'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PermissionOverrides({ staff }: { staff: StaffMember[] }) {
  const [overrides, setOverrides] = useState<PermissionOverride[]>([]);
  const [loading, setLoading] = useState(false);
  const [showGrant, setShowGrant] = useState(false);
  const [revoking, setRevoking] = useState<number | null>(null);
  const [filter, setFilter] = useState<'active' | 'all'>('active');

  const load = () => {
    setLoading(true);
    settingsApi.permissionOverrides()
      .then(setOverrides)
      .catch(() => setOverrides([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleRevoke = async (id: number) => {
    if (!confirm('Revoke this access override? The staff member will immediately lose this extra access.')) return;
    setRevoking(id);
    try {
      await settingsApi.revokeOverride(id);
      setOverrides(prev => prev.map(o => o.id === id ? { ...o, isRevoked: true } : o));
    } catch (err: any) {
      alert(err.message ?? 'Failed to revoke override');
    } finally {
      setRevoking(null);
    }
  };

  const isExpired = (expiresAt: string) => new Date(expiresAt) <= new Date();
  const isActive = (o: PermissionOverride) => !o.isRevoked && !isExpired(o.expiresAt);

  const filtered = filter === 'active' ? overrides.filter(isActive) : overrides;
  const activeCount = overrides.filter(isActive).length;

  return (
    <div className="space-y-4">
      <div className="card dark:bg-slate-800 dark:border-slate-700/50">
        <div className="flex items-center justify-between mb-1">
          <h2 className="section-title mb-0 dark:text-white flex items-center gap-2">
            <Key size={16} className="text-indigo-500" />
            Permission Overrides
            {activeCount > 0 && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400">
                {activeCount} active
              </span>
            )}
          </h2>
          <div className="flex items-center gap-2">
            <button onClick={load} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={() => setShowGrant(true)}
              className="btn-primary flex items-center gap-1.5 text-xs py-1.5 px-3"
            >
              <Plus size={14} /> Grant Access
            </button>
          </div>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          Temporarily allow a staff member to access a module beyond their normal role. Access expires automatically on the set date.
        </p>

        <div className="flex gap-2 mb-4">
          {(['active', 'all'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={clsx('text-xs px-3 py-1.5 rounded-lg font-medium transition-colors', filter === f
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600')}
            >
              {f === 'active' ? 'Active Only' : 'All Records'}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-6 h-6 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-10">
            <Key size={32} className="mx-auto text-slate-300 dark:text-slate-600 mb-2" />
            <p className="text-sm text-slate-400 dark:text-slate-500">
              {filter === 'active' ? 'No active overrides' : 'No overrides recorded yet'}
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Click "Grant Access" to give a staff member temporary extra access</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-700/30 border-b border-slate-100 dark:border-slate-700">
                  <th className="table-header px-3 py-2.5 text-left">Staff Member</th>
                  <th className="table-header px-3 py-2.5 text-left">Module</th>
                  <th className="table-header px-3 py-2.5 text-left">Reason</th>
                  <th className="table-header px-3 py-2.5 text-left">Granted By</th>
                  <th className="table-header px-3 py-2.5 text-left">Expires</th>
                  <th className="table-header px-3 py-2.5 text-left">Status</th>
                  <th className="table-header px-3 py-2.5 text-left">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(o => {
                  const active = isActive(o);
                  const expired = isExpired(o.expiresAt);
                  return (
                    <tr key={o.id} className={clsx('border-b border-slate-50 dark:border-slate-700/30 transition-colors', active ? 'hover:bg-indigo-50/30 dark:hover:bg-indigo-900/10' : 'opacity-60')}>
                      <td className="px-3 py-2.5">
                        <div className="font-medium text-slate-900 dark:text-white text-xs">{o.userName}</div>
                        <div className="text-[11px] text-slate-400 dark:text-slate-500">{o.userEmail}</div>
                        <span className={clsx('inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold mt-0.5', roleColor(o.userRole))}>
                          <Shield size={8} />{roleLabel(o.userRole)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 text-[11px] font-semibold">
                          {moduleLabel(o.module)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-500 dark:text-slate-400 max-w-[160px] truncate">
                        {o.reason ?? <span className="italic text-slate-300 dark:text-slate-600">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-600 dark:text-slate-300">{o.grantedByName}</td>
                      <td className="px-3 py-2.5">
                        <div className={clsx('text-xs font-medium', expired ? 'text-red-500 dark:text-red-400' : 'text-slate-700 dark:text-slate-200')}>
                          {new Date(o.expiresAt).toLocaleDateString('en-GH', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        {o.isRevoked ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                            <XCircle size={9} /> Revoked
                          </span>
                        ) : expired ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                            Expired
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                            <CheckCircle size={9} /> Active
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        {active && (
                          <button
                            onClick={() => handleRevoke(o.id)}
                            disabled={revoking === o.id}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors disabled:opacity-50"
                          >
                            <Trash2 size={11} />
                            {revoking === o.id ? '…' : 'Revoke'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showGrant && (
        <GrantOverrideModal
          staff={staff}
          onClose={() => setShowGrant(false)}
          onGranted={load}
        />
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
  const { user } = useAuth();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [editStaff, setEditStaff] = useState<StaffMember | null>(null);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'cashier', phone: '' });
  const [saving, setSaving] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);
  const [activeTab, setActiveTab] = useState<'list' | 'activity' | 'security' | 'overrides'>('list');
  const [securityCount, setSecurityCount] = useState(0);

  const isOwner = user?.role === 'owner';

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
        {activeTab === 'list' && (
          <button onClick={() => setShowNew(true)} className="btn-primary flex items-center gap-2"><Plus size={16} /> Add Staff</button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-700 flex-wrap gap-y-0">
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
        {isOwner && (
          <button onClick={() => setActiveTab('overrides')}
            className={clsx('px-5 py-3 text-sm font-semibold transition-colors border-b-2 -mb-px flex items-center gap-2',
              activeTab === 'overrides' ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200')}>
            <Key size={14} />
            Access Overrides
          </button>
        )}
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
                          {isOwner && (
                            <button
                              onClick={() => setEditStaff(s)}
                              className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                            >
                              Edit
                            </button>
                          )}
                          <button
                            onClick={() => { setSelectedStaff(s); setActiveTab('activity'); }}
                            className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors"
                          >
                            Log
                          </button>
                          {isOwner && (
                            <button
                              onClick={() => handleToggleActive(s.id, s.isActive)}
                              className={clsx('text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors', s.isActive ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100' : 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100')}
                            >
                              {s.isActive ? 'Deactivate' : 'Activate'}
                            </button>
                          )}
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
      ) : activeTab === 'security' ? (
        <SecurityEvents />
      ) : (
        <PermissionOverrides staff={staff} />
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
