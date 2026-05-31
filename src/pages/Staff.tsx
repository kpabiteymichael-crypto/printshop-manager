import { useEffect, useState } from 'react';
import { settingsApi } from '../lib/api';
import { UserCog, Plus, Shield, CheckCircle, XCircle } from 'lucide-react';
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

export default function Staff() {
  const [staff, setStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'cashier', phone: '' });
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<any>({});

  useEffect(() => { settingsApi.getStaff().then(setStaff).finally(() => setLoading(false)); }, []);

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="page-title dark:text-white flex items-center gap-2"><UserCog size={24} className="text-indigo-600" /> Staff Management</h1>
          <p className="page-subtitle dark:text-slate-400">{staff.filter(s => s.isActive).length} active staff members</p>
        </div>
        <button onClick={() => setShowNew(true)} className="btn-primary flex items-center gap-2"><Plus size={16} /> Add Staff</button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48"><div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="card dark:bg-slate-800 dark:border-slate-700/50 overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-700/30 border-b border-slate-100 dark:border-slate-700">
                  <th className="table-header px-4 py-3 text-left">Name</th>
                  <th className="table-header px-4 py-3 text-left">Email</th>
                  <th className="table-header px-4 py-3 text-left">Role</th>
                  <th className="table-header px-4 py-3 text-left">Phone</th>
                  <th className="table-header px-4 py-3 text-left">Status</th>
                  <th className="table-header px-4 py-3 text-left">Joined</th>
                  <th className="table-header px-4 py-3 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {staff.map(s => (
                  <tr key={s.id} className="border-b border-slate-50 dark:border-slate-700/30 hover:bg-slate-50 dark:hover:bg-slate-700/20 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center text-indigo-700 dark:text-indigo-400 font-bold text-sm">
                          {s.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium text-slate-900 dark:text-white">{s.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{s.email}</td>
                    <td className="px-4 py-3">
                      <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold', roleColor(s.role))}>
                        <Shield size={10} />{roleLabel(s.role)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{s.phone || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold', s.isActive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400')}>
                        {s.isActive ? <><CheckCircle size={10} /> Active</> : <><XCircle size={10} /> Inactive</>}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs">
                      {new Date(s.createdAt).toLocaleDateString('en-PH')}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleToggleActive(s.id, s.isActive)}
                        className={clsx('text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors', s.isActive ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100' : 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100')}
                      >
                        {s.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
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
