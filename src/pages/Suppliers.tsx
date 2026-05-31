import { useEffect, useState } from 'react';
import { suppliersApi } from '../lib/api';
import { Truck, Plus, Phone, Mail, MapPin, User } from 'lucide-react';

export default function Suppliers() {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: '', contactName: '', email: '', phone: '', address: '', notes: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => { suppliersApi.list().then(setSuppliers).finally(() => setLoading(false)); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const s = await suppliersApi.create(form);
      setSuppliers(prev => [s, ...prev]);
      setShowNew(false);
      setForm({ name: '', contactName: '', email: '', phone: '', address: '', notes: '' });
    } catch (err: any) { alert(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="page-title dark:text-white flex items-center gap-2"><Truck size={24} className="text-indigo-600" /> Suppliers</h1>
          <p className="page-subtitle dark:text-slate-400">{suppliers.filter(s => s.isActive).length} active suppliers</p>
        </div>
        <button onClick={() => setShowNew(true)} className="btn-primary flex items-center gap-2"><Plus size={16} /> Add Supplier</button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48"><div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {suppliers.length === 0 ? (
            <div className="col-span-full text-center py-12 text-slate-400 dark:text-slate-500">No suppliers yet</div>
          ) : suppliers.map(s => (
            <div key={s.id} className="card dark:bg-slate-800 dark:border-slate-700/50 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center text-blue-700 dark:text-blue-400 font-bold text-lg flex-shrink-0">
                  {s.name.charAt(0).toUpperCase()}
                </div>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${s.isActive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'}`}>
                  {s.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
              <h3 className="font-bold text-slate-900 dark:text-white">{s.name}</h3>
              <div className="mt-2 space-y-1">
                {s.contactName && <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400"><User size={11} />{s.contactName}</div>}
                {s.phone && <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400"><Phone size={11} />{s.phone}</div>}
                {s.email && <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400"><Mail size={11} />{s.email}</div>}
                {s.address && <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400"><MapPin size={11} />{s.address}</div>}
              </div>
              {s.notes && <p className="mt-2 text-xs text-slate-400 dark:text-slate-500 italic">{s.notes}</p>}
            </div>
          ))}
        </div>
      )}

      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowNew(false)} />
          <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md animate-fade-in border border-slate-100 dark:border-slate-700">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
              <h3 className="font-bold text-slate-900 dark:text-white">Add Supplier</h3>
              <button onClick={() => setShowNew(false)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700">✕</button>
            </div>
            <form onSubmit={handleCreate} className="p-5 space-y-4">
              <div>
                <label className="label dark:text-slate-300">Company Name *</label>
                <input required value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
              </div>
              <div>
                <label className="label dark:text-slate-300">Contact Person</label>
                <input value={form.contactName} onChange={e => setForm(p => ({ ...p, contactName: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label dark:text-slate-300">Phone</label>
                  <input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
                </div>
                <div>
                  <label className="label dark:text-slate-300">Email</label>
                  <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
                </div>
              </div>
              <div>
                <label className="label dark:text-slate-300">Address</label>
                <input value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
              </div>
              <div>
                <label className="label dark:text-slate-300">Notes</label>
                <textarea rows={2} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} className="input resize-none dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowNew(false)} className="flex-1 btn-secondary">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 btn-primary">{saving ? 'Saving...' : 'Add Supplier'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
