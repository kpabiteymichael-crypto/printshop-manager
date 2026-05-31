import { useEffect, useState } from 'react';
import { suppliersApi, productsApi } from '../lib/api';
import {
  Truck, Plus, Phone, Mail, MapPin, User, ChevronLeft, X,
  ShoppingCart, CheckCircle, Clock, Package, FileText, AlertCircle, Trash2,
} from 'lucide-react';
import clsx from 'clsx';

const fmt = (v: string | number) => `₵${Number(v).toLocaleString('en-GH', { minimumFractionDigits: 2 })}`;
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('en-GH', { dateStyle: 'medium' }) : '—';

const PO_STATUS_COLORS: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  ordered: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  partial: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  received: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  cancelled: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
};

type View = 'list' | 'profile' | 'new-po';

export default function Suppliers() {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('list');
  const [selected, setSelected] = useState<any>(null);
  const [supplierOrders, setSupplierOrders] = useState<any[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  const [showNewSupplier, setShowNewSupplier] = useState(false);
  const [supplierForm, setSupplierForm] = useState({ name: '', contactName: '', email: '', phone: '', address: '', notes: '' });

  const [receivingPO, setReceivingPO] = useState<any>(null);
  const [receiveLines, setReceiveLines] = useState<Record<number, number>>({});

  const [poForm, setPoForm] = useState({
    supplierId: '',
    notes: '',
    expectedDeliveryAt: '',
    items: [{ productId: '', quantity: '1', unitPrice: '' }] as { productId: string; quantity: string; unitPrice: string }[],
  });

  useEffect(() => {
    Promise.all([suppliersApi.list(), productsApi.list()])
      .then(([s, p]) => { setSuppliers(s); setProducts(p.filter((pr: any) => pr.isActive)); })
      .finally(() => setLoading(false));
  }, []);

  const openProfile = async (supplier: any) => {
    setSelected(supplier);
    setView('profile');
    setOrdersLoading(true);
    try {
      const [profile, orders] = await Promise.all([suppliersApi.get(supplier.id), suppliersApi.orders(supplier.id)]);
      setSelected(profile);
      setSupplierOrders(orders);
    } finally { setOrdersLoading(false); }
  };

  const handleCreateSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const s = await suppliersApi.create(supplierForm);
      setSuppliers(prev => [s, ...prev]);
      setShowNewSupplier(false);
      setSupplierForm({ name: '', contactName: '', email: '', phone: '', address: '', notes: '' });
    } catch (err: any) { alert(err.message); }
    finally { setSaving(false); }
  };

  const openNewPO = (supplierId?: number) => {
    setPoForm({ supplierId: supplierId ? String(supplierId) : '', notes: '', expectedDeliveryAt: '', items: [{ productId: '', quantity: '1', unitPrice: '' }] });
    setView('new-po');
  };

  const addPoItem = () => setPoForm(p => ({ ...p, items: [...p.items, { productId: '', quantity: '1', unitPrice: '' }] }));
  const removePoItem = (i: number) => setPoForm(p => ({ ...p, items: p.items.filter((_, idx) => idx !== i) }));
  const updatePoItem = (i: number, field: string, val: string) => {
    setPoForm(p => {
      const items = [...p.items];
      items[i] = { ...items[i], [field]: val };
      if (field === 'productId') {
        const prod = products.find(pr => String(pr.id) === val);
        if (prod) items[i].unitPrice = prod.costPrice || prod.price || '';
      }
      return { ...p, items };
    });
  };

  const poTotal = poForm.items.reduce((sum, item) => sum + Number(item.unitPrice) * Number(item.quantity), 0);

  const handleCreatePO = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!poForm.supplierId) { alert('Please select a supplier'); return; }
    if (poForm.items.some(i => !i.productId)) { alert('Please select a product for all line items'); return; }
    setSaving(true);
    try {
      await suppliersApi.createPO({
        supplierId: Number(poForm.supplierId),
        notes: poForm.notes || undefined,
        expectedDeliveryAt: poForm.expectedDeliveryAt || undefined,
        items: poForm.items.map(i => ({ productId: Number(i.productId), quantity: Number(i.quantity), unitPrice: i.unitPrice })),
      });
      if (selected) {
        openProfile(selected);
      }
      setView(selected ? 'profile' : 'list');
    } catch (err: any) { alert(err.message); }
    finally { setSaving(false); }
  };

  const openReceiveModal = (po: any) => {
    const initial: Record<number, number> = {};
    (po.items || []).forEach((item: any) => {
      initial[item.id] = Math.max(0, item.quantity - (item.receivedQuantity ?? 0));
    });
    setReceiveLines(initial);
    setReceivingPO(po);
  };

  const handleReceivePO = async () => {
    if (!receivingPO) return;
    setSaving(true);
    try {
      const lines = (receivingPO.items || []).map((item: any) => ({
        lineItemId: item.id,
        deliveredQuantity: receiveLines[item.id] ?? 0,
      }));
      await suppliersApi.receivePO(receivingPO.id, lines);
      setReceivingPO(null);
      if (selected) openProfile(selected);
    } catch (err: any) { alert(err.message); }
    finally { setSaving(false); }
  };

  const handleMarkOrdered = async (poId: number) => {
    try {
      await suppliersApi.updatePOStatus(poId, 'ordered');
      if (selected) openProfile(selected);
    } catch (err: any) { alert(err.message); }
  };

  const filteredSuppliers = suppliers.filter(s =>
    !search || s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.contactName?.toLowerCase().includes(search.toLowerCase())
  );

  if (view === 'new-po') return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <button onClick={() => setView(selected ? 'profile' : 'list')} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors">
          <ChevronLeft size={18} />
        </button>
        <div>
          <h1 className="page-title dark:text-white flex items-center gap-2"><ShoppingCart size={22} className="text-indigo-600" /> New Purchase Order</h1>
          <p className="page-subtitle dark:text-slate-400">Create a purchase order for restocking</p>
        </div>
      </div>

      <form onSubmit={handleCreatePO} className="space-y-5">
        <div className="card dark:bg-slate-800 dark:border-slate-700/50 space-y-4">
          <h3 className="font-semibold text-slate-900 dark:text-white">Order Details</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label dark:text-slate-300">Supplier *</label>
              <select required value={poForm.supplierId} onChange={e => setPoForm(p => ({ ...p, supplierId: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                <option value="">Select supplier...</option>
                {suppliers.filter(s => s.isActive).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label dark:text-slate-300">Expected Delivery</label>
              <input type="date" value={poForm.expectedDeliveryAt} onChange={e => setPoForm(p => ({ ...p, expectedDeliveryAt: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
            </div>
          </div>
          <div>
            <label className="label dark:text-slate-300">Notes</label>
            <textarea rows={2} value={poForm.notes} onChange={e => setPoForm(p => ({ ...p, notes: e.target.value }))} className="input resize-none dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="Optional delivery instructions..." />
          </div>
        </div>

        <div className="card dark:bg-slate-800 dark:border-slate-700/50">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-900 dark:text-white">Line Items</h3>
            <button type="button" onClick={addPoItem} className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 font-semibold hover:underline">
              <Plus size={12} /> Add Item
            </button>
          </div>
          <div className="space-y-3">
            {poForm.items.map((item, i) => (
              <div key={i} className="flex gap-2 items-start">
                <div className="flex-1 grid grid-cols-5 gap-2">
                  <div className="col-span-2">
                    <select required value={item.productId} onChange={e => updatePoItem(i, 'productId', e.target.value)} className="input text-sm dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                      <option value="">Product...</option>
                      {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <input required type="number" min="1" placeholder="Qty" value={item.quantity} onChange={e => updatePoItem(i, 'quantity', e.target.value)} className="input text-sm dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
                  </div>
                  <div>
                    <input required type="number" step="0.01" placeholder="Unit cost" value={item.unitPrice} onChange={e => updatePoItem(i, 'unitPrice', e.target.value)} className="input text-sm dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
                  </div>
                  <div className="flex items-center justify-end text-sm font-semibold text-slate-700 dark:text-slate-200">
                    {fmt(Number(item.unitPrice) * Number(item.quantity))}
                  </div>
                </div>
                {poForm.items.length > 1 && (
                  <button type="button" onClick={() => removePoItem(i)} className="mt-1.5 p-1 rounded-lg text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-end mt-4 pt-3 border-t border-slate-100 dark:border-slate-700">
            <div className="text-right">
              <div className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">Total</div>
              <div className="text-xl font-bold text-slate-900 dark:text-white">{fmt(poTotal)}</div>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <button type="button" onClick={() => setView(selected ? 'profile' : 'list')} className="flex-1 btn-secondary">Cancel</button>
          <button type="submit" disabled={saving} className="flex-1 btn-primary">{saving ? 'Creating...' : 'Create Purchase Order'}</button>
        </div>
      </form>
    </div>
  );

  if (view === 'profile' && selected) return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => setView('list')} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors">
          <ChevronLeft size={18} />
        </button>
        <div className="flex-1">
          <h1 className="page-title dark:text-white flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center text-blue-700 dark:text-blue-400 font-bold flex-shrink-0">
              {selected.name.charAt(0).toUpperCase()}
            </div>
            {selected.name}
          </h1>
          <p className="page-subtitle dark:text-slate-400">Supplier profile & purchase history</p>
        </div>
        <button onClick={() => openNewPO(selected.id)} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> New PO
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Contact card */}
        <div className="card dark:bg-slate-800 dark:border-slate-700/50">
          <h3 className="font-semibold text-slate-900 dark:text-white mb-3">Contact Details</h3>
          <div className="space-y-2">
            {selected.contactName && <div className="flex items-center gap-2 text-sm"><User size={14} className="text-slate-400" /><span className="text-slate-700 dark:text-slate-200">{selected.contactName}</span></div>}
            {selected.phone && <div className="flex items-center gap-2 text-sm"><Phone size={14} className="text-slate-400" /><span className="text-slate-700 dark:text-slate-200">{selected.phone}</span></div>}
            {selected.email && <div className="flex items-center gap-2 text-sm"><Mail size={14} className="text-slate-400" /><a href={`mailto:${selected.email}`} className="text-indigo-600 dark:text-indigo-400 hover:underline">{selected.email}</a></div>}
            {selected.address && <div className="flex items-center gap-2 text-sm"><MapPin size={14} className="text-slate-400" /><span className="text-slate-700 dark:text-slate-200">{selected.address}</span></div>}
            {selected.notes && <p className="text-xs text-slate-400 dark:text-slate-500 italic mt-2">{selected.notes}</p>}
          </div>
        </div>

        {/* Stats */}
        <div className="card dark:bg-slate-800 dark:border-slate-700/50">
          <h3 className="font-semibold text-slate-900 dark:text-white mb-3">Purchase Stats</h3>
          <div className="space-y-3">
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Total Spend</div>
              <div className="text-2xl font-bold text-slate-900 dark:text-white">{fmt(selected.totalSpend ?? 0)}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Total Orders</div>
              <div className="text-lg font-semibold text-slate-700 dark:text-slate-200">{supplierOrders.length}</div>
            </div>
          </div>
        </div>

        {/* Status breakdown */}
        <div className="card dark:bg-slate-800 dark:border-slate-700/50">
          <h3 className="font-semibold text-slate-900 dark:text-white mb-3">Order Status</h3>
          <div className="space-y-2">
            {(['draft', 'ordered', 'partial', 'received', 'cancelled'] as const).map(status => {
              const count = supplierOrders.filter(po => po.status === status).length;
              if (!count) return null;
              return (
                <div key={status} className="flex items-center justify-between">
                  <span className={clsx('text-xs font-semibold px-2 py-0.5 rounded-full capitalize', PO_STATUS_COLORS[status])}>{status}</span>
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{count}</span>
                </div>
              );
            })}
            {supplierOrders.length === 0 && <p className="text-xs text-slate-400 dark:text-slate-500">No orders yet</p>}
          </div>
        </div>
      </div>

      {/* Receive PO Modal */}
      {receivingPO && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setReceivingPO(null)} />
          <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg animate-fade-in border border-slate-100 dark:border-slate-700 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Package size={16} className="text-emerald-600" /> Receive Delivery
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">{receivingPO.po_number} — enter quantities actually received per line</p>
              </div>
              <button onClick={() => setReceivingPO(null)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"><X size={16} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {(receivingPO.items || []).map((item: any) => {
                const remaining = item.quantity - (item.receivedQuantity ?? 0);
                return (
                  <div key={item.id} className="p-3 rounded-xl border border-slate-100 dark:border-slate-700">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-slate-900 dark:text-white text-sm">{item.productName}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          Ordered: {item.quantity} · Already received: {item.receivedQuantity ?? 0} · Remaining: <span className={clsx('font-semibold', remaining > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400')}>{remaining}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <label className="text-xs text-slate-500 dark:text-slate-400">Received:</label>
                        <input
                          type="number" min="0" max={remaining}
                          value={receiveLines[item.id] ?? 0}
                          onChange={e => setReceiveLines(prev => ({ ...prev, [item.id]: Math.max(0, Math.min(remaining, Number(e.target.value))) }))}
                          disabled={remaining <= 0}
                          className="input w-20 text-center dark:bg-slate-700 dark:border-slate-600 dark:text-white disabled:opacity-40"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-3 px-5 py-4 border-t border-slate-100 dark:border-slate-700">
              <button type="button" onClick={() => setReceivingPO(null)} className="flex-1 btn-secondary">Cancel</button>
              <button type="button" disabled={saving} onClick={handleReceivePO} className="flex-1 btn-primary bg-emerald-600 hover:bg-emerald-700">
                {saving ? 'Receiving...' : 'Confirm Receipt'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Purchase orders */}
      <div className="card dark:bg-slate-800 dark:border-slate-700/50 p-0 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2"><FileText size={16} className="text-indigo-600" /> Purchase Orders</h3>
        </div>
        {ordersLoading ? (
          <div className="flex items-center justify-center h-32"><div className="w-6 h-6 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>
        ) : supplierOrders.length === 0 ? (
          <div className="text-center py-10 text-slate-400 dark:text-slate-500 text-sm">No purchase orders yet</div>
        ) : (
          <div className="divide-y divide-slate-50 dark:divide-slate-700/30">
            {supplierOrders.map(po => (
              <div key={po.id} className="p-4 hover:bg-slate-50 dark:hover:bg-slate-700/20 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-semibold text-slate-900 dark:text-white text-sm">{po.po_number}</span>
                      <span className={clsx('text-xs font-semibold px-2 py-0.5 rounded-full capitalize', PO_STATUS_COLORS[po.status])}>{po.status}</span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {po.ordered_at && <span>Ordered: {fmtDate(po.ordered_at)}</span>}
                      {po.expected_delivery_at && <span>Expected: {fmtDate(po.expected_delivery_at)}</span>}
                      {po.received_at && <span className="text-emerald-600 dark:text-emerald-400">Received: {fmtDate(po.received_at)}</span>}
                      <span>Created: {fmtDate(po.created_at)}</span>
                    </div>
                    {po.items && po.items.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {po.items.slice(0, 3).map((item: any) => (
                          <span key={item.id} className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-md">
                            {item.productName} × {item.quantity}
                          </span>
                        ))}
                        {po.items.length > 3 && <span className="text-xs text-slate-400 dark:text-slate-500">+{po.items.length - 3} more</span>}
                      </div>
                    )}
                    {po.notes && <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 italic">{po.notes}</p>}
                  </div>
                  <div className="flex items-start gap-2 flex-col sm:flex-row sm:items-center">
                    <span className="font-bold text-slate-900 dark:text-white text-sm">{fmt(po.total_amount)}</span>
                    <div className="flex gap-1">
                      {po.status === 'draft' && (
                        <button onClick={() => handleMarkOrdered(po.id)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-xs font-semibold hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors">
                          <Clock size={11} /> Order
                        </button>
                      )}
                      {(po.status === 'ordered' || po.status === 'partial') && (
                        <button onClick={() => openReceiveModal(po)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 text-xs font-semibold hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors">
                          <CheckCircle size={11} /> Receive
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="page-title dark:text-white flex items-center gap-2"><Truck size={24} className="text-indigo-600" /> Suppliers</h1>
          <p className="page-subtitle dark:text-slate-400">{suppliers.filter(s => s.isActive).length} active suppliers</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => openNewPO()} className="btn-secondary flex items-center gap-2"><ShoppingCart size={16} /> New PO</button>
          <button onClick={() => setShowNewSupplier(true)} className="btn-primary flex items-center gap-2"><Plus size={16} /> Add Supplier</button>
        </div>
      </div>

      <div className="max-w-sm">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search suppliers..." className="input dark:bg-slate-800 dark:border-slate-600 dark:text-white dark:placeholder-slate-400" />
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48"><div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : filteredSuppliers.length === 0 ? (
        <div className="text-center py-16 text-slate-400 dark:text-slate-500 text-sm">No suppliers found</div>
      ) : (
        <div className="card dark:bg-slate-800 dark:border-slate-700/50 p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-700/30 border-b border-slate-100 dark:border-slate-700">
                <th className="table-header px-4 py-3 text-left">Supplier</th>
                <th className="table-header px-4 py-3 text-left hidden sm:table-cell">Contact</th>
                <th className="table-header px-4 py-3 text-left hidden md:table-cell">Phone</th>
                <th className="table-header px-4 py-3 text-left hidden lg:table-cell">Location</th>
                <th className="table-header px-4 py-3 text-center">Status</th>
                <th className="table-header px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredSuppliers.map(s => (
                <tr key={s.id} className="border-b border-slate-50 dark:border-slate-700/30 hover:bg-slate-50 dark:hover:bg-slate-700/20 transition-colors cursor-pointer" onClick={() => openProfile(s)}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center text-blue-700 dark:text-blue-400 font-bold text-sm flex-shrink-0">
                        {s.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-semibold text-slate-900 dark:text-white">{s.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400 hidden sm:table-cell">{s.contactName || '—'}</td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400 hidden md:table-cell">{s.phone || '—'}</td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400 hidden lg:table-cell">{s.address || '—'}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={clsx('text-xs font-semibold px-2 py-0.5 rounded-full', s.isActive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400')}>
                      {s.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                    <button onClick={() => openNewPO(s.id)}
                      className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold hover:underline">
                      New PO
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* New Supplier Modal */}
      {showNewSupplier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowNewSupplier(false)} />
          <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md animate-fade-in border border-slate-100 dark:border-slate-700">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
              <h3 className="font-bold text-slate-900 dark:text-white">Add Supplier</h3>
              <button onClick={() => setShowNewSupplier(false)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"><X size={16} /></button>
            </div>
            <form onSubmit={handleCreateSupplier} className="p-5 space-y-4">
              <div>
                <label className="label dark:text-slate-300">Company Name *</label>
                <input required value={supplierForm.name} onChange={e => setSupplierForm(p => ({ ...p, name: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
              </div>
              <div>
                <label className="label dark:text-slate-300">Contact Person</label>
                <input value={supplierForm.contactName} onChange={e => setSupplierForm(p => ({ ...p, contactName: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label dark:text-slate-300">Phone</label>
                  <input value={supplierForm.phone} onChange={e => setSupplierForm(p => ({ ...p, phone: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
                </div>
                <div>
                  <label className="label dark:text-slate-300">Email</label>
                  <input type="email" value={supplierForm.email} onChange={e => setSupplierForm(p => ({ ...p, email: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
                </div>
              </div>
              <div>
                <label className="label dark:text-slate-300">Address / Location</label>
                <input value={supplierForm.address} onChange={e => setSupplierForm(p => ({ ...p, address: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
              </div>
              <div>
                <label className="label dark:text-slate-300">Notes</label>
                <textarea rows={2} value={supplierForm.notes} onChange={e => setSupplierForm(p => ({ ...p, notes: e.target.value }))} className="input resize-none dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowNewSupplier(false)} className="flex-1 btn-secondary">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 btn-primary">{saving ? 'Saving...' : 'Add Supplier'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
