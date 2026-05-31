import { useEffect, useState } from 'react';
import { invoicesApi, customersApi, pdfApi } from '../lib/api';
import { BookOpen, Plus, X, Trash2, MessageCircle, Printer, CheckCircle, Clock, AlertCircle, Download } from 'lucide-react';
import clsx from 'clsx';

const fmt = (v: number) => `₵${Number(v).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface LineItem { description: string; quantity: number; unitPrice: number; total: number }
const emptyLine = (): LineItem => ({ description: '', quantity: 1, unitPrice: 0, total: 0 });

const STATUS_STYLES: Record<string, string> = {
  paid: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  unpaid: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  partial: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
};
const STATUS_ICONS: Record<string, React.ReactNode> = {
  paid: <CheckCircle size={10} />,
  unpaid: <AlertCircle size={10} />,
  partial: <Clock size={10} />,
};

function InvoiceDetail({ inv, onClose, onStatusChange }: { inv: any; onClose: () => void; onStatusChange: (id: number, status: string) => void }) {
  const [detail, setDetail] = useState<any>(inv);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const handleDownloadPDF = () => {
    pdfApi.download(pdfApi.invoiceUrl(detail.id), `invoice-${detail.inv_number}.pdf`);
  };
  const handleWhatsApp = () => {
    const pdfUrl = `${window.location.origin}${pdfApi.invoiceUrl(detail.id)}`;
    const text = encodeURIComponent(
      `*Invoice ${detail.inv_number}*\n` +
      `Customer: ${detail.customer_name || 'N/A'}\n` +
      `Total: ${fmt(parseFloat(detail.total_amount))}\n` +
      `Status: ${detail.payment_status}\n` +
      `Due: ${detail.due_date ? new Date(detail.due_date).toLocaleDateString('en-GH') : 'N/A'}\n\n` +
      `Download invoice PDF: ${pdfUrl}\n\n` +
      `Please process payment at your earliest convenience. Thank you!`
    );
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  const handleStatusUpdate = async (status: string) => {
    setUpdatingStatus(true);
    try {
      await invoicesApi.updatePaymentStatus(detail.id, status);
      setDetail((p: any) => ({ ...p, payment_status: status }));
      onStatusChange(detail.id, status);
    } catch {}
    finally { setUpdatingStatus(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto border border-slate-100 dark:border-slate-700">
        <div className="sticky top-0 bg-white dark:bg-slate-800 flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700 z-10">
          <div className="flex items-center gap-3">
            <h3 className="font-bold text-slate-900 dark:text-white">{detail.inv_number}</h3>
            <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold', STATUS_STYLES[detail.payment_status])}>
              {STATUS_ICONS[detail.payment_status]} {detail.payment_status}
            </span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-5">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-slate-400 dark:text-slate-500 text-xs">Customer</span><div className="font-medium text-slate-900 dark:text-white">{detail.customer_name || 'Walk-in'}</div></div>
            <div><span className="text-slate-400 dark:text-slate-500 text-xs">Due Date</span><div className="font-medium text-slate-900 dark:text-white">{detail.due_date ? new Date(detail.due_date).toLocaleDateString('en-GH') : '—'}</div></div>
            <div><span className="text-slate-400 dark:text-slate-500 text-xs">Issued By</span><div className="font-medium text-slate-900 dark:text-white">{detail.created_by_name || '—'}</div></div>
            <div><span className="text-slate-400 dark:text-slate-500 text-xs">Date</span><div className="font-medium text-slate-900 dark:text-white">{new Date(detail.created_at).toLocaleDateString('en-GH')}</div></div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-slate-50 dark:bg-slate-700/30"><th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 dark:text-slate-400">Description</th><th className="px-3 py-2 text-center text-xs font-semibold text-slate-500 dark:text-slate-400">Qty</th><th className="px-3 py-2 text-right text-xs font-semibold text-slate-500 dark:text-slate-400">Unit</th><th className="px-3 py-2 text-right text-xs font-semibold text-slate-500 dark:text-slate-400">Total</th></tr></thead>
              <tbody>
                {(detail.items ?? []).map((item: any, i: number) => (
                  <tr key={i} className="border-b border-slate-50 dark:border-slate-700/30">
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{item.description}</td>
                    <td className="px-3 py-2 text-center text-slate-600 dark:text-slate-300">{item.quantity}</td>
                    <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-300">{fmt(parseFloat(item.unit_price))}</td>
                    <td className="px-3 py-2 text-right font-semibold text-slate-900 dark:text-white">{fmt(parseFloat(item.total))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end">
            <div className="text-right">
              <div className="text-sm text-slate-500 dark:text-slate-400">Grand Total</div>
              <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{fmt(parseFloat(detail.total_amount))}</div>
            </div>
          </div>
          {detail.notes && <p className="text-sm text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-700/30 rounded-xl p-3">{detail.notes}</p>}

          {detail.payment_status !== 'paid' && (
            <div className="border-t border-slate-100 dark:border-slate-700 pt-4">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Update Payment Status</p>
              <div className="flex gap-2">
                {['partial', 'paid'].map(s => (
                  <button key={s} onClick={() => handleStatusUpdate(s)} disabled={updatingStatus || detail.payment_status === s}
                    className={clsx('flex-1 px-3 py-2 rounded-xl text-sm font-semibold transition-colors capitalize',
                      detail.payment_status === s ? 'opacity-50 cursor-not-allowed' : '',
                      s === 'paid' ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 hover:bg-amber-200')}>
                    Mark {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="sticky bottom-0 bg-white dark:bg-slate-800 px-5 py-4 border-t border-slate-100 dark:border-slate-700 flex gap-2">
          <button onClick={() => window.print()} className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl font-semibold text-sm transition-colors">
            <Printer size={14} /> Print
          </button>
          <button onClick={handleDownloadPDF} className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold text-sm transition-colors">
            <Download size={14} /> PDF
          </button>
          <button onClick={handleWhatsApp} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold text-sm transition-colors">
            <MessageCircle size={15} /> WhatsApp
          </button>
        </div>
      </div>
    </div>
  );
}

function BuilderModal({ customers, onClose, onCreated }: { customers: any[]; onClose: () => void; onCreated: (inv: any) => void }) {
  const [form, setForm] = useState({ customerId: '', customerName: '', dueDate: '', notes: '' });
  const [items, setItems] = useState<LineItem[]>([emptyLine()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const updateItem = (i: number, field: keyof LineItem, val: string) => {
    setItems(prev => {
      const next = [...prev];
      const item = { ...next[i], [field]: field === 'description' ? val : parseFloat(val) || 0 };
      item.total = item.quantity * item.unitPrice;
      next[i] = item;
      return next;
    });
  };

  const grandTotal = items.reduce((s, i) => s + i.total, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (items.some(i => !i.description.trim())) { setError('All items must have a description'); return; }
    setSaving(true); setError('');
    try {
      const payload = {
        customerId: form.customerId ? parseInt(form.customerId) : null,
        customerName: form.customerName || (form.customerId ? customers.find(c => c.id === parseInt(form.customerId))?.name : null),
        dueDate: form.dueDate || null,
        notes: form.notes || null,
        items: items.map(i => ({ description: i.description, quantity: i.quantity, unitPrice: i.unitPrice, total: i.total })),
        totalAmount: grandTotal,
      };
      const inv = await invoicesApi.create(payload);
      onCreated(inv);
    } catch (err: any) { setError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-slate-100 dark:border-slate-700">
        <div className="sticky top-0 bg-white dark:bg-slate-800 flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700 z-10">
          <h3 className="font-bold text-slate-900 dark:text-white">New Invoice</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-xl text-sm">{error}</div>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label dark:text-slate-300">Customer</label>
              <select value={form.customerId} onChange={e => setForm(p => ({ ...p, customerId: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                <option value="">Walk-in / Custom</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            {!form.customerId && (
              <div>
                <label className="label dark:text-slate-300">Customer Name</label>
                <input value={form.customerName} onChange={e => setForm(p => ({ ...p, customerName: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="Enter name..." />
              </div>
            )}
            <div>
              <label className="label dark:text-slate-300">Due Date</label>
              <input type="date" value={form.dueDate} onChange={e => setForm(p => ({ ...p, dueDate: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label mb-0 dark:text-slate-300">Line Items</label>
              <button type="button" onClick={() => setItems(p => [...p, emptyLine()])} className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold hover:underline">+ Add Item</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="bg-slate-50 dark:bg-slate-700/30"><th className="px-2 py-2 text-left text-xs font-semibold text-slate-500 dark:text-slate-400">Description</th><th className="px-2 py-2 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 w-16">Qty</th><th className="px-2 py-2 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 w-24">Unit Price</th><th className="px-2 py-2 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 w-24">Total</th><th className="w-8"></th></tr></thead>
                <tbody>
                  {items.map((item, i) => (
                    <tr key={i}>
                      <td className="px-1 py-1"><input value={item.description} onChange={e => updateItem(i, 'description', e.target.value)} className="input text-xs py-1.5 dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="Item description" /></td>
                      <td className="px-1 py-1"><input type="number" min="0.01" step="0.01" value={item.quantity} onChange={e => updateItem(i, 'quantity', e.target.value)} className="input text-xs py-1.5 text-center dark:bg-slate-700 dark:border-slate-600 dark:text-white" /></td>
                      <td className="px-1 py-1"><input type="number" min="0" step="0.01" value={item.unitPrice} onChange={e => updateItem(i, 'unitPrice', e.target.value)} className="input text-xs py-1.5 text-right dark:bg-slate-700 dark:border-slate-600 dark:text-white" /></td>
                      <td className="px-1 py-1 text-right text-xs font-semibold text-slate-900 dark:text-white">{fmt(item.total)}</td>
                      <td className="px-1 py-1">
                        {items.length > 1 && <button type="button" onClick={() => setItems(p => p.filter((_, j) => j !== i))} className="p-1 text-red-400 hover:text-red-600"><Trash2 size={13} /></button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end mt-2">
              <div className="text-right">
                <div className="text-xs text-slate-500 dark:text-slate-400">Grand Total</div>
                <div className="text-xl font-bold text-indigo-600 dark:text-indigo-400">{fmt(grandTotal)}</div>
              </div>
            </div>
          </div>

          <div>
            <label className="label dark:text-slate-300">Notes / Terms</label>
            <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="Payment terms, bank details, etc." />
          </div>

          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 btn-primary">{saving ? 'Creating...' : 'Create Invoice'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Invoices() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBuilder, setShowBuilder] = useState(false);
  const [selectedInv, setSelectedInv] = useState<any>(null);

  useEffect(() => {
    Promise.all([invoicesApi.list(), customersApi.list()])
      .then(([invs, custs]) => { setInvoices(invs); setCustomers(custs); })
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this invoice?')) return;
    await invoicesApi.delete(id);
    setInvoices(p => p.filter(i => i.id !== id));
  };

  const handleCreated = async (inv: any) => {
    const full = await invoicesApi.get(inv.id);
    setInvoices(p => [full, ...p]);
    setShowBuilder(false);
    setSelectedInv(full);
  };

  const handleStatusChange = (id: number, status: string) => {
    setInvoices(p => p.map(i => i.id === id ? { ...i, payment_status: status } : i));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="page-title dark:text-white flex items-center gap-2"><BookOpen size={24} className="text-indigo-600" /> Invoices</h1>
          <p className="page-subtitle dark:text-slate-400">{invoices.length} invoices</p>
        </div>
        <button onClick={() => setShowBuilder(true)} className="btn-primary flex items-center gap-2"><Plus size={16} /> New Invoice</button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48"><div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="card dark:bg-slate-800 dark:border-slate-700/50 overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-700/30 border-b border-slate-100 dark:border-slate-700">
                  <th className="table-header px-4 py-3 text-left">INV #</th>
                  <th className="table-header px-4 py-3 text-left">Customer</th>
                  <th className="table-header px-4 py-3 text-right">Total</th>
                  <th className="table-header px-4 py-3 text-left">Status</th>
                  <th className="table-header px-4 py-3 text-left">Due Date</th>
                  <th className="table-header px-4 py-3 text-left">Created</th>
                  <th className="table-header px-4 py-3 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {invoices.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-12 text-slate-400 dark:text-slate-500">No invoices yet — create your first</td></tr>
                ) : invoices.map(inv => (
                  <tr key={inv.id} className="border-b border-slate-50 dark:border-slate-700/30 hover:bg-slate-50 dark:hover:bg-slate-700/20">
                    <td className="px-4 py-3 font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400">{inv.inv_number}</td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{inv.customer_name || 'Walk-in'}</td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900 dark:text-white">{fmt(parseFloat(inv.total_amount))}</td>
                    <td className="px-4 py-3">
                      <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold capitalize', STATUS_STYLES[inv.payment_status])}>
                        {STATUS_ICONS[inv.payment_status]} {inv.payment_status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs">{inv.due_date ? new Date(inv.due_date).toLocaleDateString('en-GH') : '—'}</td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs">{new Date(inv.created_at).toLocaleDateString('en-GH')}</td>
                    <td className="px-4 py-3 flex items-center gap-2">
                      <button onClick={async () => { const full = await invoicesApi.get(inv.id); setSelectedInv(full); }} className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors">View</button>
                      <button onClick={() => handleDelete(inv.id)} className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showBuilder && <BuilderModal customers={customers} onClose={() => setShowBuilder(false)} onCreated={handleCreated} />}
      {selectedInv && <InvoiceDetail inv={selectedInv} onClose={() => setSelectedInv(null)} onStatusChange={handleStatusChange} />}
    </div>
  );
}
