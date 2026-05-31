import { useEffect, useState } from 'react';
import { receiptsApi, pdfApi } from '../lib/api';
import { Receipt, Search, MessageCircle, Printer, ArrowLeft, X, Download } from 'lucide-react';
import clsx from 'clsx';

const fmt = (v: number) => `₵${Number(v).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Cash', mtn_momo: 'MTN MoMo', telecel_cash: 'Telecel Cash',
  airteltigo: 'AirtelTigo', bank_transfer: 'Bank Transfer',
};

function ReceiptDetail({ id, onClose }: { id: number; onClose: () => void }) {
  const [receipt, setReceipt] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    receiptsApi.get(id).then(setReceipt).catch(() => {}).finally(() => setLoading(false));
  }, [id]);

  const handleDownloadPDF = () => {
    if (!receipt) return;
    pdfApi.download(pdfApi.receiptUrl(id), `receipt-${receipt.receipt_number}.pdf`);
  };

  const handleWhatsApp = () => {
    if (!receipt) return;
    const pdfUrl = `${window.location.origin}${pdfApi.receiptUrl(id)}`;
    const text = encodeURIComponent(
      `*Receipt ${receipt.receipt_number}*\n` +
      `Shop: ${receipt.shopName}\n` +
      `Date: ${new Date(receipt.created_at).toLocaleDateString('en-GH')}\n` +
      `Total: ${fmt(parseFloat(receipt.total_amount))}\n` +
      `Payment: ${PAYMENT_LABELS[receipt.payment_method] ?? receipt.payment_method}\n\n` +
      `Download receipt PDF: ${pdfUrl}\n\n` +
      `Thank you for your purchase! 🙏`
    );
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  if (loading) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md p-8 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    </div>
  );

  if (!receipt) return null;

  const subtotal = parseFloat(receipt.subtotal ?? receipt.total_amount);
  const discount = parseFloat(receipt.discount_amount ?? 0);
  const tax = parseFloat(receipt.tax_amount ?? 0);
  const total = parseFloat(receipt.total_amount);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto border border-slate-100 dark:border-slate-700">
        <div className="sticky top-0 bg-white dark:bg-slate-800 flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700 z-10">
          <h3 className="font-bold text-slate-900 dark:text-white">{receipt.receipt_number}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"><X size={18} /></button>
        </div>

        <div className="p-5 receipt-content">
          {/* Shop header */}
          <div className="text-center mb-5">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">{receipt.shopName}</h2>
            {receipt.shopAddress && <p className="text-xs text-slate-500 dark:text-slate-400">{receipt.shopAddress}</p>}
            {receipt.shopPhone && <p className="text-xs text-slate-500 dark:text-slate-400">{receipt.shopPhone}</p>}
          </div>

          <div className="border-t border-dashed border-slate-200 dark:border-slate-600 pt-4 mb-4">
            <div className="grid grid-cols-2 gap-2 text-xs text-slate-500 dark:text-slate-400 mb-3">
              <div><span className="font-semibold">Receipt #:</span> {receipt.receipt_number}</div>
              <div className="text-right"><span className="font-semibold">Date:</span> {new Date(receipt.created_at).toLocaleDateString('en-GH')}</div>
              <div><span className="font-semibold">Cashier:</span> {receipt.cashier_name || '—'}</div>
              <div className="text-right"><span className="font-semibold">Customer:</span> {receipt.customer_name || 'Walk-in'}</div>
            </div>
          </div>

          {/* Items */}
          <div className="mb-4">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-600">
                  <th className="text-left pb-1 text-slate-500 dark:text-slate-400 font-semibold">Item</th>
                  <th className="text-center pb-1 text-slate-500 dark:text-slate-400 font-semibold">Qty</th>
                  <th className="text-right pb-1 text-slate-500 dark:text-slate-400 font-semibold">Price</th>
                  <th className="text-right pb-1 text-slate-500 dark:text-slate-400 font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {(receipt.items ?? []).map((item: any, i: number) => (
                  <tr key={i} className="border-b border-slate-50 dark:border-slate-700/50">
                    <td className="py-1.5 text-slate-700 dark:text-slate-200">{item.description}</td>
                    <td className="py-1.5 text-center text-slate-600 dark:text-slate-300">{item.quantity}</td>
                    <td className="py-1.5 text-right text-slate-600 dark:text-slate-300">{fmt(parseFloat(item.unit_price))}</td>
                    <td className="py-1.5 text-right font-semibold text-slate-900 dark:text-white">{fmt(parseFloat(item.total_price))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="border-t border-dashed border-slate-200 dark:border-slate-600 pt-3 space-y-1 text-sm">
            <div className="flex justify-between text-slate-500 dark:text-slate-400">
              <span>Subtotal</span><span>{fmt(subtotal)}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-red-600 dark:text-red-400">
                <span>Discount</span><span>-{fmt(discount)}</span>
              </div>
            )}
            {tax > 0 && (
              <div className="flex justify-between text-slate-500 dark:text-slate-400">
                <span>Tax</span><span>{fmt(tax)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-lg text-slate-900 dark:text-white border-t border-slate-200 dark:border-slate-600 pt-2 mt-2">
              <span>TOTAL</span><span>{fmt(total)}</span>
            </div>
            <div className="flex justify-between text-sm text-slate-500 dark:text-slate-400">
              <span>Payment</span>
              <span className="font-medium">{PAYMENT_LABELS[receipt.payment_method] ?? receipt.payment_method}</span>
            </div>
          </div>

          <div className="text-center mt-5 pt-4 border-t border-dashed border-slate-200 dark:border-slate-600">
            <p className="text-xs text-slate-400 dark:text-slate-500">Thank you for your business! 🙏</p>
          </div>
        </div>

        {/* Actions */}
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

export default function Receipts() {
  const [receipts, setReceipts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    receiptsApi.list().then(setReceipts).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const filtered = receipts.filter(r =>
    r.receipt_number?.toLowerCase().includes(search.toLowerCase()) ||
    r.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
    r.cashier_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <style>{`@media print { .no-print { display: none !important; } body { background: white; } }`}</style>
      <div className="no-print">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="page-title dark:text-white flex items-center gap-2"><Receipt size={24} className="text-indigo-600" /> Receipts</h1>
            <p className="page-subtitle dark:text-slate-400">{receipts.length} receipts generated</p>
          </div>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search receipts..."
              className="input pl-9 text-sm w-64 dark:bg-slate-800 dark:border-slate-600 dark:text-white"
            />
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
                    <th className="table-header px-4 py-3 text-left">Receipt #</th>
                    <th className="table-header px-4 py-3 text-left">Customer</th>
                    <th className="table-header px-4 py-3 text-left">Cashier</th>
                    <th className="table-header px-4 py-3 text-left">Date</th>
                    <th className="table-header px-4 py-3 text-right">Amount</th>
                    <th className="table-header px-4 py-3 text-left">Method</th>
                    <th className="table-header px-4 py-3 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-12 text-slate-400 dark:text-slate-500">No receipts found</td></tr>
                  ) : filtered.map(r => (
                    <tr key={r.id} className="border-b border-slate-50 dark:border-slate-700/30 hover:bg-slate-50 dark:hover:bg-slate-700/20">
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400">{r.receipt_number}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{r.customer_name || 'Walk-in'}</td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{r.cashier_name || '—'}</td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs">
                        {new Date(r.created_at).toLocaleDateString('en-GH', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-slate-900 dark:text-white">{fmt(parseFloat(r.total_amount))}</td>
                      <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{PAYMENT_LABELS[r.payment_method] ?? r.payment_method}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => setSelectedId(r.id)} className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors">
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {selectedId !== null && <ReceiptDetail id={selectedId} onClose={() => setSelectedId(null)} />}
    </div>
  );
}
