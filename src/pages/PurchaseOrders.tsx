import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { suppliersApi, productsApi } from '../lib/api';
import {
  ShoppingBag, Plus, Search, X, ChevronDown, ChevronUp,
  CheckCircle, Clock, Package, AlertTriangle, Truck, Eye,
  Trash2, Send, ClipboardCheck,
} from 'lucide-react';
import clsx from 'clsx';

const fmt = (v: string | number) => `₵${Number(v).toLocaleString('en-GH', { minimumFractionDigits: 2 })}`;
const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString('en-GH', { dateStyle: 'medium' }) : '—';

const PO_STATUS_COLORS: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  ordered: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  partial: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  received: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  cancelled: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
};

const PO_STATUS_ICONS: Record<string, React.ReactNode> = {
  draft: <Clock size={11} />,
  ordered: <Send size={11} />,
  partial: <Package size={11} />,
  received: <CheckCircle size={11} />,
  cancelled: <X size={11} />,
};

interface POItem {
  id: number;
  productId: number;
  productName: string;
  productSku: string;
  quantity: number;
  receivedQuantity: number;
  unitPrice: string;
  totalPrice: string;
}

interface PO {
  id: number;
  poNumber: string;
  supplierId: number;
  supplierName: string;
  status: string;
  totalAmount: string;
  notes: string | null;
  orderedAt: string | null;
  expectedDeliveryAt: string | null;
  receivedAt: string | null;
  createdAt: string;
  items?: POItem[];
}

