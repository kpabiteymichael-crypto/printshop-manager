import { useEffect, useState, useRef, useCallback } from 'react';
import { posApi, customersApi, cashApi, settingsApi } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { QRCodeSVG } from 'qrcode.react';
import {
  ShoppingCart, Plus, Minus, Trash2, Search, X, CheckCircle,
  User, Barcode, RotateCcw, Printer, ChevronRight, AlertCircle,
  Package, BookOpen, Briefcase, Tag, Percent, Star,
} from 'lucide-react';
import clsx from 'clsx';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Product {
  id: number;
  name: string;
  sku: string;
  price: string;
  unit: string;
  categoryId: number | null;
  categoryName: string | null;
  quantityInStock: number | null;
  reorderLevel: number | null;
}

interface Service {
  id: number;
  name: string;
  description: string | null;
  pricePerUnit: string;
  unit: string;
}

interface Category {
  id: number;
  name: string;
}

interface CartItem {
  productId?: number;
  serviceId?: number;
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  maxStock?: number;
}

interface Customer {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  loyaltyPoints: number;
}

type PaymentMethod = 'cash' | 'mtn_momo' | 'telecel_cash' | 'airteltigo' | 'bank_transfer';
type ModalPaymentMethod = PaymentMethod | 'credit';

const PAYMENT_METHODS: { value: PaymentMethod; label: string; color: string; requiresRef: boolean }[] = [
  { value: 'cash',         label: 'Cash',            color: 'bg-emerald-500', requiresRef: false },
  { value: 'mtn_momo',     label: 'MTN MoMo',        color: 'bg-yellow-400',  requiresRef: true  },
  { value: 'telecel_cash', label: 'Telecel Cash',     color: 'bg-red-500',     requiresRef: true  },
  { value: 'airteltigo',   label: 'AirtelTigo Money', color: 'bg-blue-500',    requiresRef: true  },
  { value: 'bank_transfer',label: 'Bank Transfer',    color: 'bg-indigo-600',  requiresRef: true  },
];

const ALL_MODAL_METHODS: { value: ModalPaymentMethod; label: string; color: string }[] = [
  { value: 'cash',         label: 'Cash',               color: 'bg-emerald-500' },
  { value: 'mtn_momo',     label: 'MTN MoMo',           color: 'bg-yellow-400'  },
  { value: 'telecel_cash', label: 'Telecel Cash',        color: 'bg-red-500'     },
  { value: 'airteltigo',   label: 'AirtelTigo Money',    color: 'bg-blue-500'    },
  { value: 'bank_transfer',label: 'Bank Transfer',       color: 'bg-indigo-600'  },
  { value: 'credit',       label: 'Pay Later (Credit)',  color: 'bg-orange-500'  },
];

interface PaymentLineInput {
  id: number;
  method: PaymentMethod;
  amount: string;
  reference: string;
  amountTendered: string;
}

interface ConfirmedPaymentLine {
  method: PaymentMethod;
  amount: number;
  reference?: string;
  amountTendered?: number;
}

const CURRENCY = 'GH₵';

const fmt = (n: number) =>
  n.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ─── Print utility ───────────────────────────────────────────────────────────
function escHtml(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function openPrintWindow(html: string) {
  const win = window.open('', '_blank', 'width=420,height=700');
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 350);
}

