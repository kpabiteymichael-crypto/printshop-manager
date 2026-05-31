import { useEffect, useState, useCallback } from 'react';
import { customersApi, debtsApi } from '../lib/api';
import {
  Users, Plus, Search, Phone, Mail, MapPin, X, ChevronRight,
  AlertCircle, TrendingUp, Printer, ShoppingCart, CreditCard, Star,
} from 'lucide-react';
import clsx from 'clsx';

const fmt = (v: string | number) => `GH₵${Number(v).toLocaleString('en-GH', { minimumFractionDigits: 2 })}`;

const TYPES = [
  { value: 'all', label: 'All Types' },
  { value: 'individual', label: 'Individual' },
  { value: 'student', label: 'Student' },
  { value: 'teacher', label: 'Teacher' },
  { value: 'school', label: 'School' },
  { value: 'business', label: 'Business' },
];

const TYPE_COLORS: Record<string, string> = {
  individual: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  student: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  teacher: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  school: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  business: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  in_progress: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  printed: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  delivered: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
  completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  paid: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  open: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  partial: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
};

function CustomerProfile({ customer, onClose }: { customer: any; onClose: () => void }) {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'overview' | 'purchases' | 'jobs' | 'debts' | 'loyalty'>('overview');
  const [showPay, setShowPay] = useState<any>(null);
  const [payForm, setPayForm] = useState({ amount: '', paymentMethod: 'cash', notes: '' });
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    customersApi.profile(customer.id).then(setProfile).finally(() => setLoading(false));
  }, [customer.id]);

  const handleAddPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setPaying(true);
    try {
      await debtsApi.addPayment(showPay.id, payForm);
      const updated = await customersApi.profile(customer.id);
      setProfile(updated);
      setShowPay(null);
      setPayForm({ amount: '', paymentMethod: 'cash', notes: '' });
    } catch (err: any) { alert(err.message); }
    finally { setPaying(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-3xl animate-fade-in border border-slate-100 dark:border-slate-700 max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-700 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold">
              {customer.name.charAt(0)}
            </div>
            <div>
              <div className="font-bold text-slate-900 dark:text-white">{customer.name}</div>
              <span className={clsx('text-xs font-semibold px-1.5 py-0.5 rounded capitalize', TYPE_COLORS[customer.type] || TYPE_COLORS.individual)}>
                {customer.type || 'individual'}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"><X size={18} /></button>
        </div>

        <div className="flex border-b border-slate-100 dark:border-slate-700 shrink-0 overflow-x-auto">
          {(['overview','purchases','jobs','debts','loyalty'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className={clsx('px-4 py-2.5 text-sm font-semibold capitalize transition-colors border-b-2 -mb-px whitespace-nowrap', tab === t ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200')}>
              {t}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-32"><div className="w-7 h-7 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>
          ) : !profile ? (
            <div className="text-center text-slate-400">Failed to load profile</div>
          ) : tab === 'overview' ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Total Spent', value: fmt(profile.totalSpent || 0), icon: <TrendingUp size={16} />, color: 'text-emerald-600 dark:text-emerald-400' },
                  { label: 'Loyalty Points', value: profile.loyaltyPoints ?? 0, icon: <ShoppingCart size={16} />, color: 'text-amber-600 dark:text-amber-400' },
                  { label: 'Outstanding', value: fmt(profile.outstandingBalance || 0), icon: <AlertCircle size={16} />, color: 'text-red-600 dark:text-red-400' },
                  { label: 'Print Jobs', value: profile.printJobs?.length ?? 0, icon: <Printer size={16} />, color: 'text-indigo-600 dark:text-indigo-400' },
                ].map(s => (
                  <div key={s.label} className="card dark:bg-slate-700/50 dark:border-slate-600 text-center p-3">
                    <div className={clsx('flex items-center justify-center mb-1', s.color)}>{s.icon}</div>
                    <div className="font-bold text-slate-900 dark:text-white">{s.value}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">{s.label}</div>
                  </div>
                ))}
              </div>
              <div className="space-y-2 text-sm">
                {profile.phone && <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300"><Phone size={14} className="text-slate-400" />{profile.phone}</div>}
                {profile.email && <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300"><Mail size={14} className="text-slate-400" />{profile.email}</div>}
                {profile.address && <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300"><MapPin size={14} className="text-slate-400" />{profile.address}</div>}
                {profile.notes && <p className="text-slate-500 dark:text-slate-400 italic text-xs mt-2">{profile.notes}</p>}
              </div>
            </div>
          ) : tab === 'purchases' ? (
            <div>
              {(!profile.recentSales || profile.recentSales.length === 0) ? (
                <div className="text-center py-8 text-slate-400">No purchases yet</div>
              ) : (
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-slate-100 dark:border-slate-700">
                    {['Sale #','Date','Amount','Method','Status'].map(h => <th key={h} className="text-left px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {profile.recentSales.map((s: any) => (
                      <tr key={s.id} className="border-b border-slate-50 dark:border-slate-700/30 hover:bg-slate-50 dark:hover:bg-slate-700/20">
                        <td className="px-3 py-2 font-mono text-xs text-indigo-600 dark:text-indigo-400 font-bold">{s.sale_number}</td>
                        <td className="px-3 py-2 text-slate-500 dark:text-slate-400 text-xs whitespace-nowrap">{new Date(s.created_at).toLocaleDateString('en-GH')}</td>
                        <td className="px-3 py-2 font-semibold text-slate-900 dark:text-white">{fmt(s.total_amount)}</td>
                        <td className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400 uppercase">{s.payment_method?.replace(/_/g,' ')}</td>
                        <td className="px-3 py-2"><span className={clsx('text-xs font-semibold px-1.5 py-0.5 rounded capitalize', STATUS_COLORS[s.payment_status] || 'bg-slate-100 text-slate-600')}>{s.payment_status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ) : tab === 'jobs' ? (
            <div>
              {(!profile.printJobs || profile.printJobs.length === 0) ? (
                <div className="text-center py-8 text-slate-400">No print jobs yet</div>
              ) : (
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-slate-100 dark:border-slate-700">
                    {['Job #','Title','Status','Amount','Due'].map(h => <th key={h} className="text-left px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {profile.printJobs.map((j: any) => (
                      <tr key={j.id} className="border-b border-slate-50 dark:border-slate-700/30 hover:bg-slate-50 dark:hover:bg-slate-700/20">
                        <td className="px-3 py-2 font-mono text-xs text-indigo-600 dark:text-indigo-400 font-bold">{j.job_number}</td>
                        <td className="px-3 py-2 font-medium text-slate-900 dark:text-white max-w-36 truncate">{j.title}</td>
                        <td className="px-3 py-2"><span className={clsx('text-xs font-semibold px-1.5 py-0.5 rounded capitalize', STATUS_COLORS[j.status])}>{j.status?.replace('_',' ')}</span></td>
                        <td className="px-3 py-2 font-semibold text-slate-900 dark:text-white">{fmt(j.total_amount)}</td>
                        <td className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">{j.due_date ? new Date(j.due_date).toLocaleDateString('en-GH') : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ) : tab === 'loyalty' ? (() => {
            const pts = profile.loyaltyPoints ?? 0;
            const tier = pts >= 2000 ? 'Gold' : pts >= 500 ? 'Silver' : 'Bronze';
            const tierColor = tier === 'Gold' ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20' : tier === 'Silver' ? 'text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700/50' : 'text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-900/20';
            const nextTier = tier === 'Bronze' ? { name: 'Silver', pts: 500 } : tier === 'Silver' ? { name: 'Gold', pts: 2000 } : null;
            const progress = nextTier ? Math.min(100, (pts / nextTier.pts) * 100) : 100;
            return (
              <div className="space-y-5">
                <div className="flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 border border-indigo-100 dark:border-indigo-800">
                  <div className="w-14 h-14 bg-white dark:bg-slate-800 rounded-full flex items-center justify-center shadow-md">
                    <Star size={28} className={tier === 'Gold' ? 'text-amber-500' : tier === 'Silver' ? 'text-slate-400' : 'text-orange-500'} fill="currentColor" />
                  </div>
                  <div>
                    <div className={clsx('text-xs font-bold px-2 py-0.5 rounded-full inline-block mb-1', tierColor)}>{tier} Member</div>
                    <div className="text-3xl font-bold text-slate-900 dark:text-white">{pts.toLocaleString()}</div>
                    <div className="text-sm text-slate-500 dark:text-slate-400">Loyalty Points</div>
                  </div>
                </div>
                {nextTier && (
                  <div>
                    <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-1.5">
                      <span>{pts} pts</span>
                      <span>{nextTier.pts} pts for {nextTier.name}</span>
                    </div>
                    <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-2">
                      <div className="bg-indigo-600 h-2 rounded-full transition-all" style={{ width: `${progress}%` }} />
                    </div>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{nextTier.pts - pts} more points to reach {nextTier.name}</p>
                  </div>
                )}
                {tier === 'Gold' && (
                  <div className="text-center py-2 text-sm font-semibold text-amber-600 dark:text-amber-400">⭐ Maximum tier reached!</div>
                )}
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-2 text-sm text-slate-600 dark:text-slate-300">
                  <div className="font-semibold text-slate-900 dark:text-white text-xs uppercase tracking-wider mb-2">How Points Are Earned</div>
                  <div className="flex items-center gap-2"><span className="w-5 h-5 bg-indigo-100 dark:bg-indigo-900/30 rounded text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-xs font-bold">1</span> Every GH₵1 spent earns 1 point</div>
                  <div className="flex items-center gap-2"><span className="w-5 h-5 bg-indigo-100 dark:bg-indigo-900/30 rounded text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-xs font-bold">2</span> Bronze (0–499) · Silver (500–1,999) · Gold (2,000+)</div>
                  <div className="flex items-center gap-2"><span className="w-5 h-5 bg-indigo-100 dark:bg-indigo-900/30 rounded text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-xs font-bold">3</span> Points are added automatically on every purchase</div>
                </div>
              </div>
            );
          })() : (
            <div className="space-y-3">
              {(!profile.debts || profile.debts.length === 0) ? (
                <div className="text-center py-8 text-slate-400">No outstanding debts</div>
              ) : profile.debts.map((d: any) => {
                const isOverdue = d.due_date && new Date(d.due_date) < new Date() && d.status !== 'paid';
                return (
                  <div key={d.id} className={clsx('border rounded-xl p-4', isOverdue ? 'border-red-300 dark:border-red-700 bg-red-50/50 dark:bg-red-900/10' : 'border-slate-200 dark:border-slate-700')}>
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <span className={clsx('text-xs font-bold px-2 py-0.5 rounded capitalize', STATUS_COLORS[d.status] || 'bg-slate-100 text-slate-600')}>{d.status}</span>
                        {d.sale_number && <span className="text-xs text-slate-400 ml-2">{d.sale_number}</span>}
                      </div>
                      {d.status !== 'paid' && (
                        <button onClick={() => setShowPay(d)} className="text-xs btn-primary py-1 px-3 flex items-center gap-1">
                          <CreditCard size={12} /> Pay
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div><div className="text-sm font-bold text-slate-900 dark:text-white">{fmt(d.total_amount)}</div><div className="text-xs text-slate-500">Total</div></div>
                      <div><div className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{fmt(d.paid_amount)}</div><div className="text-xs text-slate-500">Paid</div></div>
                      <div><div className="text-sm font-bold text-red-600 dark:text-red-400">{fmt(d.balance)}</div><div className="text-xs text-slate-500">Balance</div></div>
                    </div>
                    {d.due_date && <div className={clsx('text-xs mt-2', isOverdue ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-slate-400')}>Due: {new Date(d.due_date).toLocaleDateString('en-GH')}{isOverdue && ' ⚠'}</div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {showPay && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60" onClick={() => setShowPay(null)} />
          <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm animate-fade-in border border-slate-100 dark:border-slate-700">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
              <h4 className="font-bold text-slate-900 dark:text-white">Add Payment</h4>
              <button onClick={() => setShowPay(null)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"><X size={16} /></button>
            </div>
            <form onSubmit={handleAddPayment} className="p-5 space-y-4">
              <div className="text-sm text-slate-500 dark:text-slate-400">Outstanding: <strong className="text-red-600 dark:text-red-400">{fmt(showPay.balance)}</strong></div>
              <div>
                <label className="label dark:text-slate-300">Amount (GH₵) *</label>
                <input required type="number" step="0.01" max={showPay.balance} value={payForm.amount} onChange={e => setPayForm(p => ({ ...p, amount: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="0.00" />
              </div>
              <div>
                <label className="label dark:text-slate-300">Payment Method</label>
                <select value={payForm.paymentMethod} onChange={e => setPayForm(p => ({ ...p, paymentMethod: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                  <option value="cash">Cash</option>
                  <option value="mtn_momo">MTN MoMo</option>
                  <option value="telecel_cash">Telecel Cash</option>
                  <option value="airteltigo">AirtelTigo</option>
                  <option value="bank_transfer">Bank Transfer</option>
                </select>
              </div>
              <div>
                <label className="label dark:text-slate-300">Notes</label>
                <input value={payForm.notes} onChange={e => setPayForm(p => ({ ...p, notes: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="Optional note..." />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowPay(null)} className="flex-1 btn-secondary">Cancel</button>
                <button type="submit" disabled={paying} className="flex-1 btn-primary">{paying ? 'Recording...' : 'Record Payment'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Customers() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [showNew, setShowNew] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '', address: '', notes: '', type: 'individual' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    customersApi.list({ search: search || undefined, type: typeFilter !== 'all' ? typeFilter : undefined })
      .then(setCustomers).finally(() => setLoading(false));
  }, [search, typeFilter]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const c = await customersApi.create(form);
      setCustomers(prev => [c, ...prev]);
      setShowNew(false);
      setForm({ name: '', email: '', phone: '', address: '', notes: '', type: 'individual' });
    } catch (err: any) { alert(err.message); }
    finally { setSaving(false); }
  };

  const filtered = customers.filter(c => {
    if (!search) return true;
    const s = search.toLowerCase();
    return c.name.toLowerCase().includes(s) || c.phone?.includes(search) || c.email?.toLowerCase().includes(s);
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="page-title dark:text-white flex items-center gap-2"><Users size={24} className="text-indigo-600" /> Customers</h1>
          <p className="page-subtitle dark:text-slate-400">{customers.length} customers registered</p>
        </div>
        <button onClick={() => setShowNew(true)} className="btn-primary flex items-center gap-2"><Plus size={16} /> Add Customer</button>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, phone, email..." className="input pl-9 dark:bg-slate-800 dark:border-slate-600 dark:text-white dark:placeholder-slate-400 w-full" />
        </div>
        <div className="flex gap-2 flex-wrap">
          {TYPES.map(t => (
            <button key={t.value} onClick={() => setTypeFilter(t.value)} className={clsx('px-3 py-1.5 rounded-lg text-xs font-semibold transition-all', typeFilter === t.value ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 hover:border-indigo-300')}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48"><div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="card dark:bg-slate-800 dark:border-slate-700/50 overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-700/30 border-b border-slate-100 dark:border-slate-700">
                  {['Customer','Type','Phone','Email','Total Spent','Actions'].map(h => (
                    <th key={h} className="table-header px-4 py-3 text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-12 text-slate-400 dark:text-slate-500">No customers found</td></tr>
                ) : filtered.map(c => (
                  <tr key={c.id} className="border-b border-slate-50 dark:border-slate-700/30 hover:bg-slate-50 dark:hover:bg-slate-700/20 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center text-indigo-700 dark:text-indigo-400 font-bold text-sm shrink-0">
                          {c.name.charAt(0)}
                        </div>
                        <div>
                          <div className="font-semibold text-slate-900 dark:text-white">{c.name}</div>
                          {c.loyaltyPoints > 0 && <div className="text-xs text-amber-600 dark:text-amber-400">⭐ {c.loyaltyPoints} pts</div>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={clsx('text-xs font-semibold px-2 py-0.5 rounded capitalize', TYPE_COLORS[c.type] || TYPE_COLORS.individual)}>
                        {c.type || 'individual'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300 text-sm">{c.phone || '—'}</td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-sm">{c.email || '—'}</td>
                    <td className="px-4 py-3 font-semibold text-emerald-600 dark:text-emerald-400">{fmt(c.totalSpent)}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => setSelectedCustomer(c)} className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-semibold">
                        View Profile <ChevronRight size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedCustomer && (
        <CustomerProfile customer={selectedCustomer} onClose={() => setSelectedCustomer(null)} />
      )}

      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowNew(false)} />
          <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md animate-fade-in border border-slate-100 dark:border-slate-700">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-700">
              <h3 className="font-bold text-slate-900 dark:text-white">Add Customer</h3>
              <button onClick={() => setShowNew(false)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"><X size={18} /></button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div>
                <label className="label dark:text-slate-300">Name *</label>
                <input required value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label dark:text-slate-300">Type</label>
                  <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                    {TYPES.filter(t => t.value !== 'all').map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label dark:text-slate-300">Phone</label>
                  <input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="+233..." />
                </div>
              </div>
              <div>
                <label className="label dark:text-slate-300">Email</label>
                <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
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
                <button type="submit" disabled={saving} className="flex-1 btn-primary">{saving ? 'Saving...' : 'Add Customer'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
