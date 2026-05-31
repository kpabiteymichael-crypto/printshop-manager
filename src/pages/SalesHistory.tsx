import { useEffect, useState, useCallback, useMemo } from 'react';
import { posApi, settingsApi } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { QRCodeSVG } from 'qrcode.react';
import {
  ShoppingBag, Search, Printer, X, ChevronDown, Filter,
  RefreshCw, Eye, AlertCircle, User, Calendar, CreditCard,
  RotateCcw, CheckCircle,
} from 'lucide-react';
import clsx from 'clsx';

const CURRENCY = 'GH₵';

const fmt = (n: number) =>
  n.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Cash',
  mtn_momo: 'MTN MoMo',
  telecel_cash: 'Telecel Cash',
  airteltigo: 'AirtelTigo',
  bank_transfer: 'Bank Transfer',
  credit: 'Credit',
};

const STATUS_STYLES: Record<string, string> = {
  paid: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  credit: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  refunded: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

interface Sale {
  id: number;
  saleNumber: string;
  cashierId: number | null;
  totalAmount: string;
  paymentMethod: string;
  paymentStatus: string;
  createdAt: string;
  customerName: string | null;
  cashierName: string | null;
}

interface SaleDetail {
  id: number;
  saleNumber: string;
  subtotal: string;
  discountAmount: string;
  taxAmount: string;
  totalAmount: string;
  paymentMethod: string;
  paymentStatus: string;
  createdAt: string;
  customerName: string | null;
  cashierName: string | null;
  receiptNumber: string | null;
  items: Array<{
    id: number;
    description: string;
    quantity: number;
    unitPrice: string;
    discount: string;
    totalPrice: string;
    isRefunded?: boolean;
  }>;
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function openPrintWindow(
  sale: SaleDetail,
  shopName: string,
  shopAddress: string,
  shopPhone: string,
) {
  const receiptUrl = sale.receiptNumber
    ? `${window.location.origin}/receipt/${encodeURIComponent(sale.receiptNumber)}`
    : window.location.href;
  const subtotal = parseFloat(sale.subtotal);
  const discount = parseFloat(sale.discountAmount);
  const total = parseFloat(sale.totalAmount);

  const itemRows = sale.items
    .map(item => {
      const lineTotal = parseFloat(item.totalPrice);
      const discAmt = parseFloat(item.discount ?? '0');
      return `
        <div class="${item.isRefunded ? 'refunded' : ''}">
          <div class="item-name">${escHtml(item.description)}${item.isRefunded ? ' <span class="refunded-badge">REFUNDED</span>' : ''}</div>
          <div class="item-line">
            <span>${escHtml(String(item.quantity))} &times; ${CURRENCY}${fmt(parseFloat(item.unitPrice))}${discAmt > 0 ? ` - ${CURRENCY}${fmt(discAmt)}` : ''}</span>
            <span><strong>${CURRENCY}${fmt(lineTotal)}</strong></span>
          </div>
        </div>`;
    })
    .join('');

  const svgQR = document.querySelector('.receipt-qr-svg')?.outerHTML ?? '';

  const eDateStr = new Date(sale.createdAt).toLocaleDateString('en-GH', { day: '2-digit', month: 'short', year: 'numeric' });
  const eTimeStr = new Date(sale.createdAt).toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit' });
  const ePaymentLabel = escHtml(PAYMENT_LABELS[sale.paymentMethod] ?? sale.paymentMethod);

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Receipt ${escHtml(sale.receiptNumber ?? sale.saleNumber)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Courier New', monospace; font-size: 11px; color: #000; background: #fff; width: 300px; margin: 0 auto; padding: 16px 8px; }
    .center { text-align: center; }
    .shop-name { font-size: 15px; font-weight: 700; letter-spacing: 0.5px; }
    .shop-sub { font-size: 10px; color: #555; margin-top: 2px; }
    .dashed { border-top: 1px dashed #aaa; margin: 8px 0; }
    .row { display: flex; justify-content: space-between; margin-bottom: 2px; }
    .label { color: #555; }
    .item-name { font-weight: 600; margin-top: 4px; }
    .item-line { display: flex; justify-content: space-between; padding-left: 8px; color: #444; }
    .total-row { display: flex; justify-content: space-between; font-weight: 700; font-size: 13px; border-top: 1px solid #aaa; padding-top: 4px; margin-top: 2px; }
    .discount { color: #059669; }
    .refunded { opacity: 0.5; text-decoration: line-through; }
    .refunded-badge { font-size: 9px; font-weight: 700; color: #dc2626; text-decoration: none; }
    .qr { text-align: center; margin: 8px 0; }
    .qr-note { font-size: 9px; color: #888; text-align: center; margin-top: 2px; }
    .thanks { text-align: center; color: #555; font-size: 10px; margin-top: 8px; }
    @media print {
      @page { margin: 0; size: 80mm auto; }
      body { padding: 8px 4px; }
    }
  </style>
</head>
<body>
  <div class="center">
    <div class="shop-name">${escHtml(shopName)}</div>
    ${shopAddress ? `<div class="shop-sub">${escHtml(shopAddress)}</div>` : ''}
    ${shopPhone ? `<div class="shop-sub">${escHtml(shopPhone)}</div>` : ''}
    <div class="dashed"></div>
    <div style="font-weight:600;">RECEIPT</div>
    ${sale.receiptNumber ? `<div class="label">${escHtml(sale.receiptNumber)}</div>` : ''}
  </div>
  <div class="dashed"></div>
  <div class="row"><span class="label">Sale #:</span><span><strong>${escHtml(sale.saleNumber)}</strong></span></div>
  <div class="row"><span class="label">Date:</span><span>${escHtml(eDateStr)}</span></div>
  <div class="row"><span class="label">Time:</span><span>${escHtml(eTimeStr)}</span></div>
  ${sale.cashierName ? `<div class="row"><span class="label">Cashier:</span><span>${escHtml(sale.cashierName)}</span></div>` : ''}
  ${sale.customerName ? `<div class="row"><span class="label">Customer:</span><span>${escHtml(sale.customerName)}</span></div>` : ''}
  <div class="dashed"></div>
  ${itemRows}
  <div class="dashed"></div>
  <div class="row"><span class="label">Subtotal</span><span>${CURRENCY}${fmt(subtotal)}</span></div>
  ${discount > 0 ? `<div class="row discount"><span>Discount</span><span>-${CURRENCY}${fmt(discount)}</span></div>` : ''}
  <div class="total-row"><span>TOTAL</span><span>${CURRENCY}${fmt(total)}</span></div>
  <div class="row" style="margin-top:4px;"><span class="label">Payment</span><span><strong>${ePaymentLabel}</strong></span></div>
  ${sale.paymentStatus === 'credit' ? '<div class="row" style="color:#d97706;"><span>Status</span><span><strong>Credit / Pay Later</strong></span></div>' : ''}
  <div class="dashed"></div>
  ${svgQR ? `<div class="qr">${svgQR}</div><div class="qr-note">Scan to verify receipt</div>` : `<div class="qr-note" style="font-size:9px;word-break:break-all;">${escHtml(receiptUrl)}</div>`}
  <div class="thanks">Thank you for your business!</div>
</body>
</html>`;

  const w = window.open('', '_blank', 'width=400,height=650,scrollbars=yes');
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => { w.print(); }, 400);
}

// ─── Refund Modal ─────────────────────────────────────────────────────────────
function RefundModal({
  sale,
  onClose,
  onSuccess,
}: {
  sale: SaleDetail;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const refundableItems = sale.items.filter(i => !i.isRefunded);
  const [selected, setSelected] = useState<number[]>(refundableItems.map(i => i.id));
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<any>(null);

  const refundTotal = refundableItems
    .filter(i => selected.includes(i.id))
    .reduce((sum, i) => sum + parseFloat(i.totalPrice), 0);

  const toggle = (id: number) =>
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const handleRefund = async () => {
    if (selected.length === 0) return;
    setProcessing(true);
    setError('');
    try {
      const res = await posApi.refund(sale.id, selected);
      setDone(res);
    } catch (err: any) {
      setError(err.message || 'Refund failed');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md border border-slate-100 dark:border-slate-700">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <RotateCcw size={16} /> Process Refund
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-xl text-sm border border-red-200 dark:border-red-800">
              <AlertCircle size={14} /> {error}
            </div>
          )}

          {done ? (
            <div className="space-y-4">
              <div className="flex flex-col items-center gap-3 py-4">
                <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                  <CheckCircle size={24} className="text-emerald-600" />
                </div>
                <div className="text-center">
                  <div className="font-bold text-slate-900 dark:text-white">Refund Processed</div>
                  <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                    {CURRENCY}{fmt(parseFloat(done.refundTotal))} refunded for {done.refundedItems} item(s)
                  </div>
                  <div className="mt-2 font-mono text-xs text-indigo-600 dark:text-indigo-400">{done.refundReceiptNumber}</div>
                </div>
              </div>
              <button onClick={onSuccess} className="btn-primary w-full">Done</button>
            </div>
          ) : (
            <>
              <div className="bg-slate-50 dark:bg-slate-700/40 rounded-xl p-3 text-sm space-y-1">
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>Sale</span>
                  <span className="font-semibold text-slate-900 dark:text-white">{sale.saleNumber}</span>
                </div>
                {sale.customerName && (
                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>Customer</span><span>{sale.customerName}</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>Total Paid</span>
                  <span className="font-bold text-slate-900 dark:text-white">{CURRENCY}{fmt(parseFloat(sale.totalAmount))}</span>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Select items to refund</p>
                {refundableItems.length === 0 ? (
                  <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-4">All items have already been refunded.</p>
                ) : (
                  <div className="space-y-1 max-h-52 overflow-y-auto">
                    {refundableItems.map(item => (
                      <label key={item.id} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700/40 cursor-pointer transition-colors">
                        <input
                          type="checkbox"
                          checked={selected.includes(item.id)}
                          onChange={() => toggle(item.id)}
                          className="rounded border-slate-300 text-indigo-600"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-slate-900 dark:text-white truncate">{item.description}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            {item.quantity} × {CURRENCY}{fmt(parseFloat(item.unitPrice))}
                          </div>
                        </div>
                        <span className="text-sm font-semibold text-slate-900 dark:text-white">{CURRENCY}{fmt(parseFloat(item.totalPrice))}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {selected.length > 0 && (
                <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl px-4 py-3 flex justify-between items-center border border-amber-200 dark:border-amber-800">
                  <span className="text-sm font-medium text-amber-700 dark:text-amber-400">Refund Amount</span>
                  <span className="text-lg font-bold text-amber-700 dark:text-amber-400">{CURRENCY}{fmt(refundTotal)}</span>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button onClick={onClose} className="flex-1 btn-secondary dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600">Cancel</button>
                <button
                  onClick={handleRefund}
                  disabled={selected.length === 0 || processing || refundableItems.length === 0}
                  className="flex-1 btn-primary bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {processing
                    ? <span className="flex items-center justify-center gap-2"><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Processing…</span>
                    : `Refund ${selected.length} item${selected.length !== 1 ? 's' : ''}`
                  }
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SaleDetailModal({
  saleId,
  shopName,
  shopAddress,
  shopPhone,
  canRefund,
  onClose,
  onRefunded,
}: {
  saleId: number;
  shopName: string;
  shopAddress: string;
  shopPhone: string;
  canRefund: boolean;
  onClose: () => void;
  onRefunded: () => void;
}) {
  const [sale, setSale] = useState<SaleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showRefund, setShowRefund] = useState(false);

  useEffect(() => {
    posApi.getSale(saleId)
      .then(setSale)
      .catch(() => setError('Failed to load sale details'))
      .finally(() => setLoading(false));
  }, [saleId]);

  if (loading) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-10 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    </div>
  );

  if (error || !sale) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-6 max-w-sm w-full flex flex-col items-center gap-3">
        <AlertCircle size={32} className="text-red-500" />
        <p className="text-slate-700 dark:text-slate-300">{error || 'Sale not found'}</p>
        <button onClick={onClose} className="btn-primary">Close</button>
      </div>
    </div>
  );

  const subtotal = parseFloat(sale.subtotal);
  const discount = parseFloat(sale.discountAmount);
  const tax = parseFloat(sale.taxAmount);
  const total = parseFloat(sale.totalAmount);

  const receiptUrl = sale.receiptNumber
    ? `${window.location.origin}/receipt/${sale.receiptNumber}`
    : window.location.href;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto border border-slate-100 dark:border-slate-700 flex flex-col">
        <div className="sticky top-0 bg-white dark:bg-slate-800 flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700 z-10">
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white">{sale.saleNumber}</h3>
            {sale.receiptNumber && (
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">{sale.receiptNumber}</p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => openPrintWindow(sale, shopName, shopAddress, shopPhone)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 transition-colors"
            >
              <Printer size={13} /> Print
            </button>
            {canRefund && sale.paymentStatus !== 'refunded' && sale.items.some(i => !i.isRefunded) && (
              <button
                onClick={() => setShowRefund(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 text-white text-xs font-semibold rounded-lg hover:bg-amber-600 transition-colors"
              >
                <RotateCcw size={13} /> Refund
              </button>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-5">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-slate-50 dark:bg-slate-700/40 rounded-xl p-3">
              <div className="text-xs text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1"><Calendar size={11} /> Date</div>
              <div className="font-semibold text-slate-900 dark:text-white">
                {new Date(sale.createdAt).toLocaleDateString('en-GH', { day: 'numeric', month: 'short', year: 'numeric' })}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {new Date(sale.createdAt).toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-700/40 rounded-xl p-3">
              <div className="text-xs text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1"><CreditCard size={11} /> Payment</div>
              <div className="font-semibold text-slate-900 dark:text-white text-xs">
                {PAYMENT_LABELS[sale.paymentMethod] ?? sale.paymentMethod}
              </div>
              <span className={clsx('inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full', STATUS_STYLES[sale.paymentStatus] ?? STATUS_STYLES.paid)}>
                {sale.paymentStatus.toUpperCase()}
              </span>
            </div>
            {sale.customerName && (
              <div className="bg-slate-50 dark:bg-slate-700/40 rounded-xl p-3">
                <div className="text-xs text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1"><User size={11} /> Customer</div>
                <div className="font-semibold text-slate-900 dark:text-white text-sm">{sale.customerName}</div>
              </div>
            )}
            {sale.cashierName && (
              <div className="bg-slate-50 dark:bg-slate-700/40 rounded-xl p-3">
                <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Cashier</div>
                <div className="font-semibold text-slate-900 dark:text-white text-sm">{sale.cashierName}</div>
              </div>
            )}
          </div>

          <div>
            <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Line Items</h4>
            <div className="rounded-xl border border-slate-100 dark:border-slate-700 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-700/30 border-b border-slate-100 dark:border-slate-700">
                    <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400">Item</th>
                    <th className="text-center px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400">Qty</th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400">Unit</th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {sale.items.map((item, i) => (
                    <tr key={i} className={clsx('border-b border-slate-50 dark:border-slate-700/30 last:border-0', item.isRefunded && 'opacity-50')}>
                      <td className="px-3 py-2.5">
                        <div className={clsx('text-slate-800 dark:text-slate-200 font-medium text-xs', item.isRefunded && 'line-through')}>
                          {item.description}
                        </div>
                        {item.isRefunded && <div className="text-[10px] text-red-500 font-semibold">REFUNDED</div>}
                      </td>
                      <td className="px-3 py-2.5 text-center text-slate-600 dark:text-slate-300 text-xs">{item.quantity}</td>
                      <td className="px-3 py-2.5 text-right text-slate-600 dark:text-slate-300 text-xs">
                        {CURRENCY}{fmt(parseFloat(item.unitPrice))}
                        {parseFloat(item.discount) > 0 && (
                          <div className="text-emerald-600 dark:text-emerald-400">-{CURRENCY}{fmt(parseFloat(item.discount))}</div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right font-bold text-slate-900 dark:text-white text-xs">
                        {CURRENCY}{fmt(parseFloat(item.totalPrice))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-1.5 bg-slate-50 dark:bg-slate-700/30 rounded-xl p-4 text-sm">
            <div className="flex justify-between text-slate-600 dark:text-slate-400">
              <span>Subtotal</span>
              <span>{CURRENCY}{fmt(subtotal)}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                <span>Discount</span>
                <span>-{CURRENCY}{fmt(discount)}</span>
              </div>
            )}
            {tax > 0 && (
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Tax</span>
                <span>{CURRENCY}{fmt(tax)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-slate-900 dark:text-white text-base border-t border-slate-200 dark:border-slate-600 pt-2 mt-1">
              <span>Total</span>
              <span>{CURRENCY}{fmt(total)}</span>
            </div>
          </div>

          {/* Hidden QR for print window to capture */}
          <div className="hidden">
            <QRCodeSVG value={receiptUrl} size={80} level="M" className="receipt-qr-svg" />
          </div>
        </div>
      </div>

      {showRefund && (
        <RefundModal
          sale={sale}
          onClose={() => setShowRefund(false)}
          onSuccess={() => {
            setShowRefund(false);
            onRefunded();
            onClose();
          }}
        />
      )}
    </div>
  );
}

export default function SalesHistory() {
  const { user } = useAuth();
  const [allSales, setAllSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [cashierId, setCashierId] = useState('');
  const [selectedSaleId, setSelectedSaleId] = useState<number | null>(null);
  const [shopName, setShopName] = useState('PrintShop');
  const [shopAddress, setShopAddress] = useState('');
  const [shopPhone, setShopPhone] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    settingsApi.get().then((s: any) => {
      if (s.shopName) setShopName(s.shopName);
      if (s.address) setShopAddress(s.address);
      if (s.phone) setShopPhone(s.phone);
    }).catch(() => {});
  }, []);

  const fetchSales = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await posApi.getSales(undefined, undefined, {
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        paymentMethod: paymentMethod || undefined,
        cashierId: cashierId ? Number(cashierId) : undefined,
      });
      setAllSales(data);
    } catch {
      setError('Failed to load sales history');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, paymentMethod, cashierId]);

  useEffect(() => {
    fetchSales();
  }, [fetchSales]);

  const uniqueCashiers = useMemo(() => {
    const map = new Map<number, string>();
    allSales.forEach(s => {
      if (s.cashierId && s.cashierName) map.set(s.cashierId, s.cashierName);
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [allSales]);

  const filtered = allSales.filter(s => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      s.saleNumber.toLowerCase().includes(q) ||
      (s.customerName ?? '').toLowerCase().includes(q) ||
      (s.cashierName ?? '').toLowerCase().includes(q)
    );
  });

  const hasFilters = dateFrom || dateTo || paymentMethod || cashierId;
  const totalValue = filtered.reduce((sum, s) => sum + parseFloat(s.totalAmount), 0);

  const clearFilters = () => {
    setDateFrom('');
    setDateTo('');
    setPaymentMethod('');
    setCashierId('');
    setSearch('');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="page-title dark:text-white flex items-center gap-2">
            <ShoppingBag size={24} className="text-indigo-600" /> Sales History
          </h1>
          <p className="page-subtitle dark:text-slate-400">
            {filtered.length} sale{filtered.length !== 1 ? 's' : ''} · Total: {CURRENCY}{fmt(totalValue)}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowFilters(v => !v)}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border transition-colors',
              showFilters || hasFilters
                ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-700 text-indigo-700 dark:text-indigo-400'
                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
            )}
          >
            <Filter size={14} />
            Filters
            {hasFilters && <span className="ml-1 w-4 h-4 bg-indigo-600 text-white text-[10px] rounded-full flex items-center justify-center font-bold">!</span>}
            <ChevronDown size={13} className={clsx('transition-transform', showFilters && 'rotate-180')} />
          </button>
          <button
            onClick={fetchSales}
            disabled={loading}
            className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-600 transition-colors"
            title="Refresh"
          >
            <RefreshCw size={15} className={clsx(loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="card dark:bg-slate-800 dark:border-slate-700/50 p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="label dark:text-slate-300 text-xs">From Date</label>
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="input text-sm dark:bg-slate-700 dark:border-slate-600 dark:text-white"
              />
            </div>
            <div>
              <label className="label dark:text-slate-300 text-xs">To Date</label>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="input text-sm dark:bg-slate-700 dark:border-slate-600 dark:text-white"
              />
            </div>
            <div>
              <label className="label dark:text-slate-300 text-xs">Payment Method</label>
              <select
                value={paymentMethod}
                onChange={e => setPaymentMethod(e.target.value)}
                className="input text-sm dark:bg-slate-700 dark:border-slate-600 dark:text-white"
              >
                <option value="">All methods</option>
                <option value="cash">Cash</option>
                <option value="mtn_momo">MTN MoMo</option>
                <option value="telecel_cash">Telecel Cash</option>
                <option value="airteltigo">AirtelTigo</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="credit">Credit</option>
              </select>
            </div>
            {user?.role !== 'cashier' && (
              <div>
                <label className="label dark:text-slate-300 text-xs">Cashier</label>
                <select
                  value={cashierId}
                  onChange={e => setCashierId(e.target.value)}
                  className="input text-sm dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                >
                  <option value="">All cashiers</option>
                  {uniqueCashiers.map(([id, name]) => (
                    <option key={id} value={String(id)}>{name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          {hasFilters && (
            <button onClick={clearFilters} className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium">
              Clear all filters
            </button>
          )}
        </div>
      )}

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by sale #, customer, cashier..."
            className="input pl-9 text-sm dark:bg-slate-800 dark:border-slate-600 dark:text-white"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-xl text-sm border border-red-200 dark:border-red-800">
          <AlertCircle size={15} /> {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="card dark:bg-slate-800 dark:border-slate-700/50 overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-700/30 border-b border-slate-100 dark:border-slate-700">
                  <th className="table-header px-4 py-3 text-left">Sale #</th>
                  <th className="table-header px-4 py-3 text-left">Date</th>
                  <th className="table-header px-4 py-3 text-left">Customer</th>
                  {user?.role !== 'cashier' && (
                    <th className="table-header px-4 py-3 text-left">Cashier</th>
                  )}
                  <th className="table-header px-4 py-3 text-left">Method</th>
                  <th className="table-header px-4 py-3 text-left">Status</th>
                  <th className="table-header px-4 py-3 text-right">Amount</th>
                  <th className="table-header px-4 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={user?.role !== 'cashier' ? 8 : 7} className="text-center py-14 text-slate-400 dark:text-slate-500">
                      <ShoppingBag size={32} className="mx-auto mb-2 opacity-30" />
                      No sales found
                    </td>
                  </tr>
                ) : filtered.map(sale => (
                  <tr
                    key={sale.id}
                    className="border-b border-slate-50 dark:border-slate-700/30 hover:bg-slate-50 dark:hover:bg-slate-700/20 cursor-pointer transition-colors"
                    onClick={() => setSelectedSaleId(sale.id)}
                  >
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400">{sale.saleNumber}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs whitespace-nowrap">
                      <div>{new Date(sale.createdAt).toLocaleDateString('en-GH', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                      <div className="text-slate-400 dark:text-slate-500">{new Date(sale.createdAt).toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit' })}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                      {sale.customerName || <span className="text-slate-400 dark:text-slate-500 italic">Walk-in</span>}
                    </td>
                    {user?.role !== 'cashier' && (
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{sale.cashierName || '—'}</td>
                    )}
                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                      {PAYMENT_LABELS[sale.paymentMethod] ?? sale.paymentMethod}
                    </td>
                    <td className="px-4 py-3">
                      <span className={clsx('text-[10px] font-bold px-2 py-0.5 rounded-full', STATUS_STYLES[sale.paymentStatus] ?? STATUS_STYLES.paid)}>
                        {sale.paymentStatus.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900 dark:text-white whitespace-nowrap">
                      {CURRENCY}{fmt(parseFloat(sale.totalAmount))}
                    </td>
                    <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => setSelectedSaleId(sale.id)}
                        className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors"
                      >
                        <Eye size={12} /> View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filtered.length > 0 && (
            <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/20 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>{filtered.length} record{filtered.length !== 1 ? 's' : ''}</span>
              <span className="font-bold text-slate-900 dark:text-white">
                Total: {CURRENCY}{fmt(totalValue)}
              </span>
            </div>
          )}
        </div>
      )}

      {selectedSaleId !== null && (
        <SaleDetailModal
          saleId={selectedSaleId}
          shopName={shopName}
          shopAddress={shopAddress}
          shopPhone={shopPhone}
          canRefund={user?.role === 'owner' || user?.role === 'manager'}
          onClose={() => setSelectedSaleId(null)}
          onRefunded={() => { setSelectedSaleId(null); fetchSales(); }}
        />
      )}
    </div>
  );
}