// ─── Receipt Overlay ─────────────────────────────────────────────────────────
function ReceiptOverlay({
  data,
  shopName,
  shopAddress,
  onClose,
}: {
  data: {
    receiptNumber: string;
    saleNumber: string;
    cashierName: string;
    customerName?: string;
    paymentMethod: PaymentMethod | 'credit';
    paymentReference?: string;
    amountTendered?: number;
    paymentLines?: ConfirmedPaymentLine[];
    items: CartItem[];
    subtotal: number;
    discountAmount: number;
    total: number;
    createdAt: string;
  };
  shopName: string;
  shopAddress: string;
  onClose: () => void;
}) {
  const isSplit = (data.paymentLines?.length ?? 0) > 1;
  const methodLabel = data.paymentMethod === 'credit'
    ? 'Pay Later (Credit)'
    : PAYMENT_METHODS.find(m => m.value === data.paymentMethod)?.label ?? data.paymentMethod;

  // For single cash payment, calculate change
  const singleCashChange = (!isSplit && data.paymentMethod === 'cash' && data.amountTendered)
    ? Math.max(0, data.amountTendered - data.total)
    : 0;

  // For split payments, calculate change from cash line(s)
  const splitCashChange = isSplit
    ? (data.paymentLines ?? []).reduce((sum, l) => {
        if (l.method === 'cash' && l.amountTendered && l.amountTendered > l.amount) {
          return sum + (l.amountTendered - l.amount);
        }
        return sum;
      }, 0)
    : 0;

  const receiptUrl = `${window.location.origin}/receipt/${data.receiptNumber}`;

  const handlePrint = () => {
    const dateStr = new Date(data.createdAt).toLocaleDateString('en-GH', { day: '2-digit', month: 'short', year: 'numeric' });
    const timeStr = new Date(data.createdAt).toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit' });

    const itemsHtml = data.items.map(item => {
      const lineTotal = item.quantity * item.unitPrice - item.discount;
      return `
        <div style="margin-bottom:6px;">
          <div style="font-weight:600;">${escHtml(item.description)}</div>
          <div style="display:flex;justify-content:space-between;padding-left:8px;color:#555;">
            <span>${item.quantity} × GH₵${fmt(item.unitPrice)}${item.discount > 0 ? ` - GH₵${fmt(item.discount)}` : ''}</span>
            <span style="font-weight:600;color:#111;">GH₵${fmt(lineTotal)}</span>
          </div>
        </div>`;
    }).join('');

    let paymentHtml = '';
    if (isSplit) {
      const linesHtml = (data.paymentLines ?? []).map(line => {
        const label = PAYMENT_METHODS.find(m => m.value === line.method)?.label ?? line.method;
        const lineChange = (line.method === 'cash' && line.amountTendered && line.amountTendered > line.amount)
          ? line.amountTendered - line.amount : 0;
        return `
          <div style="margin-bottom:4px;">
            <div style="display:flex;justify-content:space-between;"><span>${escHtml(label)}</span><span style="font-weight:600;">GH₵${fmt(line.amount)}</span></div>
            ${line.reference ? `<div style="display:flex;justify-content:space-between;padding-left:10px;font-size:10px;color:#777;"><span>Ref:</span><span style="font-family:monospace;">${escHtml(line.reference)}</span></div>` : ''}
            ${line.method === 'cash' && line.amountTendered ? `<div style="display:flex;justify-content:space-between;padding-left:10px;font-size:10px;color:#777;"><span>Tendered:</span><span>GH₵${fmt(line.amountTendered)}</span></div>` : ''}
            ${lineChange > 0 ? `<div style="display:flex;justify-content:space-between;padding-left:10px;font-size:10px;font-weight:600;"><span>Change:</span><span>GH₵${fmt(lineChange)}</span></div>` : ''}
          </div>`;
      }).join('');
      paymentHtml = `<div style="font-weight:600;margin-bottom:4px;">Split Payment</div>${linesHtml}
        ${splitCashChange > 0 ? `<div style="display:flex;justify-content:space-between;border-top:1px dashed #ccc;padding-top:4px;font-weight:600;"><span>Total Change Due</span><span>GH₵${fmt(splitCashChange)}</span></div>` : ''}`;
    } else {
      paymentHtml = `
        <div style="display:flex;justify-content:space-between;"><span>Payment</span><span style="font-weight:600;">${escHtml(methodLabel)}</span></div>
        ${data.paymentReference ? `<div style="display:flex;justify-content:space-between;"><span>Reference</span><span style="font-family:monospace;">${escHtml(data.paymentReference)}</span></div>` : ''}
        ${data.amountTendered && data.paymentMethod === 'cash' ? `
          <div style="display:flex;justify-content:space-between;"><span>Tendered</span><span>GH₵${fmt(data.amountTendered)}</span></div>
          <div style="display:flex;justify-content:space-between;font-weight:600;"><span>Change</span><span>GH₵${fmt(singleCashChange)}</span></div>` : ''}`;
    }

    const html = `<!DOCTYPE html><html><head>
      <meta charset="utf-8"/>
      <title>Receipt ${escHtml(data.receiptNumber)}</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Courier New', monospace; font-size: 12px; width: 80mm; margin: 0 auto; padding: 8mm 4mm; background: #fff; color: #000; }
        .divider { border-top: 1px dashed #888; margin: 8px 0; }
        .center { text-align: center; }
        .row { display: flex; justify-content: space-between; margin-bottom: 3px; }
        .bold { font-weight: 700; }
        .total-row { display: flex; justify-content: space-between; font-size: 14px; font-weight: 700; border-top: 1px solid #000; padding-top: 5px; margin-top: 3px; }
        @media print { body { width: 80mm; } @page { margin: 0; size: 80mm auto; } }
      </style>
    </head><body>
      <div class="center" style="margin-bottom:8px;">
        <div class="bold" style="font-size:15px;letter-spacing:1px;">${escHtml(shopName)}</div>
        <div style="color:#555;font-size:10px;margin-top:2px;">${escHtml(shopAddress)}</div>
        <div class="divider"></div>
        <div class="bold">RECEIPT</div>
        <div>${escHtml(data.receiptNumber)}</div>
      </div>
      <div style="margin-bottom:6px;color:#555;">
        <div class="row"><span>Date:</span><span>${escHtml(dateStr)}</span></div>
        <div class="row"><span>Time:</span><span>${escHtml(timeStr)}</span></div>
        <div class="row"><span>Cashier:</span><span>${escHtml(data.cashierName)}</span></div>
        ${data.customerName ? `<div class="row"><span>Customer:</span><span>${escHtml(data.customerName)}</span></div>` : ''}
      </div>
      <div class="divider"></div>
      <div style="margin-bottom:6px;">${itemsHtml}</div>
      <div class="divider"></div>
      <div style="margin-bottom:6px;color:#555;">
        <div class="row"><span>Subtotal</span><span>GH₵${fmt(data.subtotal)}</span></div>
        ${data.discountAmount > 0 ? `<div class="row" style="color:#2a7;"><span>Discount</span><span>-GH₵${fmt(data.discountAmount)}</span></div>` : ''}
      </div>
      <div class="total-row"><span>TOTAL</span><span>GH₵${fmt(data.total)}</span></div>
      <div class="divider" style="margin-top:8px;"></div>
      <div style="margin-bottom:6px;color:#555;">${paymentHtml}</div>
      <div class="divider"></div>
      <div class="center" style="margin-top:8px;color:#777;font-size:10px;">
        <div>Scan QR to verify: ${escHtml(receiptUrl)}</div>
        <div style="margin-top:6px;">Thank you for your business!</div>
      </div>
    </body></html>`;

    openPrintWindow(html);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm flex flex-col max-h-[90vh] border border-slate-100 dark:border-slate-700">
        {/* Action bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-700">
          <h3 className="font-bold text-slate-900 dark:text-white">Receipt</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 transition-colors"
            >
              <Printer size={13} /> Print
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Receipt body */}
        <div className="overflow-y-auto flex-1">
          <div className="p-5 font-mono text-xs space-y-3 print:text-black print:bg-white" id="receipt-content">
            {/* Header */}
            <div className="text-center space-y-1">
              <div className="text-base font-bold text-slate-900 dark:text-white tracking-wide">{shopName}</div>
              <div className="text-slate-500 dark:text-slate-400 text-[11px] leading-tight">{shopAddress}</div>
              <div className="border-t border-dashed border-slate-300 dark:border-slate-600 my-2" />
              <div className="text-slate-700 dark:text-slate-300 font-semibold">RECEIPT</div>
              <div className="text-slate-600 dark:text-slate-400">{data.receiptNumber}</div>
            </div>

            {/* Meta */}
            <div className="space-y-0.5 text-slate-600 dark:text-slate-400">
              <div className="flex justify-between">
                <span>Date:</span>
                <span>{new Date(data.createdAt).toLocaleDateString('en-GH', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
              </div>
              <div className="flex justify-between">
                <span>Time:</span>
                <span>{new Date(data.createdAt).toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <div className="flex justify-between">
                <span>Cashier:</span>
                <span>{data.cashierName}</span>
              </div>
              {data.customerName && (
                <div className="flex justify-between">
                  <span>Customer:</span>
                  <span>{data.customerName}</span>
                </div>
              )}
            </div>

            <div className="border-t border-dashed border-slate-300 dark:border-slate-600" />

            {/* Items */}
            <div className="space-y-1">
              {data.items.map((item, i) => {
                const lineTotal = item.quantity * item.unitPrice - item.discount;
                return (
                  <div key={i}>
                    <div className="text-slate-900 dark:text-white font-semibold truncate">{item.description}</div>
                    <div className="flex justify-between text-slate-600 dark:text-slate-400 pl-2">
                      <span>{item.quantity} × {CURRENCY}{fmt(item.unitPrice)}{item.discount > 0 ? ` - ${CURRENCY}${fmt(item.discount)}` : ''}</span>
                      <span className="font-medium text-slate-900 dark:text-white">{CURRENCY}{fmt(lineTotal)}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="border-t border-dashed border-slate-300 dark:border-slate-600" />

            {/* Totals */}
            <div className="space-y-0.5">
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Subtotal</span>
                <span>{CURRENCY}{fmt(data.subtotal)}</span>
              </div>
              {data.discountAmount > 0 && (
                <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                  <span>Discount</span>
                  <span>-{CURRENCY}{fmt(data.discountAmount)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-slate-900 dark:text-white text-sm border-t border-slate-300 dark:border-slate-600 pt-1">
                <span>TOTAL</span>
                <span>{CURRENCY}{fmt(data.total)}</span>
              </div>
            </div>

            {/* Payment section */}
            <div className="space-y-0.5 text-slate-600 dark:text-slate-400">
              {isSplit ? (
                <>
                  <div className="font-semibold text-slate-700 dark:text-slate-300 mb-1">Split Payment</div>
                  {(data.paymentLines ?? []).map((line, i) => {
                    const label = PAYMENT_METHODS.find(m => m.value === line.method)?.label ?? line.method;
                    const lineChange = (line.method === 'cash' && line.amountTendered && line.amountTendered > line.amount)
                      ? line.amountTendered - line.amount : 0;
                    return (
                      <div key={i} className="pl-1 space-y-0.5">
                        <div className="flex justify-between">
                          <span>{label}</span>
                          <span className="font-medium text-slate-900 dark:text-white">{CURRENCY}{fmt(line.amount)}</span>
                        </div>
                        {line.reference && (
                          <div className="flex justify-between pl-2 text-[10px] text-slate-400">
                            <span>Ref:</span><span className="font-mono">{line.reference}</span>
                          </div>
                        )}
                        {line.method === 'cash' && line.amountTendered && line.amountTendered > 0 && (
                          <div className="flex justify-between pl-2 text-[10px] text-slate-400">
                            <span>Tendered:</span><span>{CURRENCY}{fmt(line.amountTendered)}</span>
                          </div>
                        )}
                        {lineChange > 0 && (
                          <div className="flex justify-between pl-2 text-[10px] font-semibold text-slate-700 dark:text-slate-200">
                            <span>Change:</span><span>{CURRENCY}{fmt(lineChange)}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {splitCashChange > 0 && (
                    <div className="flex justify-between font-semibold text-slate-900 dark:text-white pt-0.5 border-t border-dashed border-slate-300 dark:border-slate-600">
                      <span>Total Change Due</span>
                      <span>{CURRENCY}{fmt(splitCashChange)}</span>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="flex justify-between">
                    <span>Payment</span>
                    <span className="font-medium text-slate-900 dark:text-white">{methodLabel}</span>
                  </div>
                  {data.paymentReference && (
                    <div className="flex justify-between">
                      <span>Reference</span>
                      <span className="font-mono">{data.paymentReference}</span>
                    </div>
                  )}
                  {data.amountTendered && data.paymentMethod === 'cash' && (
                    <>
                      <div className="flex justify-between">
                        <span>Tendered</span>
                        <span>{CURRENCY}{fmt(data.amountTendered)}</span>
                      </div>
                      <div className="flex justify-between font-semibold text-slate-900 dark:text-white">
                        <span>Change</span>
                        <span>{CURRENCY}{fmt(singleCashChange)}</span>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>

            <div className="border-t border-dashed border-slate-300 dark:border-slate-600" />

            {/* QR Code */}
            <div className="flex flex-col items-center gap-2 py-1">
              <QRCodeSVG value={receiptUrl} size={88} level="M" />
              <div className="text-[10px] text-slate-400 text-center">Scan to verify receipt</div>
            </div>

            <div className="text-center text-slate-500 dark:text-slate-400 text-[11px] pt-1">
              Thank you for your business!
            </div>
          </div>
        </div>

        {/* New sale button */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-700">
          <button onClick={onClose} className="btn-primary w-full flex items-center justify-center gap-2">
            <ShoppingCart size={16} /> New Sale
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Customer Search Modal ────────────────────────────────────────────────────
function CustomerModal({
  onSelect,
  onClose,
}: {
  onSelect: (c: Customer | null) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const list = await customersApi.list({ search: search || undefined });
        setResults(list.slice(0, 20));
      } catch { setResults([]); }
      finally { setLoading(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md border border-slate-100 dark:border-slate-700">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2"><User size={16} /> Assign Customer</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"><X size={16} /></button>
        </div>
        <div className="p-4 space-y-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name or phone..."
              className="input pl-9 dark:bg-slate-700 dark:border-slate-600 dark:text-white"
            />
          </div>
          <button
            onClick={() => onSelect(null)}
            className="w-full text-left px-3 py-2 rounded-xl text-sm text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
          >
            Remove customer (Walk-in)
          </button>
          <div className="max-h-56 overflow-y-auto space-y-1">
            {loading && <div className="py-4 text-center text-slate-400 text-sm">Searching...</div>}
            {!loading && results.map(c => (
              <button
                key={c.id}
                onClick={() => onSelect(c)}
                className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors flex items-center justify-between group"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">{c.name}</div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 dark:text-slate-400">{c.phone || c.email || 'No contact'}</span>
                    {c.loyaltyPoints > 0 && (
                      <span className="text-xs text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-0.5">
                        <Star size={10} fill="currentColor" /> {c.loyaltyPoints} pts
                      </span>
                    )}
                  </div>
                </div>
                <ChevronRight size={14} className="text-slate-300 group-hover:text-indigo-500 transition-colors flex-shrink-0" />
              </button>
            ))}
            {!loading && results.length === 0 && search && (
              <div className="py-4 text-center text-slate-400 text-sm">No customers found</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Refund Modal ─────────────────────────────────────────────────────────────
function RefundModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<'search' | 'datelist' | 'select' | 'done'>('search');
  const [searchMode, setSearchMode] = useState<'number' | 'date'>('number');
  const [receiptNum, setReceiptNum] = useState('');
  const [searchDate, setSearchDate] = useState(new Date().toISOString().split('T')[0]);
  const [dateResults, setDateResults] = useState<any[]>([]);
  const [receiptData, setReceiptData] = useState<any>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [searching, setSearching] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<any>(null);

  const handleSearch = async () => {
    setSearching(true);
    setError('');
    try {
      if (searchMode === 'number') {
        if (!receiptNum.trim()) return;
        const data = await posApi.getReceipt(receiptNum.trim().toUpperCase());
        if (data.sale.isRefunded) {
          setError('This sale has already been fully refunded.');
          return;
        }
        setReceiptData(data);
        setSelected(data.items.filter((i: any) => !i.isRefunded).map((i: any) => i.id));
        setStep('select');
      } else {
        const sales = await posApi.getSales(undefined, searchDate);
        setDateResults(sales);
        setStep('datelist');
      }
    } catch (err: any) {
      setError(err.message || 'Receipt not found');
    } finally {
      setSearching(false);
    }
  };

  const handleSelectSale = async (saleId: number) => {
    setSearching(true);
    setError('');
    try {
      const detail = await posApi.getSale(saleId);
      const receiptResp = detail.receiptNumber ? await posApi.getReceipt(detail.receiptNumber) : null;
      if (receiptResp) {
        if (receiptResp.sale.isRefunded) {
          setError('This sale has already been fully refunded.');
          return;
        }
        setReceiptData(receiptResp);
        setSelected(receiptResp.items.filter((i: any) => !i.isRefunded).map((i: any) => i.id));
        setStep('select');
      } else {
        setError('Receipt not found for this sale.');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load sale');
    } finally {
      setSearching(false);
    }
  };

  const handleRefund = async () => {
    if (selected.length === 0) return;
    setProcessing(true);
    setError('');
    try {
      const res = await posApi.refund(receiptData.sale.id, selected);
      setResult(res);
      setStep('done');
    } catch (err: any) {
      setError(err.message || 'Refund failed');
    } finally {
      setProcessing(false);
    }
  };

  const toggleItem = (id: number) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const refundTotal = receiptData?.items
    ?.filter((i: any) => selected.includes(i.id))
    ?.reduce((sum: number, i: any) => sum + parseFloat(i.totalPrice), 0) ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md border border-slate-100 dark:border-slate-700">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2"><RotateCcw size={16} /> Process Refund</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"><X size={16} /></button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-xl text-sm border border-red-200 dark:border-red-800">
              <AlertCircle size={14} /> {error}
            </div>
          )}

          {step === 'search' && (
            <div className="space-y-4">
              <div className="flex rounded-xl overflow-hidden border border-slate-200 dark:border-slate-600">
                <button
                  onClick={() => setSearchMode('number')}
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${searchMode === 'number' ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600'}`}
                >
                  By Receipt #
                </button>
                <button
                  onClick={() => setSearchMode('date')}
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${searchMode === 'date' ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600'}`}
                >
                  By Date
                </button>
              </div>

              {searchMode === 'number' ? (
                <div className="flex gap-2">
                  <input
                    autoFocus
                    value={receiptNum}
                    onChange={e => setReceiptNum(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSearch()}
                    placeholder="RCP-2026-0001"
                    className="input flex-1 dark:bg-slate-700 dark:border-slate-600 dark:text-white font-mono uppercase"
                  />
                  <button onClick={handleSearch} disabled={!receiptNum.trim() || searching} className="btn-primary px-4">
                    {searching ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Find'}
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={searchDate}
                    onChange={e => setSearchDate(e.target.value)}
                    className="input flex-1 dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                  />
                  <button onClick={handleSearch} disabled={!searchDate || searching} className="btn-primary px-4">
                    {searching ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Search'}
                  </button>
                </div>
              )}
            </div>
          )}

          {step === 'datelist' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Sales on {searchDate}</p>
                <button onClick={() => { setStep('search'); setDateResults([]); setError(''); }} className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline">← Back</button>
              </div>
              {dateResults.length === 0 ? (
                <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-4">No sales found for this date.</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {dateResults.map((sale: any) => (
                    <button
                      key={sale.id}
                      onClick={() => handleSelectSale(sale.id)}
                      disabled={searching}
                      className="w-full text-left flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                    >
                      <div>
                        <div className="text-sm font-semibold text-slate-900 dark:text-white font-mono">{sale.saleNumber}</div>
                        <div className="text-xs text-slate-400 dark:text-slate-500">{sale.customerName || 'Walk-in'} · {sale.paymentMethod.replace(/_/g, ' ').toUpperCase()}</div>
                      </div>
                      <div className="text-sm font-bold text-slate-900 dark:text-white">{CURRENCY}{fmt(parseFloat(sale.totalAmount))}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {step === 'select' && receiptData && (
            <div className="space-y-4">
              <div className="bg-slate-50 dark:bg-slate-700/40 rounded-xl p-3 text-sm space-y-1">
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>Receipt</span><span className="font-mono font-semibold text-slate-900 dark:text-white">{receiptData.receipt.receiptNumber}</span>
                </div>
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>Sale</span><span>{receiptData.sale.saleNumber}</span>
                </div>
                {receiptData.sale.customerName && (
                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>Customer</span><span>{receiptData.sale.customerName}</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>Total Paid</span><span className="font-bold text-slate-900 dark:text-white">{CURRENCY}{fmt(parseFloat(receiptData.sale.totalAmount))}</span>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Select items to refund</p>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {receiptData.items.map((item: any) => (
                    <label key={item.id} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700/40 cursor-pointer transition-colors">
                      <input
                        type="checkbox"
                        checked={selected.includes(item.id)}
                        onChange={() => toggleItem(item.id)}
                        className="rounded border-slate-300 text-indigo-600"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-900 dark:text-white truncate">{item.description}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">{item.quantity} × {CURRENCY}{fmt(parseFloat(item.unitPrice))}</div>
                      </div>
                      <span className="text-sm font-semibold text-slate-900 dark:text-white">{CURRENCY}{fmt(parseFloat(item.totalPrice))}</span>
                    </label>
                  ))}
                </div>
              </div>

              {selected.length > 0 && (
                <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl px-4 py-3 flex justify-between items-center border border-amber-200 dark:border-amber-800">
                  <span className="text-sm font-medium text-amber-700 dark:text-amber-400">Refund Amount</span>
                  <span className="text-lg font-bold text-amber-700 dark:text-amber-400">{CURRENCY}{fmt(refundTotal)}</span>
                </div>
              )}

              <div className="flex gap-2">
                <button onClick={() => { setStep('search'); setReceiptData(null); setError(''); }} className="flex-1 btn-secondary dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600">Back</button>
                <button
                  onClick={handleRefund}
                  disabled={selected.length === 0 || processing}
                  className="flex-1 btn-primary bg-red-600 hover:bg-red-700 border-red-600"
                >
                  {processing ? 'Processing...' : `Refund ${CURRENCY}${fmt(refundTotal)}`}
                </button>
              </div>
            </div>
          )}

          {step === 'done' && result && (
            <div className="text-center space-y-4 py-4">
              <div className="w-14 h-14 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle size={28} className="text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 dark:text-white">Refund Processed</h4>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  {result.refundedItems} item(s) refunded — {CURRENCY}{fmt(parseFloat(result.refundTotal))}
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 font-mono">{result.refundReceiptNumber}</p>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Stock has been restored for physical products.</p>
              <button onClick={onClose} className="btn-primary w-full">Done</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Payment Modal ────────────────────────────────────────────────────────────
let _lineIdCounter = 0;
const nextLineId = () => ++_lineIdCounter;

function PaymentModal({
  total,
  hasCustomer,
  onConfirm,
  onClose,
}: {
  total: number;
  hasCustomer: boolean;
  onConfirm: (lines: ConfirmedPaymentLine[], creditDueDate?: string) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<'payment' | 'credit'>('payment');
  const [creditDueDate, setCreditDueDate] = useState('');
  const [lines, setLines] = useState<PaymentLineInput[]>([
    { id: nextLineId(), method: 'cash', amount: fmt(total).replace(/,/g, ''), reference: '', amountTendered: '' },
  ]);

  const totalPaid = lines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
  const remaining = Math.max(0, total - totalPaid);
  const overpaid = Math.max(0, totalPaid - total);

  const updateLine = (id: number, patch: Partial<PaymentLineInput>) => {
    setLines(prev => prev.map(l => l.id === id ? { ...l, ...patch } : l));
  };

  const addLine = () => {
    setLines(prev => [
      ...prev,
      { id: nextLineId(), method: 'cash', amount: remaining > 0 ? fmt(remaining).replace(/,/g, '') : '', reference: '', amountTendered: '' },
    ]);
  };

  const removeLine = (id: number) => {
    setLines(prev => prev.filter(l => l.id !== id));
  };

  const isCredit = mode === 'credit';

  const canConfirmPayment = (() => {
    if (lines.length === 0) return false;
    if (totalPaid < total - 0.01) return false;
    // Overpayment only allowed if a cash line is present (cashier gives change)
    if (totalPaid > total + 0.01) {
      const hasCash = lines.some(l => l.method === 'cash');
      if (!hasCash) return false;
    }
    for (const l of lines) {
      const amt = parseFloat(l.amount) || 0;
      if (amt <= 0) return false;
      const meta = PAYMENT_METHODS.find(m => m.value === l.method);
      if (meta?.requiresRef && !l.reference.trim()) return false;
      if (l.method === 'cash') {
        // Treat empty amountTendered as exact (valid)
        const tendered = parseFloat(l.amountTendered);
        if (!isNaN(tendered) && tendered < amt) return false;
      }
    }
    return true;
  })();

  const canConfirmCredit = isCredit && hasCustomer && creditDueDate.length > 0;

  const handleConfirm = () => {
    if (isCredit) {
      if (!canConfirmCredit) return;
      onConfirm([{ method: 'cash', amount: total }], creditDueDate);
    } else {
      if (!canConfirmPayment) return;
      const confirmed: ConfirmedPaymentLine[] = lines.map(l => ({
        method: l.method,
        amount: parseFloat(l.amount) || 0,
        reference: l.reference.trim() || undefined,
        amountTendered: l.method === 'cash' ? (parseFloat(l.amountTendered) || parseFloat(l.amount) || 0) : undefined,
      }));
      onConfirm(confirmed);
    }
  };

  const cashChange = (() => {
    let change = 0;
    for (const l of lines) {
      if (l.method === 'cash') {
        const amt = parseFloat(l.amount) || 0;
        const tendered = parseFloat(l.amountTendered) || 0;
        change += Math.max(0, tendered - amt);
      }
    }
    return change + overpaid;
  })();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm border border-slate-100 dark:border-slate-700 max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex-shrink-0">
          <h3 className="font-bold text-slate-900 dark:text-white">Payment</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"><X size={16} /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {/* Amount due */}
          <div className="text-center py-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl">
            <div className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold uppercase tracking-wider">Amount Due</div>
            <div className="text-3xl font-bold text-indigo-700 dark:text-indigo-300 mt-1">{CURRENCY}{fmt(total)}</div>
          </div>

          {/* Mode toggle */}
          <div className="flex rounded-xl overflow-hidden border border-slate-200 dark:border-slate-600">
            <button
              onClick={() => setMode('payment')}
              className={clsx('flex-1 py-2 text-sm font-semibold transition-colors', mode === 'payment' ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600')}
            >
              Pay Now
            </button>
            <button
              onClick={() => setMode('credit')}
              className={clsx('flex-1 py-2 text-sm font-semibold transition-colors', mode === 'credit' ? 'bg-orange-500 text-white' : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600')}
            >
              Pay Later (Credit)
            </button>
          </div>

          {/* Credit mode */}
          {isCredit && (
            <div className="space-y-3">
              {!hasCustomer && (
                <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-3 py-2.5 text-xs text-amber-700 dark:text-amber-300 font-medium">
                  <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                  A customer must be selected for credit sales.
                </div>
              )}
              <div>
                <label className="label dark:text-slate-300 text-xs">Repayment Due Date *</label>
                <input
                  type="date"
                  value={creditDueDate}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={e => setCreditDueDate(e.target.value)}
                  className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                  autoFocus
                />
              </div>
              <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-xl px-3 py-2.5 text-xs text-orange-700 dark:text-orange-300">
                A debt record will be created automatically and tracked under the customer's profile.
              </div>
            </div>
          )}

          {/* Payment lines */}
          {!isCredit && (
            <div className="space-y-3">
              {lines.map((line, idx) => {
                const meta = PAYMENT_METHODS.find(m => m.value === line.method);
                const tendered = parseFloat(line.amountTendered) || 0;
                const lineAmt = parseFloat(line.amount) || 0;
                const lineChange = line.method === 'cash' && tendered > lineAmt ? tendered - lineAmt : 0;
                const showChange = line.method === 'cash' && (tendered >= lineAmt && tendered > 0);

                return (
                  <div key={line.id} className="rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/40 p-3 space-y-2.5">
                    {/* Line header */}
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        {lines.length > 1 ? `Payment ${idx + 1}` : 'Payment Method'}
                      </span>
                      {lines.length > 1 && (
                        <button onClick={() => removeLine(line.id)} className="p-0.5 rounded text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                          <X size={13} />
                        </button>
                      )}
                    </div>

                    {/* Method selector */}
                    <div className="grid grid-cols-2 gap-1.5">
                      {PAYMENT_METHODS.map(m => (
                        <button
                          key={m.value}
                          onClick={() => updateLine(line.id, { method: m.value, reference: '', amountTendered: '' })}
                          className={clsx(
                            'flex items-center gap-1.5 px-2.5 py-2 rounded-lg border text-xs font-semibold transition-all text-left',
                            line.method === m.value
                              ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
                              : 'border-slate-200 dark:border-slate-500 text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-700 hover:border-indigo-300'
                          )}
                        >
                          <span className={clsx('w-2 h-2 rounded-full flex-shrink-0', m.color)} />
                          <span className="truncate">{m.label}</span>
                        </button>
                      ))}
                    </div>

                    {/* Amount */}
                    <div>
                      <label className="text-xs text-slate-500 dark:text-slate-400 font-medium">Amount ({CURRENCY})</label>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={line.amount}
                        onChange={e => updateLine(line.id, { amount: e.target.value })}
                        placeholder="0.00"
                        className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white font-bold text-base mt-1"
                        autoFocus={idx === 0}
                      />
                    </div>

                    {/* Cash: amount tendered */}
                    {line.method === 'cash' && (
                      <div>
                        <label className="text-xs text-slate-500 dark:text-slate-400 font-medium">Amount Tendered ({CURRENCY})</label>
                        <input
                          type="number"
                          min={0}
                          step="0.50"
                          value={line.amountTendered}
                          onChange={e => updateLine(line.id, { amountTendered: e.target.value })}
                          placeholder={line.amount || fmt(total)}
                          className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white mt-1"
                        />
                        {showChange && (
                          <div className="flex justify-between items-center mt-1.5 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg px-3 py-1.5 border border-emerald-200 dark:border-emerald-800">
                            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Change Due</span>
                            <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400">{CURRENCY}{fmt(lineChange + (lineChange === 0 ? Math.max(0, totalPaid - total) : 0))}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Reference for mobile money / bank */}
                    {meta?.requiresRef && (
                      <div>
                        <label className="text-xs text-slate-500 dark:text-slate-400 font-medium">Transaction Reference</label>
                        <input
                          type="text"
                          value={line.reference}
                          onChange={e => updateLine(line.id, { reference: e.target.value })}
                          placeholder="MoMo ID or bank ref"
                          className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white font-mono mt-1 text-sm"
                        />
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Running total */}
              {lines.length > 1 && (
                <div className={clsx(
                  'rounded-xl px-4 py-3 text-sm flex justify-between items-center border',
                  remaining === 0 || totalPaid >= total
                    ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400'
                    : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400'
                )}>
                  <span className="font-semibold">{remaining > 0 ? 'Remaining' : 'Total Paid'}</span>
                  <span className="font-bold text-base">
                    {remaining > 0 ? `-${CURRENCY}${fmt(remaining)}` : `${CURRENCY}${fmt(totalPaid)}`}
                  </span>
                </div>
              )}

              {cashChange > 0 && lines.length > 1 && (
                <div className="flex justify-between items-center bg-emerald-50 dark:bg-emerald-900/20 rounded-xl px-4 py-3 border border-emerald-200 dark:border-emerald-800">
                  <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Total Change Due</span>
                  <span className="text-xl font-bold text-emerald-700 dark:text-emerald-400">{CURRENCY}{fmt(cashChange)}</span>
                </div>
              )}

              {/* Add payment method button */}
              {remaining > 0 && (
                <button
                  onClick={addLine}
                  className="w-full py-2.5 rounded-xl border-2 border-dashed border-indigo-300 dark:border-indigo-600 text-indigo-600 dark:text-indigo-400 text-sm font-semibold hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors flex items-center justify-center gap-1.5"
                >
                  <Plus size={14} /> Add another payment method
                </button>
              )}
            </div>
          )}
        </div>

        {/* Confirm button */}
        <div className="p-5 pt-0 flex-shrink-0">
          <button
            onClick={handleConfirm}
            disabled={isCredit ? !canConfirmCredit : !canConfirmPayment}
            className={clsx(
              'w-full py-3.5 rounded-xl font-bold text-base transition-all',
              (isCredit ? canConfirmCredit : canConfirmPayment)
                ? isCredit
                  ? 'bg-orange-500 hover:bg-orange-600 text-white shadow-md'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-200 dark:shadow-indigo-900/40'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed'
            )}
          >
            {isCredit
              ? (hasCustomer ? 'Record Credit Sale' : 'Select a customer first')
              : remaining > 0
              ? `Still need ${CURRENCY}${fmt(remaining)}`
              : 'Confirm Payment'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main POS Component ───────────────────────────────────────────────────────
export default function POS() {
  const { user } = useAuth();

  // Data
  const [products, setProducts] = useState<Product[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [session, setSession] = useState<any>(null);
  const [shopName, setShopName] = useState('PrintShop Manager');
  const [shopAddress, setShopAddress] = useState('');
  const [loading, setLoading] = useState(true);

  // Browser state
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'service' | number>('all');

  // Cart
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartDiscount, setCartDiscount] = useState('');
  const [cartDiscountType, setCartDiscountType] = useState<'amount' | 'percent'>('amount');
  const [customer, setCustomer] = useState<Customer | null>(null);

  // Modals
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [receipt, setReceipt] = useState<any>(null);

  // Barcode scanner
  const barcodeBuffer = useRef('');
  const barcodeTimer = useRef<ReturnType<typeof setTimeout>>();
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const [barcodeFlash, setBarcodeFlash] = useState(false);
  const [barcodeError, setBarcodeError] = useState('');

  const [processing, setProcessing] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Loyalty
  const [loyaltySettings, setLoyaltySettings] = useState({ enabled: true, earnRate: 1, pointsPerCedis: 100, minRedeem: 100 });
  const [loyaltyPointsToRedeem, setLoyaltyPointsToRedeem] = useState(0);

  // ─── Load data ─────────────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      posApi.products(),
      posApi.services(),
      cashApi.currentSession().catch(() => null),
      settingsApi.get(),
    ]).then(([prods, svcs, sess, sett]) => {
      setProducts(prods);
      setServices(svcs);
      setSession(sess);
      if (sett) {
        if (sett.shop_name) setShopName(sett.shop_name);
        if (sett.shop_address) setShopAddress(sett.shop_address);
        setLoyaltySettings({
          enabled: (sett.loyalty_enabled ?? 'true') !== 'false',
          earnRate: parseFloat(sett.loyalty_earn_rate ?? '1'),
          pointsPerCedis: parseFloat(sett.loyalty_points_per_cedis ?? '100'),
          minRedeem: parseInt(sett.loyalty_min_redeem ?? '100', 10),
        });
      }

      // Derive categories from products
      const catMap = new Map<number, string>();
      prods.forEach((p: Product) => {
        if (p.categoryId && p.categoryName) catMap.set(p.categoryId, p.categoryName);
      });
      setCategories(Array.from(catMap.entries()).map(([id, name]) => ({ id, name })));
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  // ─── Search re-fetch with debounce ─────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => {
      posApi.products(search || undefined, typeof activeTab === 'number' ? activeTab : undefined)
        .then(setProducts)
        .catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [search, activeTab]);

  // ─── Barcode scanner listener ────────────────────────────────────────────
  const handleBarcodeInput = useCallback(async (sku: string) => {
    if (!sku.trim()) return;
    setBarcodeError('');
    try {
      const product = await posApi.barcodeSearch(sku.trim());
      addProduct(product);
      setBarcodeFlash(true);
      setTimeout(() => setBarcodeFlash(false), 800);
    } catch {
      setBarcodeError(`Barcode "${sku}" not found`);
      setTimeout(() => setBarcodeError(''), 3000);
    }
  }, []);

  // Key listener for barcode scanner (fast keyboard input → Enter)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';
      if (isInput && target !== barcodeInputRef.current) return;

      if (e.key === 'Enter' && barcodeBuffer.current) {
        e.preventDefault();
        const sku = barcodeBuffer.current;
        barcodeBuffer.current = '';
        clearTimeout(barcodeTimer.current);
        handleBarcodeInput(sku);
        return;
      }
      if (e.key.length === 1) {
        barcodeBuffer.current += e.key;
        clearTimeout(barcodeTimer.current);
        barcodeTimer.current = setTimeout(() => { barcodeBuffer.current = ''; }, 100);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleBarcodeInput]);

  // ─── Cart helpers ──────────────────────────────────────────────────────────
  const addProduct = (p: Product) => {
    setCart(prev => {
      const idx = prev.findIndex(i => i.productId === p.id);
      const maxStock = p.quantityInStock ?? 9999;
      if (idx >= 0) {
        const newQty = prev[idx].quantity + 1;
        if (newQty > maxStock) {
          showToast('error', `Only ${maxStock} in stock`);
          return prev;
        }
        return prev.map((item, i) => i === idx ? { ...item, quantity: newQty } : item);
      }
      if (maxStock === 0) {
        showToast('error', `"${p.name}" is out of stock`);
        return prev;
      }
      return [...prev, {
        productId: p.id,
        description: p.name,
        quantity: 1,
        unitPrice: parseFloat(p.price),
        discount: 0,
        maxStock,
      }];
    });
  };

  const addService = (s: Service) => {
    setCart(prev => {
      const idx = prev.findIndex(i => i.serviceId === s.id);
      if (idx >= 0) return prev.map((item, i) => i === idx ? { ...item, quantity: item.quantity + 1 } : item);
      return [...prev, {
        serviceId: s.id,
        description: `${s.name} (per ${s.unit})`,
        quantity: 1,
        unitPrice: parseFloat(s.pricePerUnit),
        discount: 0,
      }];
    });
  };

  const updateQty = (idx: number, newQty: number) => {
    setCart(prev => {
      const item = prev[idx];
      if (item.maxStock && newQty > item.maxStock) {
        showToast('error', `Only ${item.maxStock} in stock`);
        return prev;
      }
      if (newQty <= 0) return prev.filter((_, i) => i !== idx);
      return prev.map((item, i) => i === idx ? { ...item, quantity: newQty } : item);
    });
  };

  const updateItemDiscount = (idx: number, val: string) => {
    setCart(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const d = parseFloat(val) || 0;
      return { ...item, discount: Math.min(d, item.quantity * item.unitPrice) };
    }));
  };

  const removeItem = (idx: number) => setCart(prev => prev.filter((_, i) => i !== idx));

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  // ─── Totals ────────────────────────────────────────────────────────────────
  const itemsSubtotal = cart.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const itemDiscountTotal = cart.reduce((s, i) => s + i.discount, 0);
  const cartDiscountVal = (() => {
    const v = parseFloat(cartDiscount) || 0;
    if (cartDiscountType === 'percent') return Math.min(v / 100 * itemsSubtotal, itemsSubtotal);
    return Math.min(v, itemsSubtotal);
  })();
  const subtotal = itemsSubtotal;
  const loyaltyDiscountValue = customer && loyaltyPointsToRedeem > 0
    ? loyaltyPointsToRedeem / loyaltySettings.pointsPerCedis
    : 0;
  const discountAmount = itemDiscountTotal + cartDiscountVal + loyaltyDiscountValue;
  const total = Math.max(0, subtotal - discountAmount);

  // ─── Filtered items ────────────────────────────────────────────────────────
  const displayedProducts = products.filter(p => {
    if (activeTab === 'service') return false;
    if (typeof activeTab === 'number') return p.categoryId === activeTab;
    return true;
  });

  const displayedServices = (activeTab === 'all' || activeTab === 'service' ? services : [])
    .filter(s => !search || s.name.toLowerCase().includes(search.toLowerCase()) || (s.description || '').toLowerCase().includes(search.toLowerCase()));

  // ─── Checkout ──────────────────────────────────────────────────────────────
  const handlePaymentConfirm = async (lines: ConfirmedPaymentLine[], creditDueDate?: string) => {
    const isCredit = !!creditDueDate;
    if (isCredit && !customer) {
      showToast('error', 'Credit sales require a customer.');
      return;
    }
    setShowPaymentModal(false);
    setProcessing(true);

    // Derive primary method for backward-compat (largest line)
    const primaryLine = lines.reduce((a, b) => b.amount > a.amount ? b : a, lines[0]);
    const isSplit = lines.length > 1;

    try {
      const result = await posApi.createSale({
        customerId: customer?.id,
        cashSessionId: session?.id,
        items: cart.map(i => ({
          productId: i.productId,
          serviceId: i.serviceId,
          description: i.description,
          quantity: i.quantity,
          unitPrice: String(i.unitPrice),
          discount: String(i.discount),
          totalPrice: String(i.quantity * i.unitPrice - i.discount),
        })),
        subtotal: String(subtotal),
        discountAmount: String(discountAmount),
        taxAmount: '0',
        totalAmount: String(total),
        paymentMethod: primaryLine?.method ?? 'cash',
        paymentReference: primaryLine?.reference || undefined,
        paymentLines: isSplit ? lines : undefined,
        isCredit,
        creditDueDate: creditDueDate || undefined,
        pointsToRedeem: loyaltyPointsToRedeem > 0 ? loyaltyPointsToRedeem : undefined,
      });

      setReceipt({
        receiptNumber: result.receiptNumber,
        saleNumber: result.saleNumber,
        cashierName: result.cashierName ?? user?.name ?? 'Cashier',
        customerName: customer?.name,
        paymentMethod: isCredit ? 'credit' : (primaryLine?.method ?? 'cash'),
        paymentReference: primaryLine?.reference || undefined,
        amountTendered: isCredit ? 0 : (primaryLine?.amountTendered ?? 0),
        paymentLines: isSplit ? lines : undefined,
        items: cart,
        subtotal,
        discountAmount,
        total,
        createdAt: new Date().toISOString(),
      });

      // Reset cart
      setCart([]);
      setCartDiscount('');
      setCustomer(null);
      setLoyaltyPointsToRedeem(0);

      // Refresh products to update stock counts
      posApi.products().then(setProducts).catch(() => {});
    } catch (err: any) {
      showToast('error', err.message || 'Sale failed. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-full min-h-0">
      {/* ─── Toast ─────────────────────────────────────────────────────────── */}
      {toast && (
        <div className={clsx(
          'fixed top-4 right-4 z-[60] flex items-center gap-2 px-4 py-3 rounded-xl shadow-xl text-sm font-semibold animate-fade-in',
          toast.type === 'success'
            ? 'bg-emerald-600 text-white'
            : 'bg-red-600 text-white'
        )}>
          {toast.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
          {toast.message}
        </div>
      )}

      {/* ─── Modals ────────────────────────────────────────────────────────── */}
      {showCustomerModal && (
        <CustomerModal
          onSelect={(c) => { setCustomer(c); setLoyaltyPointsToRedeem(0); setShowCustomerModal(false); }}
          onClose={() => setShowCustomerModal(false)}
        />
      )}
      {showPaymentModal && (
        <PaymentModal
          total={total}
          hasCustomer={!!customer}
          onConfirm={handlePaymentConfirm}
          onClose={() => setShowPaymentModal(false)}
        />
      )}
      {showRefundModal && <RefundModal onClose={() => setShowRefundModal(false)} />}
      {receipt && (
        <ReceiptOverlay
          data={receipt}
          shopName={shopName}
          shopAddress={shopAddress}
          onClose={() => setReceipt(null)}
        />
      )}

      {/* ─── Left panel: product browser ───────────────────────────────────── */}
      <div className="flex-1 flex flex-col gap-3 min-w-0 min-h-0">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="page-title dark:text-white flex items-center gap-2">
              <ShoppingCart size={22} className="text-indigo-600" /> Point of Sale
            </h1>
            {!session && (
              <p className="text-xs text-amber-600 dark:text-amber-400 font-medium mt-0.5 flex items-center gap-1">
                <AlertCircle size={12} /> No open cash session — open one in Cash Management first.
              </p>
            )}
          </div>
          <button
            onClick={() => setShowRefundModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl hover:border-red-300 hover:text-red-600 dark:hover:text-red-400 transition-all"
          >
            <RotateCcw size={14} /> Refund
          </button>
        </div>

        {/* Search + barcode */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search products or services..."
              className="input pl-9 dark:bg-slate-800 dark:border-slate-600 dark:text-white dark:placeholder-slate-400"
            />
          </div>
          {/* Barcode input for scanner (visible but compact) */}
          <div className={clsx(
            'relative flex items-center border rounded-xl px-3 gap-2 transition-colors cursor-pointer',
            barcodeFlash
              ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-400'
              : barcodeError
              ? 'bg-red-50 dark:bg-red-900/20 border-red-400'
              : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600'
          )}
            onClick={() => barcodeInputRef.current?.focus()}
            title="Click here then scan a barcode"
          >
            <Barcode size={15} className={clsx(
              barcodeFlash ? 'text-emerald-500' : barcodeError ? 'text-red-500' : 'text-slate-400'
            )} />
            <input
              ref={barcodeInputRef}
              type="text"
              placeholder="Scan barcode"
              className="w-28 text-xs bg-transparent border-none outline-none text-slate-600 dark:text-slate-300 placeholder-slate-400"
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  const val = (e.target as HTMLInputElement).value.trim();
                  if (val) { handleBarcodeInput(val); (e.target as HTMLInputElement).value = ''; }
                  e.preventDefault();
                }
              }}
            />
          </div>
        </div>

        {barcodeError && (
          <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1 -mt-1">
            <AlertCircle size={11} /> {barcodeError}
          </p>
        )}

        {/* Category tabs */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-hide">
          <button
            onClick={() => setActiveTab('all')}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex-shrink-0',
              activeTab === 'all'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 hover:border-indigo-300'
            )}
          >
            <Package size={12} /> All
          </button>
          {categories.map(cat => {
            const icon = cat.name === 'Books' ? <BookOpen size={12} />
              : cat.name.includes('Stationery') || cat.name.includes('Office') ? <Tag size={12} />
              : <Package size={12} />;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveTab(cat.id)}
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex-shrink-0',
                  activeTab === cat.id
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 hover:border-indigo-300'
                )}
              >
                {icon} {cat.name}
              </button>
            );
          })}
          <button
            onClick={() => setActiveTab('service')}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex-shrink-0',
              activeTab === 'service'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 hover:border-indigo-300'
            )}
          >
            <Briefcase size={12} /> Services
          </button>
        </div>

        {/* Product/Service grid */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {displayedProducts.length === 0 && displayedServices.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-slate-400 dark:text-slate-500">
              <Search size={32} className="mb-2 opacity-40" />
              <p className="text-sm">No items found</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5">
              {/* Products */}
              {displayedProducts.map(p => {
                const outOfStock = (p.quantityInStock ?? 0) === 0;
                const lowStock = !outOfStock && (p.quantityInStock ?? 0) <= (p.reorderLevel ?? 10);
                return (
                  <button
                    key={`p-${p.id}`}
                    onClick={() => !outOfStock && addProduct(p)}
                    disabled={outOfStock}
                    className={clsx(
                      'card dark:bg-slate-800 dark:border-slate-700/50 text-left p-3 transition-all active:scale-95',
                      outOfStock
                        ? 'opacity-50 cursor-not-allowed'
                        : 'hover:border-indigo-300 dark:hover:border-indigo-600 hover:shadow-md cursor-pointer'
                    )}
                  >
                    <div className="w-8 h-8 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg flex items-center justify-center mb-2">
                      <Package size={14} className="text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div className="text-xs font-semibold text-slate-900 dark:text-white leading-tight line-clamp-2 mb-1">{p.name}</div>
                    <div className="text-xs font-bold text-indigo-600 dark:text-indigo-400">{CURRENCY}{fmt(parseFloat(p.price))}</div>
                    <div className={clsx('text-[10px] mt-0.5 font-medium', outOfStock ? 'text-red-500' : lowStock ? 'text-amber-500' : 'text-slate-400 dark:text-slate-500')}>
                      {outOfStock ? 'Out of stock' : `${p.quantityInStock} in stock`}
                    </div>
                  </button>
                );
              })}

              {/* Services */}
              {displayedServices.map(s => (
                <button
                  key={`s-${s.id}`}
                  onClick={() => addService(s)}
                  className="card dark:bg-slate-800 dark:border-slate-700/50 text-left p-3 hover:border-purple-300 dark:hover:border-purple-600 hover:shadow-md transition-all active:scale-95 cursor-pointer"
                >
                  <div className="w-8 h-8 bg-purple-50 dark:bg-purple-900/30 rounded-lg flex items-center justify-center mb-2">
                    <Briefcase size={14} className="text-purple-600 dark:text-purple-400" />
                  </div>
                  <div className="text-xs font-semibold text-slate-900 dark:text-white leading-tight line-clamp-2 mb-1">{s.name}</div>
                  <div className="text-xs font-bold text-purple-600 dark:text-purple-400">
                    {CURRENCY}{fmt(parseFloat(s.pricePerUnit))}<span className="text-slate-400 font-normal">/{s.unit}</span>
                  </div>
                  <div className="text-[10px] mt-0.5 text-slate-400 dark:text-slate-500">Service</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ─── Right panel: cart ─────────────────────────────────────────────── */}
      <div className="w-full lg:w-[340px] xl:w-[380px] flex flex-col gap-3 flex-shrink-0">
        <div className="card dark:bg-slate-800 dark:border-slate-700/50 flex flex-col h-full min-h-0">
          {/* Cart header */}
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-slate-900 dark:text-white flex items-center gap-2 text-sm">
              <ShoppingCart size={15} /> Cart
              {cart.length > 0 && (
                <span className="w-5 h-5 bg-indigo-600 rounded-full text-white text-xs flex items-center justify-center font-bold">{cart.length}</span>
              )}
            </h2>
            <div className="flex items-center gap-1">
              {/* Customer button */}
              <button
                onClick={() => setShowCustomerModal(true)}
                className={clsx(
                  'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all',
                  customer
                    ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-600'
                    : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:border-indigo-300'
                )}
              >
                <User size={12} />
                {customer ? customer.name.split(' ')[0] : 'Customer'}
              </button>
              {cart.length > 0 && (
                <button onClick={() => { setCart([]); setLoyaltyPointsToRedeem(0); }} className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 text-xs transition-colors">
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          </div>

          {customer && (
            <div className="mb-3 space-y-2">
              <div className="flex items-center justify-between bg-indigo-50 dark:bg-indigo-900/20 rounded-xl px-3 py-2">
                <span className="text-xs text-indigo-700 dark:text-indigo-300 font-medium flex items-center gap-1.5">
                  <User size={11} /> {customer.name}
                  {customer.loyaltyPoints > 0 && (
                    <span className="text-amber-600 dark:text-amber-400 font-semibold">· ⭐ {customer.loyaltyPoints} pts</span>
                  )}
                </span>
                <button onClick={() => { setCustomer(null); setLoyaltyPointsToRedeem(0); }} className="text-indigo-400 hover:text-indigo-600">
                  <X size={12} />
                </button>
              </div>
              {/* Loyalty redemption */}
              {loyaltySettings.enabled && customer.loyaltyPoints >= loyaltySettings.minRedeem && cart.length > 0 && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl px-3 py-2.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-amber-700 dark:text-amber-300 flex items-center gap-1">
                      <Star size={11} fill="currentColor" /> Redeem Loyalty Points
                    </span>
                    <span className="text-xs text-amber-600 dark:text-amber-400">{customer.loyaltyPoints} available</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      step={loyaltySettings.minRedeem}
                      max={Math.min(customer.loyaltyPoints, Math.floor(total * loyaltySettings.pointsPerCedis))}
                      value={loyaltyPointsToRedeem || ''}
                      onChange={e => {
                        const v = Math.min(
                          parseInt(e.target.value) || 0,
                          customer.loyaltyPoints,
                          Math.floor(total * loyaltySettings.pointsPerCedis + loyaltyPointsToRedeem * 1),
                        );
                        setLoyaltyPointsToRedeem(Math.max(0, v));
                      }}
                      placeholder="0 pts"
                      className="flex-1 text-xs bg-white dark:bg-slate-700 border border-amber-300 dark:border-amber-600 rounded-lg px-2 py-1.5 text-slate-700 dark:text-slate-200 outline-none focus:border-amber-500"
                    />
                    {loyaltyPointsToRedeem > 0 ? (
                      <button onClick={() => setLoyaltyPointsToRedeem(0)} className="text-xs text-amber-600 dark:text-amber-400 hover:text-amber-800 font-semibold whitespace-nowrap">
                        Clear
                      </button>
                    ) : (
                      <button
                        onClick={() => setLoyaltyPointsToRedeem(Math.min(
                          customer.loyaltyPoints,
                          Math.floor(total * loyaltySettings.pointsPerCedis),
                        ))}
                        className="text-xs text-amber-600 dark:text-amber-400 hover:text-amber-800 font-semibold whitespace-nowrap"
                      >
                        Use all
                      </button>
                    )}
                  </div>
                  {loyaltyPointsToRedeem > 0 && (
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      = {CURRENCY}{fmt(loyaltyPointsToRedeem / loyaltySettings.pointsPerCedis)} off
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Cart items */}
          {cart.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-10 text-slate-400 dark:text-slate-500 text-sm">
              <ShoppingCart size={32} className="mb-2 opacity-30" />
              <p>Cart is empty</p>
              <p className="text-xs mt-1 opacity-70">Click a product or scan a barcode</p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto min-h-0 space-y-2 mb-3 pr-0.5">
              {cart.map((item, idx) => {
                const lineTotal = item.quantity * item.unitPrice - item.discount;
                return (
                  <div key={idx} className="bg-slate-50 dark:bg-slate-700/40 rounded-xl p-2.5 space-y-2">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-slate-900 dark:text-white leading-tight truncate">{item.description}</div>
                        <div className="text-xs text-indigo-600 dark:text-indigo-400 mt-0.5">{CURRENCY}{fmt(item.unitPrice)}</div>
                      </div>
                      <button onClick={() => removeItem(idx)} className="p-1 rounded-lg text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 flex-shrink-0">
                        <X size={11} />
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Qty spinner */}
                      <div className="flex items-center gap-1">
                        <button onClick={() => updateQty(idx, item.quantity - 1)} className="w-6 h-6 rounded-lg bg-slate-200 dark:bg-slate-600 flex items-center justify-center hover:bg-slate-300 dark:hover:bg-slate-500 transition-colors">
                          <Minus size={9} />
                        </button>
                        <input
                          type="number"
                          min={1}
                          value={item.quantity}
                          onChange={e => updateQty(idx, parseInt(e.target.value) || 1)}
                          className="w-10 text-center text-xs font-bold text-slate-900 dark:text-white bg-transparent border-none outline-none"
                        />
                        <button onClick={() => updateQty(idx, item.quantity + 1)} className="w-6 h-6 rounded-lg bg-slate-200 dark:bg-slate-600 flex items-center justify-center hover:bg-slate-300 dark:hover:bg-slate-500 transition-colors">
                          <Plus size={9} />
                        </button>
                      </div>
                      {/* Per-item discount */}
                      <div className="flex items-center gap-1 flex-1">
                        <Tag size={10} className="text-slate-400 flex-shrink-0" />
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={item.discount || ''}
                          onChange={e => updateItemDiscount(idx, e.target.value)}
                          placeholder="Disc."
                          className="w-full text-xs bg-white dark:bg-slate-600 border border-slate-200 dark:border-slate-500 rounded-lg px-2 py-1 text-slate-700 dark:text-slate-200 outline-none focus:border-indigo-400"
                        />
                      </div>
                      {/* Line total */}
                      <span className="text-xs font-bold text-slate-900 dark:text-white flex-shrink-0">{CURRENCY}{fmt(lineTotal)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Cart footer */}
          {cart.length > 0 && (
            <div className="border-t border-slate-100 dark:border-slate-700 pt-3 space-y-3">
              {/* Cart-wide discount */}
              <div className="flex items-center gap-2">
                <Percent size={13} className="text-slate-400 flex-shrink-0" />
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={cartDiscount}
                  onChange={e => setCartDiscount(e.target.value)}
                  placeholder="Cart discount"
                  className="flex-1 text-xs bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1.5 text-slate-700 dark:text-slate-200 outline-none focus:border-indigo-400"
                />
                <div className="flex bg-slate-100 dark:bg-slate-700 rounded-lg p-0.5">
                  <button
                    onClick={() => setCartDiscountType('amount')}
                    className={clsx('px-2 py-1 rounded-md text-xs font-semibold transition-all', cartDiscountType === 'amount' ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400')}
                  >GH₵</button>
                  <button
                    onClick={() => setCartDiscountType('percent')}
                    className={clsx('px-2 py-1 rounded-md text-xs font-semibold transition-all', cartDiscountType === 'percent' ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400')}
                  >%</button>
                </div>
              </div>

              {/* Totals */}
              <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-3 space-y-1.5">
                <div className="flex justify-between text-xs text-slate-600 dark:text-slate-300">
                  <span>Subtotal</span><span>{CURRENCY}{fmt(subtotal)}</span>
                </div>
                {(itemDiscountTotal + cartDiscountVal) > 0 && (
                  <div className="flex justify-between text-xs text-emerald-600 dark:text-emerald-400">
                    <span>Discount</span><span>-{CURRENCY}{fmt(itemDiscountTotal + cartDiscountVal)}</span>
                  </div>
                )}
                {loyaltyDiscountValue > 0 && (
                  <div className="flex justify-between text-xs text-amber-600 dark:text-amber-400">
                    <span>⭐ Points Discount ({loyaltyPointsToRedeem} pts)</span>
                    <span>-{CURRENCY}{fmt(loyaltyDiscountValue)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-slate-900 dark:text-white text-base border-t border-slate-200 dark:border-slate-600 pt-1.5 mt-1">
                  <span>Total</span><span>{CURRENCY}{fmt(total)}</span>
                </div>
                {customer && loyaltySettings.enabled && !loyaltyPointsToRedeem && (
                  <div className="text-xs text-amber-600 dark:text-amber-400 text-center pt-0.5">
                    Will earn ~{Math.floor(total * loyaltySettings.earnRate)} pts
                  </div>
                )}
              </div>

              {/* Checkout button */}
              <button
                onClick={() => setShowPaymentModal(true)}
                disabled={cart.length === 0 || processing}
                className="btn-primary w-full py-3 text-sm flex items-center justify-center gap-2 font-bold"
              >
                {processing
                  ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <><ShoppingCart size={16} /> Checkout — {CURRENCY}{fmt(total)}</>
                }
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