export default function PurchaseOrders() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [pos, setPos] = useState<PO[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [expandedItems, setExpandedItems] = useState<Record<number, POItem[]>>({});
  const [itemsLoading, setItemsLoading] = useState<Record<number, boolean>>({});

  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    supplierId: '',
    notes: '',
    expectedDeliveryAt: '',
    items: [{ productId: '', quantity: '1', unitPrice: '' }] as { productId: string; quantity: string; unitPrice: string }[],
  });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [receivingPO, setReceivingPO] = useState<PO | null>(null);
  const [receiveLines, setReceiveLines] = useState<Record<number, number>>({});
  const [receiving, setReceiving] = useState(false);

  const loadPos = useCallback(async () => {
    setLoading(true);
    try {
      const data = await suppliersApi.purchaseOrders();
      setPos(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPos();
    Promise.all([suppliersApi.list(), productsApi.list()]).then(([s, p]) => {
      setSuppliers(s.filter((sup: any) => sup.isActive));
      setProducts(p.filter((pr: any) => pr.isActive));
    });
  }, [loadPos]);

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      const productId = searchParams.get('productId');
      const product = productId ? products.find((p: any) => String(p.id) === productId) : null;
      setCreateForm({
        supplierId: '',
        notes: '',
        expectedDeliveryAt: '',
        items: product
          ? [{ productId: productId!, quantity: String(product.reorderLevel || 10), unitPrice: product.costPrice || '' }]
          : [{ productId: '', quantity: '1', unitPrice: '' }],
      });
      setShowCreate(true);
      navigate('/purchase-orders', { replace: true });
    }
  }, [searchParams, products, navigate]);

  const loadItems = async (po: PO) => {
    if (expandedItems[po.id]) return;
    setItemsLoading(prev => ({ ...prev, [po.id]: true }));
    try {
      const detail = await suppliersApi.getPO(po.id);
      setExpandedItems(prev => ({ ...prev, [po.id]: detail.items ?? [] }));
    } catch {
      showToast('error', 'Failed to load PO line items');
    } finally {
      setItemsLoading(prev => ({ ...prev, [po.id]: false }));
    }
  };

  const toggleExpand = async (po: PO) => {
    if (expandedId === po.id) {
      setExpandedId(null);
    } else {
      setExpandedId(po.id);
      await loadItems(po);
    }
  };

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3500);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.supplierId) { showToast('error', 'Please select a supplier'); return; }
    const validItems = createForm.items.filter(i => i.productId && i.quantity && i.unitPrice);
    if (validItems.length === 0) { showToast('error', 'Add at least one item'); return; }
    setSaving(true);
    try {
      await suppliersApi.createPO({
        supplierId: Number(createForm.supplierId),
        notes: createForm.notes || undefined,
        expectedDeliveryAt: createForm.expectedDeliveryAt || undefined,
        items: validItems.map(i => ({
          productId: Number(i.productId),
          quantity: Number(i.quantity),
          unitPrice: i.unitPrice,
        })),
      });
      setShowCreate(false);
      setCreateForm({ supplierId: '', notes: '', expectedDeliveryAt: '', items: [{ productId: '', quantity: '1', unitPrice: '' }] });
      showToast('success', 'Purchase order created');
      await loadPos();
    } catch (err: any) {
      showToast('error', err.message ?? 'Failed to create PO');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (po: PO, status: string) => {
    try {
      await suppliersApi.updatePOStatus(po.id, status);
      setPos(prev => prev.map(p => p.id === po.id ? { ...p, status } : p));
      showToast('success', `PO marked as ${status}`);
    } catch (err: any) {
      showToast('error', err.message ?? 'Failed to update status');
    }
  };

  const openReceive = async (po: PO) => {
    setReceivingPO(po);
    setReceiveLines({});
    let items: POItem[] = expandedItems[po.id] ?? [];
    if (items.length === 0) {
      setItemsLoading(prev => ({ ...prev, [po.id]: true }));
      try {
        const detail = await suppliersApi.getPO(po.id);
        items = detail.items ?? [];
        setExpandedItems(prev => ({ ...prev, [po.id]: items }));
      } catch {
        showToast('error', 'Failed to load PO items for receiving');
        setReceivingPO(null);
        return;
      } finally {
        setItemsLoading(prev => ({ ...prev, [po.id]: false }));
      }
    }
    const lines: Record<number, number> = {};
    for (const item of items) {
      lines[item.id] = Math.max(0, item.quantity - item.receivedQuantity);
    }
    setReceiveLines(lines);
  };

  const handleReceive = async () => {
    if (!receivingPO) return;
    setReceiving(true);
    try {
      const lines = Object.entries(receiveLines).map(([lineItemId, deliveredQuantity]) => ({
        lineItemId: Number(lineItemId),
        deliveredQuantity: Number(deliveredQuantity),
      }));
      const updated = await suppliersApi.receivePO(receivingPO.id, lines);
      setPos(prev => prev.map(p => p.id === receivingPO.id ? { ...p, status: updated.status, receivedAt: updated.receivedAt } : p));
      setExpandedItems(prev => { const n = { ...prev }; delete n[receivingPO.id]; return n; });
      setReceivingPO(null);
      showToast('success', 'Stock received and inventory updated');
      await loadPos();
    } catch (err: any) {
      showToast('error', err.message ?? 'Failed to receive PO');
    } finally {
      setReceiving(false);
    }
  };

  const addItem = () => setCreateForm(f => ({ ...f, items: [...f.items, { productId: '', quantity: '1', unitPrice: '' }] }));
  const removeItem = (i: number) => setCreateForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }));
  const updateItem = (i: number, field: string, value: string) => {
    setCreateForm(f => {
      const items = [...f.items];
      items[i] = { ...items[i], [field]: value };
      if (field === 'productId') {
        const product = products.find((p: any) => String(p.id) === value);
        if (product) items[i].unitPrice = String(product.costPrice || '');
      }
      return { ...f, items };
    });
  };

  const total = createForm.items.reduce((sum, i) => sum + (Number(i.unitPrice || 0) * Number(i.quantity || 0)), 0);

  const filtered = pos.filter(po => {
    const matchesSearch = !search || po.poNumber.toLowerCase().includes(search.toLowerCase()) || po.supplierName?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = !filterStatus || po.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const currentItems = receivingPO ? (expandedItems[receivingPO.id] ?? []) : [];

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className={clsx(
          'fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium animate-fade-in',
          toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
        )}>
          {toast.type === 'success' ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="page-title dark:text-white">Purchase Orders</h1>
          <p className="page-subtitle dark:text-slate-400">{pos.length} total orders · {pos.filter(p => p.status === 'draft').length} draft · {pos.filter(p => ['ordered', 'partial'].includes(p.status)).length} pending delivery</p>
        </div>
        <button onClick={() => { setCreateForm({ supplierId: '', notes: '', expectedDeliveryAt: '', items: [{ productId: '', quantity: '1', unitPrice: '' }] }); setShowCreate(true); }} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> New PO
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Draft', count: pos.filter(p => p.status === 'draft').length, color: 'border-slate-400 text-slate-600 dark:text-slate-300' },
          { label: 'Ordered', count: pos.filter(p => p.status === 'ordered').length, color: 'border-blue-400 text-blue-600 dark:text-blue-400' },
          { label: 'Partial', count: pos.filter(p => p.status === 'partial').length, color: 'border-amber-400 text-amber-600 dark:text-amber-400' },
          { label: 'Received', count: pos.filter(p => p.status === 'received').length, color: 'border-emerald-400 text-emerald-600 dark:text-emerald-400' },
        ].map(s => (
          <button key={s.label} onClick={() => setFilterStatus(filterStatus === s.label.toLowerCase() ? '' : s.label.toLowerCase())}
            className={clsx('card dark:bg-slate-800 dark:border-slate-700/50 p-4 border-l-4 text-left hover:shadow-md transition-shadow', s.color, filterStatus === s.label.toLowerCase() && 'ring-2 ring-indigo-400')}>
            <div className="text-xs font-medium mb-1 opacity-80">{s.label}</div>
            <div className={clsx('text-2xl font-bold', s.color.split(' ')[1])}>{s.count}</div>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search PO number or supplier..." className="input pl-9 dark:bg-slate-800 dark:border-slate-600 dark:text-white dark:placeholder-slate-400" />
        </div>
        {filterStatus && (
          <button onClick={() => setFilterStatus('')} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 text-sm font-medium hover:bg-indigo-200 dark:hover:bg-indigo-900/50 transition-colors">
            <X size={13} /> Clear: {filterStatus}
          </button>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center h-48"><div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="card dark:bg-slate-800 dark:border-slate-700/50 text-center py-16">
          <ShoppingBag size={40} className="mx-auto mb-4 text-slate-300 dark:text-slate-600" />
          <p className="text-slate-500 dark:text-slate-400 font-medium">No purchase orders found</p>
          <p className="text-slate-400 dark:text-slate-500 text-sm mt-1">Create a PO to start ordering from suppliers</p>
          <button onClick={() => setShowCreate(true)} className="btn-primary mt-4 inline-flex items-center gap-2">
            <Plus size={15} /> Create First PO
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(po => (
            <div key={po.id} className="card dark:bg-slate-800 dark:border-slate-700/50 p-0 overflow-hidden">
              <div className="flex items-center gap-4 px-5 py-4">
                {/* PO Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-900 dark:text-white text-sm">{po.poNumber}</span>
                    <span className={clsx('inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full', PO_STATUS_COLORS[po.status])}>
                      {PO_STATUS_ICONS[po.status]}{po.status.charAt(0).toUpperCase() + po.status.slice(1)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    <span className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                      <Truck size={11} /> {po.supplierName}
                    </span>
                    <span className="text-xs text-slate-400 dark:text-slate-500">{fmtDate(po.createdAt)}</span>
                    {po.expectedDeliveryAt && (
                      <span className="text-xs text-slate-400 dark:text-slate-500">Expected: {fmtDate(po.expectedDeliveryAt)}</span>
                    )}
                    {po.receivedAt && (
                      <span className="text-xs text-emerald-600 dark:text-emerald-400">Received: {fmtDate(po.receivedAt)}</span>
                    )}
                  </div>
                </div>

                {/* Amount */}
                <div className="text-right flex-shrink-0">
                  <div className="font-bold text-slate-900 dark:text-white">{fmt(po.totalAmount)}</div>
                  <div className="text-xs text-slate-400 dark:text-slate-500">Total</div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {po.status === 'draft' && (
                    <>
                      <button onClick={() => handleStatusChange(po, 'ordered')}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-xs font-semibold hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
                        title="Mark as Ordered">
                        <Send size={12} /> Order
                      </button>
                      <button onClick={() => handleStatusChange(po, 'cancelled')}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-xs font-semibold hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
                        title="Cancel PO">
                        <Trash2 size={12} />
                      </button>
                    </>
                  )}
                  {(po.status === 'ordered' || po.status === 'partial') && (
                    <button onClick={() => openReceive(po)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 text-xs font-semibold hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors">
                      <ClipboardCheck size={12} /> Receive
                    </button>
                  )}
                  <button onClick={() => toggleExpand(po)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors">
                    <Eye size={12} />
                    {expandedId === po.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </button>
                </div>
              </div>

              {/* Expanded items */}
              {expandedId === po.id && (
                <div className="border-t border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-700/20 px-5 py-4">
                  {itemsLoading[po.id] ? (
                    <div className="flex items-center gap-2 text-sm text-slate-400"><div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" /> Loading items...</div>
                  ) : (expandedItems[po.id] ?? []).length === 0 ? (
                    <p className="text-sm text-slate-400 dark:text-slate-500">No items found</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">
                            <th className="text-left pb-2">Product</th>
                            <th className="text-left pb-2">SKU</th>
                            <th className="text-right pb-2">Ordered</th>
                            <th className="text-right pb-2">Received</th>
                            <th className="text-right pb-2">Remaining</th>
                            <th className="text-right pb-2">Unit Price</th>
                            <th className="text-right pb-2">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                          {(expandedItems[po.id] ?? []).map((item: POItem) => (
                            <tr key={item.id} className="text-slate-700 dark:text-slate-200">
                              <td className="py-2 font-medium">{item.productName}</td>
                              <td className="py-2 font-mono text-slate-400 dark:text-slate-500">{item.productSku}</td>
                              <td className="py-2 text-right">{item.quantity}</td>
                              <td className={clsx('py-2 text-right font-semibold', item.receivedQuantity > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400')}>{item.receivedQuantity}</td>
                              <td className={clsx('py-2 text-right', (item.quantity - item.receivedQuantity) > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400 dark:text-slate-500')}>
                                {item.quantity - item.receivedQuantity}
                              </td>
                              <td className="py-2 text-right">{fmt(item.unitPrice)}</td>
                              <td className="py-2 text-right font-semibold">{fmt(item.totalPrice)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t border-slate-200 dark:border-slate-600 font-bold text-slate-800 dark:text-white">
                            <td colSpan={6} className="pt-2 text-right">Total</td>
                            <td className="pt-2 text-right">{fmt(po.totalAmount)}</td>
                          </tr>
                        </tfoot>
                      </table>
                      {po.notes && (
                        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-700 rounded-lg px-3 py-2 border border-slate-100 dark:border-slate-600">
                          <span className="font-semibold">Notes: </span>{po.notes}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create PO Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowCreate(false)} />
          <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-slate-100 dark:border-slate-700 animate-fade-in">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex-shrink-0">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <ShoppingBag size={18} className="text-indigo-500" /> New Purchase Order
              </h3>
              <button onClick={() => setShowCreate(false)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"><X size={18} /></button>
            </div>

            <form onSubmit={handleCreate} className="flex flex-col flex-1 overflow-hidden">
              <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
                {/* Supplier */}
                <div>
                  <label className="label dark:text-slate-300">Supplier <span className="text-red-500">*</span></label>
                  <select value={createForm.supplierId} onChange={e => setCreateForm(f => ({ ...f, supplierId: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" required>
                    <option value="">Select supplier...</option>
                    {suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label dark:text-slate-300">Expected Delivery</label>
                    <input type="date" value={createForm.expectedDeliveryAt} onChange={e => setCreateForm(f => ({ ...f, expectedDeliveryAt: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
                  </div>
                  <div>
                    <label className="label dark:text-slate-300">Notes</label>
                    <input type="text" value={createForm.notes} onChange={e => setCreateForm(f => ({ ...f, notes: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="Optional notes..." />
                  </div>
                </div>

                {/* Items */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="label mb-0 dark:text-slate-300">Items <span className="text-red-500">*</span></label>
                    <button type="button" onClick={addItem} className="flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300">
                      <Plus size={13} /> Add Item
                    </button>
                  </div>
                  <div className="space-y-2">
                    {createForm.items.map((item, i) => (
                      <div key={i} className="grid grid-cols-[1fr_80px_100px_32px] gap-2 items-start">
                        <select value={item.productId} onChange={e => updateItem(i, 'productId', e.target.value)}
                          className="input text-sm dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                          <option value="">Select product...</option>
                          {products.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        <input type="number" min="1" value={item.quantity} onChange={e => updateItem(i, 'quantity', e.target.value)}
                          placeholder="Qty" className="input text-sm text-right dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
                        <input type="number" min="0" step="0.01" value={item.unitPrice} onChange={e => updateItem(i, 'unitPrice', e.target.value)}
                          placeholder="Unit price" className="input text-sm text-right dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
                        <button type="button" onClick={() => removeItem(i)} disabled={createForm.items.length === 1}
                          className="w-8 h-8 mt-1 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                  {/* Column headers */}
                  <div className="grid grid-cols-[1fr_80px_100px_32px] gap-2 mt-1">
                    <div className="text-xs text-slate-400 dark:text-slate-500 px-1">Product</div>
                    <div className="text-xs text-slate-400 dark:text-slate-500 text-right px-1">Quantity</div>
                    <div className="text-xs text-slate-400 dark:text-slate-500 text-right px-1">Unit Price (₵)</div>
                    <div />
                  </div>
                </div>

                {/* Total */}
                <div className="flex justify-end pt-2 border-t border-slate-100 dark:border-slate-700">
                  <div className="text-right">
                    <div className="text-xs text-slate-400 dark:text-slate-500">Order Total</div>
                    <div className="text-xl font-bold text-slate-900 dark:text-white">{fmt(total)}</div>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 px-6 py-4 border-t border-slate-100 dark:border-slate-700 flex-shrink-0">
                <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2">
                  {saving ? <div className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin" /> : <ShoppingBag size={15} />}
                  {saving ? 'Creating...' : 'Create PO'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Receive PO Modal */}
      {receivingPO && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setReceivingPO(null)} />
          <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col border border-slate-100 dark:border-slate-700 animate-fade-in">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex-shrink-0">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <ClipboardCheck size={18} className="text-emerald-500" /> Receive Stock
              </h3>
              <button onClick={() => setReceivingPO(null)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"><X size={18} /></button>
            </div>

            <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
              <div className="bg-slate-50 dark:bg-slate-700/30 rounded-xl px-4 py-3">
                <div className="text-sm font-semibold text-slate-900 dark:text-white">{receivingPO.poNumber}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Supplier: {receivingPO.supplierName}</div>
              </div>

              <p className="text-xs text-slate-500 dark:text-slate-400">Enter the quantity delivered for each item. Leave 0 for items not yet received.</p>

              {currentItems.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-slate-400"><div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" /> Loading...</div>
              ) : (
                <div className="space-y-3">
                  {currentItems.map((item: POItem) => {
                    const remaining = item.quantity - item.receivedQuantity;
                    return (
                      <div key={item.id} className="bg-slate-50 dark:bg-slate-700/30 rounded-xl p-3">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div>
                            <div className="text-sm font-semibold text-slate-900 dark:text-white">{item.productName}</div>
                            <div className="text-xs text-slate-400 dark:text-slate-500 font-mono">{item.productSku}</div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <div className="text-xs text-slate-500 dark:text-slate-400">Ordered: {item.quantity} · Received so far: <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{item.receivedQuantity}</span></div>
                            <div className="text-xs text-amber-600 dark:text-amber-400 font-medium">Remaining: {remaining}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-slate-500 dark:text-slate-400 flex-shrink-0">Deliver now:</label>
                          <input
                            type="number" min="0" max={remaining}
                            value={receiveLines[item.id] ?? 0}
                            onChange={e => setReceiveLines(prev => ({ ...prev, [item.id]: Number(e.target.value) }))}
                            className="input text-sm w-28 text-right dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                          />
                          <button type="button" onClick={() => setReceiveLines(prev => ({ ...prev, [item.id]: remaining }))}
                            className="text-xs px-2 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 font-semibold hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors flex-shrink-0">
                            All ({remaining})
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex gap-3 px-6 py-4 border-t border-slate-100 dark:border-slate-700 flex-shrink-0">
              <button onClick={() => setReceivingPO(null)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={handleReceive} disabled={receiving} className="btn-primary flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700">
                {receiving ? <div className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin" /> : <ClipboardCheck size={15} />}
                {receiving ? 'Receiving...' : 'Confirm Receipt'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
