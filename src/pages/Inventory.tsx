import { useEffect, useState } from 'react';
import { inventoryApi, productsApi } from '../lib/api';
import { Package, AlertTriangle, TrendingDown, ArrowUp, ArrowDown, RotateCcw, Plus } from 'lucide-react';
import clsx from 'clsx';

const php = (v: string | number) => `₱${Number(v).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;

export default function Inventory() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAdjust, setShowAdjust] = useState<any>(null);
  const [adjustForm, setAdjustForm] = useState({ type: 'in', quantity: '1', reason: '' });
  const [saving, setSaving] = useState(false);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [categories, setCategories] = useState<any[]>([]);
  const [productForm, setProductForm] = useState({ categoryId: '', name: '', sku: '', price: '', costPrice: '', unit: 'piece', description: '' });

  const load = () => {
    setLoading(true);
    inventoryApi.list().then(setItems).finally(() => setLoading(false));
  };

  useEffect(() => { load(); productsApi.categories().then(setCategories); }, []);

  const filtered = items.filter(i => !search || i.productName?.toLowerCase().includes(search.toLowerCase()) || i.productSku?.toLowerCase().includes(search.toLowerCase()));
  const lowStock = items.filter(i => i.quantityInStock <= i.reorderLevel);

  const handleAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await inventoryApi.adjust({ inventoryItemId: showAdjust.id, type: adjustForm.type, quantity: Number(adjustForm.quantity), reason: adjustForm.reason });
      setItems(prev => prev.map(item => {
        if (item.id !== showAdjust.id) return item;
        const newQty = adjustForm.type === 'in' ? item.quantityInStock + Number(adjustForm.quantity) : adjustForm.type === 'out' ? item.quantityInStock - Number(adjustForm.quantity) : Number(adjustForm.quantity);
        return { ...item, quantityInStock: newQty };
      }));
      setShowAdjust(null);
    } catch (err: any) { alert(err.message); }
    finally { setSaving(false); }
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await productsApi.create({ ...productForm, categoryId: productForm.categoryId ? Number(productForm.categoryId) : undefined });
      load();
      setShowAddProduct(false);
      setProductForm({ categoryId: '', name: '', sku: '', price: '', costPrice: '', unit: 'piece', description: '' });
    } catch (err: any) { alert(err.message); }
    finally { setSaving(false); }
  };

  const stockColor = (qty: number, reorder: number) => {
    if (qty === 0) return 'text-red-600 dark:text-red-400 font-bold';
    if (qty <= reorder) return 'text-amber-600 dark:text-amber-400 font-semibold';
    return 'text-slate-900 dark:text-white';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="page-title dark:text-white flex items-center gap-2"><Package size={24} className="text-indigo-600" /> Inventory</h1>
          <p className="page-subtitle dark:text-slate-400">{items.length} products tracked · {lowStock.length} low stock</p>
        </div>
        <button onClick={() => setShowAddProduct(true)} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Add Product
        </button>
      </div>

      {lowStock.length > 0 && (
        <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl">
          <AlertTriangle size={18} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-amber-800 dark:text-amber-300 text-sm">{lowStock.length} item{lowStock.length > 1 ? 's' : ''} at or below reorder level</div>
            <div className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">{lowStock.map(i => i.productName).join(', ')}</div>
          </div>
        </div>
      )}

      <div>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by product name or SKU..." className="input max-w-sm dark:bg-slate-800 dark:border-slate-600 dark:text-white dark:placeholder-slate-400" />
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48"><div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="card dark:bg-slate-800 dark:border-slate-700/50 overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-700/30 border-b border-slate-100 dark:border-slate-700">
                  <th className="table-header px-4 py-3 text-left">Product</th>
                  <th className="table-header px-4 py-3 text-left">SKU</th>
                  <th className="table-header px-4 py-3 text-left">Category</th>
                  <th className="table-header px-4 py-3 text-right">In Stock</th>
                  <th className="table-header px-4 py-3 text-right">Reorder At</th>
                  <th className="table-header px-4 py-3 text-right">Unit Price</th>
                  <th className="table-header px-4 py-3 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-12 text-slate-400 dark:text-slate-500">No inventory items found</td></tr>
                ) : filtered.map(item => (
                  <tr key={item.id} className="border-b border-slate-50 dark:border-slate-700/30 hover:bg-slate-50 dark:hover:bg-slate-700/20 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{item.productName}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500 dark:text-slate-400">{item.productSku}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{item.categoryName || '—'}</td>
                    <td className={clsx('px-4 py-3 text-right', stockColor(item.quantityInStock, item.reorderLevel))}>
                      <span className="flex items-center justify-end gap-1">
                        {item.quantityInStock <= item.reorderLevel && item.quantityInStock > 0 && <TrendingDown size={12} className="text-amber-500" />}
                        {item.quantityInStock === 0 && <AlertTriangle size={12} className="text-red-500" />}
                        {item.quantityInStock} {item.productUnit}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-500 dark:text-slate-400">{item.reorderLevel}</td>
                    <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-200">{php(item.productPrice)}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => { setShowAdjust(item); setAdjustForm({ type: 'in', quantity: '1', reason: '' }); }}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 text-xs font-semibold hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors">
                        <RotateCcw size={11} /> Adjust
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Adjust Stock Modal */}
      {showAdjust && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowAdjust(null)} />
          <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm animate-fade-in border border-slate-100 dark:border-slate-700">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white">Adjust Stock</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">{showAdjust.productName}</p>
              </div>
              <div className="text-lg font-bold text-indigo-600 dark:text-indigo-400">{showAdjust.quantityInStock} on hand</div>
            </div>
            <form onSubmit={handleAdjust} className="p-5 space-y-4">
              <div>
                <label className="label dark:text-slate-300">Movement Type</label>
                <div className="flex gap-2">
                  {[{ v: 'in', l: 'Stock In', icon: <ArrowUp size={14} /> }, { v: 'out', l: 'Stock Out', icon: <ArrowDown size={14} /> }, { v: 'adjustment', l: 'Set Qty', icon: <RotateCcw size={14} /> }].map(opt => (
                    <button type="button" key={opt.v} onClick={() => setAdjustForm(p => ({ ...p, type: opt.v }))}
                      className={clsx('flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-semibold border transition-all', adjustForm.type === opt.v ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600')}>
                      {opt.icon}{opt.l}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label dark:text-slate-300">Quantity *</label>
                <input required type="number" min="1" value={adjustForm.quantity} onChange={e => setAdjustForm(p => ({ ...p, quantity: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
              </div>
              <div>
                <label className="label dark:text-slate-300">Reason</label>
                <input value={adjustForm.reason} onChange={e => setAdjustForm(p => ({ ...p, reason: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="e.g. Restock, Damaged, etc." />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowAdjust(null)} className="flex-1 btn-secondary">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 btn-primary">{saving ? 'Saving...' : 'Apply'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Product Modal */}
      {showAddProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowAddProduct(false)} />
          <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md animate-fade-in border border-slate-100 dark:border-slate-700 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700 sticky top-0 bg-white dark:bg-slate-800">
              <h3 className="font-bold text-slate-900 dark:text-white">Add Product</h3>
              <button onClick={() => setShowAddProduct(false)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700">✕</button>
            </div>
            <form onSubmit={handleAddProduct} className="p-5 space-y-4">
              <div>
                <label className="label dark:text-slate-300">Product Name *</label>
                <input required value={productForm.name} onChange={e => setProductForm(p => ({ ...p, name: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label dark:text-slate-300">SKU *</label>
                  <input required value={productForm.sku} onChange={e => setProductForm(p => ({ ...p, sku: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="e.g. BK-001" />
                </div>
                <div>
                  <label className="label dark:text-slate-300">Unit</label>
                  <select value={productForm.unit} onChange={e => setProductForm(p => ({ ...p, unit: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                    {['piece', 'box', 'ream', 'set', 'pack', 'bottle', 'roll'].map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="label dark:text-slate-300">Category</label>
                <select value={productForm.categoryId} onChange={e => setProductForm(p => ({ ...p, categoryId: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                  <option value="">None</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label dark:text-slate-300">Selling Price *</label>
                  <input required type="number" step="0.01" value={productForm.price} onChange={e => setProductForm(p => ({ ...p, price: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="0.00" />
                </div>
                <div>
                  <label className="label dark:text-slate-300">Cost Price</label>
                  <input type="number" step="0.01" value={productForm.costPrice} onChange={e => setProductForm(p => ({ ...p, costPrice: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="0.00" />
                </div>
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowAddProduct(false)} className="flex-1 btn-secondary">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 btn-primary">{saving ? 'Adding...' : 'Add Product'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
