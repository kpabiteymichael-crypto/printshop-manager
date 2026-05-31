import { useEffect, useState } from 'react';
import { productsApi, customersApi, cashApi, posApi } from '../lib/api';
import { ShoppingCart, Plus, Minus, Trash2, CreditCard, Banknote, Search, X, CheckCircle } from 'lucide-react';
import clsx from 'clsx';

interface CartItem {
  productId?: number;
  serviceId?: number;
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
}

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash', icon: <Banknote size={16} /> },
  { value: 'gcash', label: 'GCash', icon: <CreditCard size={16} /> },
  { value: 'maya', label: 'Maya', icon: <CreditCard size={16} /> },
  { value: 'card', label: 'Card', icon: <CreditCard size={16} /> },
  { value: 'transfer', label: 'Transfer', icon: <CreditCard size={16} /> },
];

export default function POS() {
  const [products, setProducts] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [session, setSession] = useState<any>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'products' | 'services'>('products');
  const [customerId, setCustomerId] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [discount, setDiscount] = useState('0');
  const [processing, setProcessing] = useState(false);
  const [receipt, setReceipt] = useState<any>(null);

  useEffect(() => {
    productsApi.list().then(setProducts);
    productsApi.services().then(setServices);
    customersApi.list().then(setCustomers);
    cashApi.currentSession().then(setSession).catch(() => {});
  }, []);

  const filteredProducts = products.filter(p => p.isActive && (!search || p.name.toLowerCase().includes(search.toLowerCase())));
  const filteredServices = services.filter(s => s.isActive && (!search || s.name.toLowerCase().includes(search.toLowerCase())));

  const addProduct = (p: any) => {
    setCart(prev => {
      const existing = prev.findIndex(i => i.productId === p.id);
      if (existing >= 0) {
        return prev.map((item, i) => i === existing ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { productId: p.id, description: p.name, quantity: 1, unitPrice: parseFloat(p.price), discount: 0 }];
    });
  };

  const addService = (s: any) => {
    setCart(prev => {
      const existing = prev.findIndex(i => i.serviceId === s.id);
      if (existing >= 0) return prev.map((item, i) => i === existing ? { ...item, quantity: item.quantity + 1 } : item);
      return [...prev, { serviceId: s.id, description: `${s.name} (per ${s.unit})`, quantity: 1, unitPrice: parseFloat(s.pricePerUnit), discount: 0 }];
    });
  };

  const updateQty = (idx: number, delta: number) => {
    setCart(prev => {
      const newCart = prev.map((item, i) => i === idx ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item);
      return newCart.filter(i => i.quantity > 0);
    });
  };

  const removeItem = (idx: number) => setCart(prev => prev.filter((_, i) => i !== idx));

  const subtotal = cart.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const discountAmt = parseFloat(discount) || 0;
  const total = Math.max(0, subtotal - discountAmt);

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    setProcessing(true);
    try {
      const result = await posApi.createSale({
        customerId: customerId ? Number(customerId) : undefined,
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
        discountAmount: String(discountAmt),
        taxAmount: '0',
        totalAmount: String(total),
        paymentMethod,
      });
      setReceipt({ ...result, items: cart, total, customerId });
      setCart([]);
      setDiscount('0');
      setCustomerId('');
    } catch (err: any) { alert(err.message); }
    finally { setProcessing(false); }
  };

  if (receipt) {
    return (
      <div className="max-w-sm mx-auto">
        <div className="card dark:bg-slate-800 dark:border-slate-700/50 text-center">
          <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={32} className="text-emerald-600 dark:text-emerald-400" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">Sale Complete!</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm">{receipt.saleNumber}</p>
          <div className="my-6 p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl text-left space-y-2">
            {receipt.items.map((item: CartItem, i: number) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-300">{item.description} × {item.quantity}</span>
                <span className="font-medium text-slate-900 dark:text-white">₱{(item.quantity * item.unitPrice).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
              </div>
            ))}
            <div className="border-t border-slate-200 dark:border-slate-600 pt-2 flex justify-between font-bold text-slate-900 dark:text-white">
              <span>Total</span>
              <span>₱{receipt.total.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">Receipt: {receipt.receiptNumber}</p>
          <button onClick={() => setReceipt(null)} className="btn-primary w-full">New Sale</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-full">
      {/* Product Grid */}
      <div className="flex-1 space-y-4 min-w-0">
        <div>
          <h1 className="page-title dark:text-white flex items-center gap-2"><ShoppingCart size={22} className="text-indigo-600" /> Point of Sale</h1>
          {!session && <p className="text-xs text-amber-600 dark:text-amber-400 font-medium mt-1">⚠ No open cash session. Open one in Cash Management first.</p>}
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products or services..." className="input pl-9 dark:bg-slate-800 dark:border-slate-600 dark:text-white dark:placeholder-slate-400" />
          </div>
          <div className="flex bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-600 p-1 gap-1">
            <button onClick={() => setTab('products')} className={clsx('px-3 py-1.5 rounded-lg text-xs font-semibold transition-all', tab === 'products' ? 'bg-indigo-600 text-white' : 'text-slate-600 dark:text-slate-300')}>Products</button>
            <button onClick={() => setTab('services')} className={clsx('px-3 py-1.5 rounded-lg text-xs font-semibold transition-all', tab === 'services' ? 'bg-indigo-600 text-white' : 'text-slate-600 dark:text-slate-300')}>Services</button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {(tab === 'products' ? filteredProducts : filteredServices).map(item => (
            <button
              key={item.id}
              onClick={() => tab === 'products' ? addProduct(item) : addService(item)}
              className="card dark:bg-slate-800 dark:border-slate-700/50 text-left hover:border-indigo-300 dark:hover:border-indigo-600 hover:shadow-md transition-all active:scale-95 p-3"
            >
              <div className="w-8 h-8 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg flex items-center justify-center mb-2">
                <ShoppingCart size={14} className="text-indigo-600 dark:text-indigo-400" />
              </div>
              <div className="text-xs font-semibold text-slate-900 dark:text-white leading-tight line-clamp-2">{item.name}</div>
              <div className="text-xs font-bold text-indigo-600 dark:text-indigo-400 mt-1">
                ₱{parseFloat(tab === 'products' ? item.price : item.pricePerUnit).toFixed(2)}
                {tab === 'services' && <span className="text-slate-400 font-normal">/{item.unit}</span>}
              </div>
              {tab === 'products' && (
                <div className={clsx('text-xs mt-0.5', item.quantityInStock <= item.reorderLevel ? 'text-amber-500' : 'text-slate-400 dark:text-slate-500')}>
                  {item.quantityInStock} in stock
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Cart */}
      <div className="w-full lg:w-80 xl:w-96 flex flex-col gap-4">
        <div className="card dark:bg-slate-800 dark:border-slate-700/50 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <ShoppingCart size={16} /> Cart
              {cart.length > 0 && <span className="w-5 h-5 bg-indigo-600 rounded-full text-white text-xs flex items-center justify-center">{cart.length}</span>}
            </h2>
            {cart.length > 0 && <button onClick={() => setCart([])} className="text-xs text-red-500 hover:text-red-700">Clear</button>}
          </div>

          {cart.length === 0 ? (
            <div className="text-center py-8 text-slate-400 dark:text-slate-500 text-sm">Cart is empty</div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto mb-4">
              {cart.map((item, i) => (
                <div key={i} className="flex items-center gap-2 p-2 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">{item.description}</div>
                    <div className="text-xs text-indigo-600 dark:text-indigo-400">₱{item.unitPrice.toFixed(2)}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => updateQty(i, -1)} className="w-6 h-6 rounded-lg bg-slate-200 dark:bg-slate-600 flex items-center justify-center hover:bg-slate-300 dark:hover:bg-slate-500"><Minus size={10} /></button>
                    <span className="text-xs font-bold text-slate-900 dark:text-white w-5 text-center">{item.quantity}</span>
                    <button onClick={() => updateQty(i, 1)} className="w-6 h-6 rounded-lg bg-slate-200 dark:bg-slate-600 flex items-center justify-center hover:bg-slate-300 dark:hover:bg-slate-500"><Plus size={10} /></button>
                    <button onClick={() => removeItem(i)} className="w-6 h-6 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-500 flex items-center justify-center hover:bg-red-200"><Trash2 size={10} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="border-t border-slate-100 dark:border-slate-700 pt-4 space-y-3">
            <div>
              <label className="label text-xs dark:text-slate-300">Customer</label>
              <select value={customerId} onChange={e => setCustomerId(e.target.value)} className="input text-sm dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                <option value="">Walk-in</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label text-xs dark:text-slate-300">Discount (₱)</label>
              <input type="number" min="0" step="0.01" value={discount} onChange={e => setDiscount(e.target.value)} className="input text-sm dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
            </div>
            <div>
              <label className="label text-xs dark:text-slate-300">Payment Method</label>
              <div className="flex gap-1.5 flex-wrap">
                {PAYMENT_METHODS.map(m => (
                  <button key={m.value} type="button" onClick={() => setPaymentMethod(m.value)}
                    className={clsx('flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all', paymentMethod === m.value ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:border-indigo-300')}>
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-3 space-y-1">
              <div className="flex justify-between text-sm text-slate-600 dark:text-slate-300"><span>Subtotal</span><span>₱{subtotal.toFixed(2)}</span></div>
              {discountAmt > 0 && <div className="flex justify-between text-sm text-emerald-600 dark:text-emerald-400"><span>Discount</span><span>-₱{discountAmt.toFixed(2)}</span></div>}
              <div className="flex justify-between font-bold text-slate-900 dark:text-white text-lg border-t border-slate-200 dark:border-slate-600 pt-1 mt-1"><span>Total</span><span>₱{total.toFixed(2)}</span></div>
            </div>
            <button
              onClick={handleCheckout}
              disabled={cart.length === 0 || processing}
              className="btn-primary w-full py-3 text-base flex items-center justify-center gap-2"
            >
              {processing ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <><CreditCard size={18} /> Checkout — ₱{total.toFixed(2)}</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
