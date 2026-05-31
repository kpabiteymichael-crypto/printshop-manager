import { useEffect, useState } from 'react';
import { quotationsApi, customersApi, pdfApi } from '../lib/api';
import { FileText, Plus, X, Trash2, MessageCircle, Printer, Download } from 'lucide-react';
import clsx from 'clsx';

const fmt = (v: number) => `₵${Number(v).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface LineItem { description: string; quantity: number; unitPrice: number; total: number }
const emptyLine = (): LineItem => ({ description: '', quantity: 1, unitPrice: 0, total: 0 });

function QuotationDetail({ qt, onClose }: { qt: any; onClose: () => void }) {
  const handleDownloadPDF = () => {
    pdfApi.download(pdfApi.quotationUrl(qt.id), `quotation-${qt.qt_number}.pdf`);
  };
  const handleWhatsApp = () => {
    const pdfUrl = `${window.location.origin}${pdfApi.quotationUrl(qt.id)}`;
    const text = encodeURIComponent(
      `*Quotation ${qt.qt_number}*\n` +
      `Customer: ${qt.customer_name || 'N/A'}\n` +
      `Total: ${fmt(parseFloat(qt.total_amount))}\n` +
      `Valid Until: ${qt.valid_until ? new Date(qt.valid_until).toLocaleDateString('en-GH') : 'N/A'}\n\n` +
      `Download quotation PDF: ${pdfUrl}\n\n` +
      `Please review and confirm your order. Thank you!`
    );
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto border border-slate-100 dark:border-slate-700">
        <div className="sticky top-0 bg-white dark:bg-slate-800 flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700 z-10">
          <h3 className="font-bold text-slate-900 dark:text-white">{qt.qt_number}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-5">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-slate-400 dark:text-slate-500 text-xs">Customer</span><div className="font-medium text-slate-900 dark:text-white">{qt.customer_name || 'Walk-in'}</div></div>
            <div><span className="text-slate-400 dark:text-slate-500 text-xs">Valid Until</span><div className="font-medium text-slate-900 dark:text-white">{qt.valid_until ? new Date(qt.valid_until).toLocaleDateString('en-GH') : '—'}</div></div>
            <div><span className="text-slate-400 dark:text-slate-500 text-xs">Prepared By</span><div className="font-medium text-slate-900 dark:text-white">{qt.created_by_name || '—'}</div></div>
            <div><span className="text-slate-400 dark:text-slate-500 text-xs">Date</span><div className="font-medium text-slate-900 dark:text-white">{new Date(qt.created_at).toLocaleDateString('en-GH')}</div></div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-slate-50 dark:bg-slate-700/30"><th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 dark:text-slate-400">Description</th><th className="px-3 py-2 text-center text-xs font-semibold text-slate-500 dark:text-slate-400">Qty</th><th className="px-3 py-2 text-right text-xs font-semibold text-slate-500 dark:text-slate-400">Unit</th><th className="px-3 py-2 text-right text-xs font-semibold text-slate-500 dark:text-slate-400">Total</th></tr></thead>
              <tbody>
                {(qt.items ?? []).map((item: any, i: number) => (
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
              <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{fmt(parseFloat(qt.total_amount))}</div>
            </div>
          </div>
          {qt.notes && <p className="text-sm text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-700/30 rounded-xl p-3">{qt.notes}</p>}
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

function BuilderModal({ customers, onClose, onCreated }: { customers: any[]; onClose: () => void; onCreated: (qt: any) => void }) {
  const [form, setForm] = useState({ customerId: '', customerName: '', validUntil: '', notes: '' });
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
        validUntil: form.validUntil || null,
        notes: form.notes || null,
        items: items.map(i => ({ description: i.description, quantity: i.quantity, unitPrice: i.unitPrice, total: i.total })),
        totalAmount: grandTotal,
      };
      const qt = await quotationsApi.create(payload);
      onCreated(qt);
    } catch (err: any) { setError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-slate-100 dark:border-slate-700">
        <div className="sticky top-0 bg-white dark:bg-slate-800 flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700 z-10">
          <h3 className="font-bold text-slate-900 dark:text-white">New Quotation</h3>
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
              <label className="label dark:text-slate-300">Valid Until</label>
              <input type="date" value={form.validUntil} onChange={e => setForm(p => ({ ...p, validUntil: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
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
            <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="Payment terms, validity, etc." />
          </div>

          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 btn-primary">{saving ? 'Creating...' : 'Create Quotation'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Quotations() {
  const [quotations, setQuotations] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBuilder, setShowBuilder] = useState(false);
  const [selectedQt, setSelectedQt] = useState<any>(null);

  useEffect(() => {
    Promise.all([quotationsApi.list(), customersApi.list()])
      .then(([qts, custs]) => { setQuotations(qts); setCustomers(custs); })
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this quotation?')) return;
    await quotationsApi.delete(id);
    setQuotations(p => p.filter(q => q.id !== id));
  };

  const handleCreated = async (qt: any) => {
    const full = await quotationsApi.get(qt.id);
    setQuotations(p => [full, ...p]);
    setShowBuilder(false);
    setSelectedQt(full);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="page-title dark:text-white flex items-center gap-2"><FileText size={24} className="text-indigo-600" /> Quotations</h1>
          <p className="page-subtitle dark:text-slate-400">{quotations.length} quotations</p>
        </div>
        <button onClick={() => setShowBuilder(true)} className="btn-primary flex items-center gap-2"><Plus size={16} /> New Quotation</button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48"><div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="card dark:bg-slate-800 dark:border-slate-700/50 overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-700/30 border-b border-slate-100 dark:border-slate-700">
                  <th className="table-header px-4 py-3 text-left">QT #</th>
                  <th className="table-header px-4 py-3 text-left">Customer</th>
                  <th className="table-header px-4 py-3 text-right">Total</th>
                  <th className="table-header px-4 py-3 text-left">Valid Until</th>
                  <th className="table-header px-4 py-3 text-left">Created</th>
                  <th className="table-header px-4 py-3 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {quotations.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-12 text-slate-400 dark:text-slate-500">No quotations yet — create your first</td></tr>
                ) : quotations.map(q => (
                  <tr key={q.id} className="border-b border-slate-50 dark:border-slate-700/30 hover:bg-slate-50 dark:hover:bg-slate-700/20">
                    <td className="px-4 py-3 font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400">{q.qt_number}</td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{q.customer_name || 'Walk-in'}</td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900 dark:text-white">{fmt(parseFloat(q.total_amount))}</td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs">{q.valid_until ? new Date(q.valid_until).toLocaleDateString('en-GH') : '—'}</td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs">{new Date(q.created_at).toLocaleDateString('en-GH')}</td>
                    <td className="px-4 py-3 flex items-center gap-2">
                      <button onClick={async () => { const full = await quotationsApi.get(q.id); setSelectedQt(full); }} className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors">View</button>
                      <button onClick={() => handleDelete(q.id)} className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showBuilder && <BuilderModal customers={customers} onClose={() => setShowBuilder(false)} onCreated={handleCreated} />}
      {selectedQt && <QuotationDetail qt={selectedQt} onClose={() => setSelectedQt(null)} />}
    </div>
  );
}
