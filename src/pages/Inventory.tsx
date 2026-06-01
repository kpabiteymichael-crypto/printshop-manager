import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { inventoryApi, productsApi, suppliersApi, posApi } from '../lib/api';
import {
  Package, AlertTriangle, TrendingDown, ArrowUp, ArrowDown, RotateCcw,
  Plus, Search, History, ChevronLeft, ChevronRight, X, Edit2, DollarSign,
  ClipboardList, Barcode, Camera, CheckCircle, AlertCircle, Trash2, ScanLine,
} from 'lucide-react';
import clsx from 'clsx';

const fmt = (v: string | number) => `₵${Number(v).toLocaleString('en-GH', { minimumFractionDigits: 2 })}`;
const fmtDate = (d: string) => new Date(d).toLocaleString('en-GH', { dateStyle: 'medium', timeStyle: 'short' });

const STOCK_OUT_REASONS = ['Damaged', 'Expired', 'Lost', 'Sample/Demo', 'Internal Use', 'Write-off', 'Other'];
const UNITS = ['piece', 'box', 'ream', 'set', 'pack', 'bottle', 'roll', 'book'];

type Tab = 'list' | 'history' | 'stocktake';

type StocktakeEntry = {
  inventoryItemId: number;
  productName: string;
  productSku: string;
  currentQty: number;
  productUnit: string;
  countedQty: string;
};

export default function Inventory() {
  const navigate = useNavigate();
  const [data, setData] = useState<{ items: any[]; totalValue: number; lowStockCount: number; outOfStockCount: number }>({ items: [], totalValue: 0, lowStockCount: 0, outOfStockCount: 0 });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('list');
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStock, setFilterStock] = useState<'' | 'low' | 'out'>('');
  const [categories, setCategories] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);

  const [showStockIn, setShowStockIn] = useState<any>(null);
  const [showStockOut, setShowStockOut] = useState<any>(null);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [showEditProduct, setShowEditProduct] = useState<any>(null);
  const [showHistory, setShowHistory] = useState<any>(null);

  const [stockInForm, setStockInForm] = useState({ quantity: '1', costPrice: '', supplierId: '', invoiceRef: '', notes: '' });
  const [stockOutForm, setStockOutForm] = useState({ quantity: '1', reason: 'Damaged', notes: '' });
  const [productForm, setProductForm] = useState({ categoryId: '', name: '', sku: '', price: '', costPrice: '', unit: 'piece', description: '', reorderLevel: '10' });
  const [saving, setSaving] = useState(false);

  // ─── Barcode scanner state ──────────────────────────────────────────────────
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [barcodeScanMode, setBarcodeScanMode] = useState<'in' | 'out' | 'adjust' | 'stocktake'>('in');
  const [barcodeFlash, setBarcodeFlash] = useState<'success' | 'error' | null>(null);
  const [barcodeMsg, setBarcodeMsg] = useState('');
  const [barcodeLoading, setBarcodeLoading] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraSupported, setCameraSupported] = useState<boolean | null>(null);
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const drawerBarcodeInputRef = useRef<HTMLInputElement>(null);
  const drawerStockOutBarcodeInputRef = useRef<HTMLInputElement>(null);
  const drawerAdjustBarcodeInputRef = useRef<HTMLInputElement>(null);
  const stocktakeScanInputRef = useRef<HTMLInputElement>(null);
  const stocktakeCountedQtyRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const cameraRafRef = useRef<number>(0);

  const [showStockAdjust, setShowStockAdjust] = useState<any>(null);
  const [stockAdjustForm, setStockAdjustForm] = useState({ newQuantity: '', reason: '', notes: '' });

  const [history, setHistory] = useState<{ movements: any[]; total: number; page: number; limit: number }>({ movements: [], total: 0, page: 1, limit: 20 });
  const [historyLoading, setHistoryLoading] = useState(false);

  const [globalHistory, setGlobalHistory] = useState<{ movements: any[]; total: number; page: number; limit: number }>({ movements: [], total: 0, page: 1, limit: 20 });
  const [globalHistoryLoading, setGlobalHistoryLoading] = useState(false);
  const [globalHistoryType, setGlobalHistoryType] = useState('');

  // ─── Stocktake state ─────────────────────────────────────────────────────────
  const [stocktakeItems, setStocktakeItems] = useState<StocktakeEntry[]>(() => {
    try {
      const saved = localStorage.getItem('ps_stocktake_items');
      return saved ? (JSON.parse(saved) as StocktakeEntry[]) : [];
    } catch { return []; }
  });
  const [stocktakeSearch, setStocktakeSearch] = useState('');
  const [stocktakeReason, setStocktakeReason] = useState(() => {
    try { return localStorage.getItem('ps_stocktake_reason') || 'Physical stocktake'; }
    catch { return 'Physical stocktake'; }
  });
  const [stocktakeCommitting, setStocktakeCommitting] = useState(false);
  const [stocktakeDone, setStocktakeDone] = useState<{ committed: number; errors: number } | null>(null);
  const [stocktakeSearchOpen, setStocktakeSearchOpen] = useState(false);
  const stocktakeSearchRef = useRef<HTMLInputElement>(null);
  const [stayInScanMode, setStayInScanMode] = useState(true);

  // ─── Persist stocktake session to localStorage ───────────────────────────────
  useEffect(() => {
    localStorage.setItem('ps_stocktake_items', JSON.stringify(stocktakeItems));
  }, [stocktakeItems]);

  useEffect(() => {
    localStorage.setItem('ps_stocktake_reason', stocktakeReason);
  }, [stocktakeReason]);

  // ─── Barcode lookup ─────────────────────────────────────────────────────────
  // Opens stock-in or stock-out drawer for the scanned SKU.
  // fromDrawer=true means we're switching products while the drawer is already open.
  // mode overrides barcodeScanMode when called from a drawer context.
  const handleBarcodeInput = useCallback(async (sku: string, fromDrawer = false, mode?: 'in' | 'out' | 'adjust' | 'stocktake') => {
    if (!sku.trim() || barcodeLoading) return;
    setBarcodeLoading(true);
    setBarcodeFlash(null);
    setBarcodeMsg('');
    // Capture the effective mode at call time (avoid stale closure on barcodeScanMode)
    const effectiveMode = mode ?? barcodeScanMode;
    try {
      const product = await posApi.barcodeSearch(sku.trim());
      const invItem = data.items.find(
        i => i.productSku === product.sku || i.productId === product.id
      );
      if (!invItem) {
        setBarcodeFlash('error');
        setBarcodeMsg(`"${product.name}" has no inventory record`);
        setTimeout(() => { setBarcodeFlash(null); setBarcodeMsg(''); }, 3000);
        return;
      }

      // ── Stocktake mode: add to count list (or focus existing row) ──────────
      if (effectiveMode === 'stocktake') {
        const alreadyInList = stocktakeItems.find(e => e.inventoryItemId === invItem.id);
        if (alreadyInList) {
          setBarcodeFlash('success');
          setBarcodeMsg(`${product.name} already in list — jumped to row`);
          setTimeout(() => {
            const ref = stocktakeCountedQtyRefs.current[invItem.id];
            if (ref) { ref.focus(); ref.select(); }
            setBarcodeFlash(null); setBarcodeMsg('');
            if (stayInScanMode) {
              setTimeout(() => {
                if (stocktakeScanInputRef.current) { stocktakeScanInputRef.current.focus(); }
              }, 800);
            }
          }, 300);
        } else {
          setBarcodeFlash('success');
          setBarcodeMsg(`Added: ${product.name}`);
          setStocktakeItems(prev => [...prev, {
            inventoryItemId: invItem.id,
            productName: invItem.productName,
            productSku: invItem.productSku,
            currentQty: invItem.quantityInStock,
            productUnit: invItem.productUnit,
            countedQty: String(invItem.quantityInStock),
          }]);
          setTimeout(() => {
            const ref = stocktakeCountedQtyRefs.current[invItem.id];
            if (ref) { ref.focus(); ref.select(); }
            setBarcodeFlash(null); setBarcodeMsg('');
            if (stayInScanMode) {
              setTimeout(() => {
                if (stocktakeScanInputRef.current) { stocktakeScanInputRef.current.focus(); }
              }, 800);
            }
          }, 300);
        }
        if (barcodeInputRef.current) barcodeInputRef.current.value = '';
        if (stocktakeScanInputRef.current) stocktakeScanInputRef.current.value = '';
        return;
      }

      setBarcodeFlash('success');
      setBarcodeMsg(`Found: ${product.name}`);
      if (fromDrawer) {
        // Stay in drawer, just swap the item
        if (effectiveMode === 'out') {
          setShowStockOut(invItem);
          setStockOutForm({ quantity: '1', reason: 'Damaged', notes: '' });
          if (drawerStockOutBarcodeInputRef.current) drawerStockOutBarcodeInputRef.current.value = '';
        } else if (effectiveMode === 'adjust') {
          setShowStockAdjust(invItem);
          setStockAdjustForm({ newQuantity: String(invItem.quantityInStock), reason: '', notes: '' });
          if (drawerAdjustBarcodeInputRef.current) drawerAdjustBarcodeInputRef.current.value = '';
        } else {
          setShowStockIn(invItem);
          setStockInForm(f => ({ ...f, costPrice: invItem.productCostPrice || '' }));
          if (drawerBarcodeInputRef.current) drawerBarcodeInputRef.current.value = '';
        }
        setTimeout(() => { setBarcodeFlash(null); setBarcodeMsg(''); }, 2000);
      } else {
        setTimeout(() => {
          stopCamera();
          setShowBarcodeScanner(false);
          setBarcodeFlash(null);
          setBarcodeMsg('');
          if (effectiveMode === 'out') {
            setShowStockOut(invItem);
            setStockOutForm({ quantity: '1', reason: 'Damaged', notes: '' });
          } else if (effectiveMode === 'adjust') {
            setShowStockAdjust(invItem);
            setStockAdjustForm({ newQuantity: String(invItem.quantityInStock), reason: '', notes: '' });
          } else {
            setShowStockIn(invItem);
            setStockInForm({ quantity: '1', costPrice: invItem.productCostPrice || '', supplierId: '', invoiceRef: '', notes: '' });
          }
        }, 600);
      }
    } catch {
      setBarcodeFlash('error');
      setBarcodeMsg(`Barcode "${sku}" not found`);
      setTimeout(() => { setBarcodeFlash(null); setBarcodeMsg(''); }, 3000);
    } finally {
      setBarcodeLoading(false);
      if (barcodeInputRef.current) barcodeInputRef.current.value = '';
    }
  }, [barcodeLoading, barcodeScanMode, data.items, stocktakeItems, stayInScanMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Camera scanning (BarcodeDetector API) ──────────────────────────────────
  const stopCamera = useCallback(() => {
    cancelAnimationFrame(cameraRafRef.current);
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach(t => t.stop());
      cameraStreamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  const startCamera = useCallback(async () => {
    const BarcodeDetectorClass = (window as any).BarcodeDetector;
    const supported = typeof BarcodeDetectorClass !== 'undefined' &&
      'mediaDevices' in navigator && 'getUserMedia' in navigator.mediaDevices;
    setCameraSupported(supported);
    if (!supported) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      cameraStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);

      const detector = new BarcodeDetectorClass({
        formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'qr_code', 'upc_a', 'upc_e'],
      });

      let lastScan = '';
      const detect = async () => {
        if (!videoRef.current || !cameraStreamRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          if (codes.length > 0) {
            const val = codes[0].rawValue;
            if (val && val !== lastScan) {
              lastScan = val;
              handleBarcodeInput(val);
            }
          }
        } catch { /* detection frame error — continue */ }
        cameraRafRef.current = requestAnimationFrame(detect);
      };
      cameraRafRef.current = requestAnimationFrame(detect);
    } catch {
      setBarcodeFlash('error');
      setBarcodeMsg('Camera access denied. Check browser permissions.');
      setTimeout(() => { setBarcodeFlash(null); setBarcodeMsg(''); }, 4000);
    }
  }, [handleBarcodeInput]);

  // Stop camera when scanner modal closes
  useEffect(() => {
    if (!showBarcodeScanner) { stopCamera(); }
  }, [showBarcodeScanner, stopCamera]);

  // Auto-focus barcode input when scanner modal opens
  useEffect(() => {
    if (showBarcodeScanner) {
      // Check BarcodeDetector support for UI hint
      const supported = typeof (window as any).BarcodeDetector !== 'undefined' &&
        'mediaDevices' in navigator;
      setCameraSupported(supported);
      setTimeout(() => barcodeInputRef.current?.focus(), 50);
    }
  }, [showBarcodeScanner]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (filterCategory) params.category = Number(filterCategory);
      if (filterStock === 'low') params.lowStock = true;
      if (filterStock === 'out') params.outOfStock = true;
      const result = await inventoryApi.list(params);
      setData(result);
    } finally {
      setLoading(false);
    }
  }, [filterCategory, filterStock]);

  useEffect(() => {
    load();
    Promise.all([productsApi.categories(), suppliersApi.list()]).then(([cats, sups]) => {
      setCategories(cats);
      setSuppliers(sups.filter((s: any) => s.isActive));
    });
  }, [load]);

  useEffect(() => {
    if (tab === 'history' && globalHistory.movements.length === 0 && !globalHistoryLoading) {
      loadGlobalHistory(1, '');
    }
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = (data.items || []).filter(i =>
    !search ||
    i.productName?.toLowerCase().includes(search.toLowerCase()) ||
    i.productSku?.toLowerCase().includes(search.toLowerCase())
  );

  const loadHistory = async (item: any, page = 1) => {
    setHistoryLoading(true);
    try {
      const result = await inventoryApi.history(item.id, page, 20);
      setHistory({ ...result, page });
    } finally {
      setHistoryLoading(false);
    }
  };

  const loadGlobalHistory = useCallback(async (page = 1, type = globalHistoryType) => {
    setGlobalHistoryLoading(true);
    try {
      const result = await inventoryApi.globalHistory(page, 20, type || undefined);
      setGlobalHistory({ ...result, page });
    } finally {
      setGlobalHistoryLoading(false);
    }
  }, [globalHistoryType]);

  const handleStockIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await inventoryApi.stockIn({
        inventoryItemId: showStockIn.id,
        quantity: Number(stockInForm.quantity),
        costPrice: stockInForm.costPrice || undefined,
        supplierId: stockInForm.supplierId ? Number(stockInForm.supplierId) : undefined,
        invoiceRef: stockInForm.invoiceRef || undefined,
        notes: stockInForm.notes || undefined,
      });
      setShowStockIn(null);
      load();
    } catch (err: any) { alert(err.message); }
    finally { setSaving(false); }
  };

  const handleStockOut = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await inventoryApi.stockOut({
        inventoryItemId: showStockOut.id,
        quantity: Number(stockOutForm.quantity),
        reason: stockOutForm.reason,
        notes: stockOutForm.notes || undefined,
      });
      setShowStockOut(null);
      load();
    } catch (err: any) { alert(err.message); }
    finally { setSaving(false); }
  };

  const handleStockAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await inventoryApi.adjust({
        inventoryItemId: showStockAdjust.id,
        type: 'adjustment',
        quantity: Number(stockAdjustForm.newQuantity),
        reason: stockAdjustForm.reason || undefined,
      });
      setShowStockAdjust(null);
      load();
    } catch (err: any) { alert(err.message); }
    finally { setSaving(false); }
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await productsApi.create({
        ...productForm,
        categoryId: productForm.categoryId ? Number(productForm.categoryId) : undefined,
        reorderLevel: Number(productForm.reorderLevel) || 10,
      });
      load();
      setShowAddProduct(false);
      setProductForm({ categoryId: '', name: '', sku: '', price: '', costPrice: '', unit: 'piece', description: '', reorderLevel: '10' });
    } catch (err: any) { alert(err.message); }
    finally { setSaving(false); }
  };

  const handleEditProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await productsApi.update(showEditProduct.productId, {
        name: showEditProduct.productName,
        price: showEditProduct.productPrice,
        costPrice: showEditProduct.productCostPrice,
        unit: showEditProduct.productUnit,
        categoryId: showEditProduct.categoryId ? Number(showEditProduct.categoryId) : undefined,
        reorderLevel: Number(showEditProduct.reorderLevel),
      });
      setShowEditProduct(null);
      load();
    } catch (err: any) { alert(err.message); }
    finally { setSaving(false); }
  };

  // ─── Stocktake helpers ───────────────────────────────────────────────────────
  const stocktakeAddItem = (item: any) => {
    setStocktakeItems(prev => {
      if (prev.find(e => e.inventoryItemId === item.id)) return prev;
      return [...prev, {
        inventoryItemId: item.id,
        productName: item.productName,
        productSku: item.productSku,
        currentQty: item.quantityInStock,
        productUnit: item.productUnit,
        countedQty: String(item.quantityInStock),
      }];
    });
    setStocktakeSearch('');
    setStocktakeSearchOpen(false);
  };

  const stocktakeRemoveItem = (inventoryItemId: number) => {
    setStocktakeItems(prev => prev.filter(e => e.inventoryItemId !== inventoryItemId));
  };

  const stocktakeUpdateCountedQty = (inventoryItemId: number, val: string) => {
    setStocktakeItems(prev => prev.map(e => e.inventoryItemId === inventoryItemId ? { ...e, countedQty: val } : e));
  };

  const handleStocktakeCommit = async () => {
    const valid = stocktakeItems.filter(e => e.countedQty !== '' && Number(e.countedQty) >= 0);
    if (valid.length === 0) return;
    setStocktakeCommitting(true);
    setStocktakeDone(null);
    try {
      const result = await inventoryApi.bulkAdjust({
        adjustments: valid.map(e => ({ inventoryItemId: e.inventoryItemId, quantity: Number(e.countedQty) })),
        reason: stocktakeReason.trim() || 'Physical stocktake',
      });
      const committed = result.results.filter((r: any) => !r.error).length;
      const errors = result.results.filter((r: any) => r.error).length;
      setStocktakeDone({ committed, errors });
      setStocktakeItems([]);
      setStocktakeReason('Physical stocktake');
      localStorage.removeItem('ps_stocktake_items');
      localStorage.removeItem('ps_stocktake_reason');
      load();
    } catch (err: any) {
      alert(err.message || 'Failed to commit stocktake');
    } finally {
      setStocktakeCommitting(false);
    }
  };

  const rowClass = (qty: number, reorder: number) => {
    if (qty === 0) return 'bg-red-50/60 dark:bg-red-900/10';
    if (qty <= reorder) return 'bg-amber-50/60 dark:bg-amber-900/10';
    return '';
  };

  const qtyClass = (qty: number, reorder: number) => {
    if (qty === 0) return 'text-red-600 dark:text-red-400 font-bold';
    if (qty <= reorder) return 'text-amber-600 dark:text-amber-400 font-semibold';
    return 'text-slate-900 dark:text-white';
  };

  const movementTypeLabel = (type: string) => {
    const map: Record<string, string> = { in: 'Stock In', out: 'Stock Out', adjustment: 'Adjustment', sale: 'Sale' };
    return map[type] ?? type;
  };

  const movementTypeColor = (type: string) => {
    if (type === 'in') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
    if (type === 'out') return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    if (type === 'sale') return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400';
    return 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="page-title dark:text-white flex items-center gap-2">
            <Package size={24} className="text-indigo-600" /> Inventory
          </h1>
          <p className="page-subtitle dark:text-slate-400">
            {data.items.length} items · {data.lowStockCount} low stock · {data.outOfStockCount} out of stock
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setBarcodeScanMode('in'); setShowBarcodeScanner(true); }}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors shadow-sm"
            title="Scan barcode to stock in"
          >
            <Barcode size={16} /> Scan to Stock In
          </button>
          <button
            onClick={() => { setBarcodeScanMode('out'); setShowBarcodeScanner(true); }}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors shadow-sm"
            title="Scan barcode to stock out"
          >
            <Barcode size={16} /> Scan to Stock Out
          </button>
          <button
            onClick={() => { setBarcodeScanMode('adjust'); setShowBarcodeScanner(true); }}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors shadow-sm"
            title="Scan barcode to adjust stock"
          >
            <Barcode size={16} /> Scan to Adjust
          </button>
          <button onClick={() => setShowAddProduct(true)} className="btn-primary flex items-center gap-2">
            <Plus size={16} /> Add Product
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="card dark:bg-slate-800 dark:border-slate-700/50 p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-1">Total Value</div>
          <div className="text-xl font-bold text-slate-900 dark:text-white">{fmt(data.totalValue)}</div>
        </div>
        <div className="card dark:bg-slate-800 dark:border-slate-700/50 p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-1">Total Items</div>
          <div className="text-xl font-bold text-slate-900 dark:text-white">{data.items.length}</div>
        </div>
        <div className="card dark:bg-slate-800 dark:border-slate-700/50 p-4 border-l-4 border-amber-400">
          <div className="text-xs text-amber-600 dark:text-amber-400 font-medium mb-1">Low Stock</div>
          <div className="text-xl font-bold text-amber-600 dark:text-amber-400">{data.lowStockCount}</div>
        </div>
        <div className="card dark:bg-slate-800 dark:border-slate-700/50 p-4 border-l-4 border-red-400">
          <div className="text-xs text-red-600 dark:text-red-400 font-medium mb-1">Out of Stock</div>
          <div className="text-xl font-bold text-red-600 dark:text-red-400">{data.outOfStockCount}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl w-fit flex-wrap">
        {([
          ['list', 'Stock List', <Package size={14} />],
          ['stocktake', 'Stocktake', <ScanLine size={14} />],
          ['history', 'All History', <History size={14} />],
        ] as const).map(([t, label, icon]) => (
          <button key={t} onClick={() => { setTab(t); if (t !== 'stocktake') setStocktakeDone(null); }}
            className={clsx('flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all', tab === t ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300')}>
            {icon}{label}
            {t === 'stocktake' && stocktakeItems.length > 0 && (
              <span className="ml-1 bg-indigo-600 text-white text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">{stocktakeItems.length}</span>
            )}
          </button>
        ))}
      </div>

      {tab === 'list' && (
        <>
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
            <div className="relative max-w-xs">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or SKU..." className="input pl-9 dark:bg-slate-800 dark:border-slate-600 dark:text-white dark:placeholder-slate-400" />
            </div>
            <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="input max-w-xs dark:bg-slate-800 dark:border-slate-600 dark:text-white">
              <option value="">All Categories</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <div className="flex gap-2">
              {[['', 'All'], ['low', 'Low Stock'], ['out', 'Out of Stock']].map(([v, l]) => (
                <button key={v} onClick={() => setFilterStock(v as any)}
                  className={clsx('px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all', filterStock === v ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:border-indigo-400')}>
                  {l}
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
                      <th className="table-header px-4 py-3 text-left">Product</th>
                      <th className="table-header px-4 py-3 text-left">SKU</th>
                      <th className="table-header px-4 py-3 text-left">Category</th>
                      <th className="table-header px-4 py-3 text-right">In Stock</th>
                      <th className="table-header px-4 py-3 text-right">Reorder At</th>
                      <th className="table-header px-4 py-3 text-right">Cost</th>
                      <th className="table-header px-4 py-3 text-right">Price</th>
                      <th className="table-header px-4 py-3 text-right">Value</th>
                      <th className="table-header px-4 py-3 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr><td colSpan={9} className="text-center py-12 text-slate-400 dark:text-slate-500">No inventory items found</td></tr>
                    ) : filtered.map(item => (
                      <tr key={item.id} className={clsx('border-b border-slate-50 dark:border-slate-700/30 transition-colors', rowClass(item.quantityInStock, item.reorderLevel))}>
                        <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{item.productName}</td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-500 dark:text-slate-400">{item.productSku}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{item.categoryName || '—'}</td>
                        <td className={clsx('px-4 py-3 text-right', qtyClass(item.quantityInStock, item.reorderLevel))}>
                          <span className="flex items-center justify-end gap-1">
                            {item.quantityInStock === 0 && <AlertTriangle size={12} className="text-red-500" />}
                            {item.quantityInStock > 0 && item.quantityInStock <= item.reorderLevel && <TrendingDown size={12} className="text-amber-500" />}
                            {item.quantityInStock} {item.productUnit}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-slate-500 dark:text-slate-400">{item.reorderLevel}</td>
                        <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">{fmt(item.productCostPrice || 0)}</td>
                        <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-200">{fmt(item.productPrice || 0)}</td>
                        <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-200 font-medium">
                          {fmt(Number(item.productCostPrice || 0) * item.quantityInStock)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => { setShowStockIn(item); setStockInForm({ quantity: '1', costPrice: item.productCostPrice || '', supplierId: '', invoiceRef: '', notes: '' }); }}
                              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 text-xs font-semibold hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors" title="Stock In">
                              <ArrowUp size={11} />
                            </button>
                            <button onClick={() => { setShowStockOut(item); setStockOutForm({ quantity: '1', reason: 'Damaged', notes: '' }); }}
                              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-xs font-semibold hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors" title="Stock Out">
                              <ArrowDown size={11} />
                            </button>
                            <button onClick={() => { setShowStockAdjust(item); setStockAdjustForm({ newQuantity: String(item.quantityInStock), reason: '', notes: '' }); }}
                              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 text-xs font-semibold hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors" title="Adjust Stock">
                              <RotateCcw size={11} />
                            </button>
                            <button onClick={() => { setShowHistory(item); loadHistory(item); }}
                              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors" title="History">
                              <History size={11} />
                            </button>
                            <button onClick={() => setShowEditProduct({ ...item })}
                              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 text-xs font-semibold hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors" title="Edit">
                              <Edit2 size={11} />
                            </button>
                            {(item.quantityInStock <= item.reorderLevel) && (
                              <button
                                onClick={() => navigate(`/purchase-orders?new=1&productId=${item.productId}`)}
                                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 text-xs font-semibold hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors"
                                title="Create Purchase Order">
                                <ClipboardList size={11} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {tab === 'stocktake' && (
        <div className="space-y-5">
          {/* Success banner */}
          {stocktakeDone && (
            <div className={clsx(
              'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold',
              stocktakeDone.errors === 0
                ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                : 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
            )}>
              <CheckCircle size={16} />
              <span>
                Stocktake committed — {stocktakeDone.committed} product{stocktakeDone.committed !== 1 ? 's' : ''} updated
                {stocktakeDone.errors > 0 && `, ${stocktakeDone.errors} error${stocktakeDone.errors !== 1 ? 's' : ''}`}.
              </span>
              <button onClick={() => setStocktakeDone(null)} className="ml-auto"><X size={14} /></button>
            </div>
          )}

          {/* Info banner */}
          <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 text-sm">
            <ScanLine size={16} className="mt-0.5 flex-shrink-0" />
            <span>Search or scan products to add them to the count list, enter the physically counted quantity for each, then click <strong>Commit All</strong> to set all stock levels at once. Each correction is recorded in movement history as an Adjustment.</span>
          </div>

          {/* Barcode scan — inline USB input + camera button */}
          <div className="card dark:bg-slate-800 dark:border-slate-700/50 p-4 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h3 className="font-semibold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                <Barcode size={14} className="text-indigo-600" /> Scan to Add
              </h3>
              <div className="flex items-center gap-3 flex-wrap">
                <label className="flex items-center gap-2 cursor-pointer select-none" title="Keep cursor in scan input after each barcode so you can scan the next item immediately">
                  <div
                    role="switch"
                    aria-checked={stayInScanMode}
                    onClick={() => setStayInScanMode(v => !v)}
                    className={clsx(
                      'relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none cursor-pointer',
                      stayInScanMode ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-600'
                    )}
                  >
                    <span className={clsx(
                      'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform duration-200',
                      stayInScanMode ? 'translate-x-4' : 'translate-x-0'
                    )} />
                  </div>
                  <span className="text-xs text-slate-600 dark:text-slate-400 font-medium">Stay in scan mode</span>
                </label>
                <button
                  onClick={() => { setBarcodeScanMode('stocktake'); setShowBarcodeScanner(true); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors shadow-sm"
                  title="Open camera barcode scanner"
                >
                  <Camera size={13} /> Camera Scanner
                </button>
              </div>
            </div>
            <div className="relative max-w-sm">
              <Barcode size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                ref={stocktakeScanInputRef}
                type="text"
                placeholder="Scan barcode or type SKU + Enter…"
                className={clsx(
                  'input pl-9 font-mono dark:bg-slate-700 dark:border-slate-600 dark:text-white w-full transition-all',
                  barcodeFlash === 'success' && 'border-emerald-400 ring-1 ring-emerald-300',
                  barcodeFlash === 'error' && 'border-red-400 ring-1 ring-red-300',
                )}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const val = (e.target as HTMLInputElement).value.trim();
                    if (val) handleBarcodeInput(val, false, 'stocktake');
                  }
                }}
                autoComplete="off"
                disabled={barcodeLoading}
              />
              {barcodeLoading && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>
            {barcodeFlash === 'success' && barcodeMsg && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <CheckCircle size={12} /> {barcodeMsg}
              </p>
            )}
            {barcodeFlash === 'error' && barcodeMsg && (
              <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
                <AlertCircle size={12} /> {barcodeMsg}
              </p>
            )}
            <p className="text-xs text-slate-400 dark:text-slate-500">
              USB wedge scanners auto-submit on Enter. Already-counted products jump to their qty row.
              {stayInScanMode && ' Focus returns here automatically so you can scan the next item right away.'}
            </p>
          </div>

          {/* Product search / add */}
          <div className="card dark:bg-slate-800 dark:border-slate-700/50 p-4 space-y-3">
            <h3 className="font-semibold text-slate-900 dark:text-white text-sm flex items-center gap-2">
              <Search size={14} className="text-indigo-600" /> Add Products to Count
            </h3>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                ref={stocktakeSearchRef}
                value={stocktakeSearch}
                onChange={e => { setStocktakeSearch(e.target.value); setStocktakeSearchOpen(true); }}
                onFocus={() => setStocktakeSearchOpen(true)}
                placeholder="Search product name or SKU…"
                className="input pl-9 dark:bg-slate-700 dark:border-slate-600 dark:text-white w-full max-w-sm"
              />
              {stocktakeSearchOpen && stocktakeSearch.trim() && (
                <div className="absolute left-0 top-full mt-1 z-30 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl w-full max-w-sm max-h-56 overflow-y-auto">
                  {(data.items || [])
                    .filter(i =>
                      i.productName?.toLowerCase().includes(stocktakeSearch.toLowerCase()) ||
                      i.productSku?.toLowerCase().includes(stocktakeSearch.toLowerCase())
                    )
                    .slice(0, 12)
                    .map(i => {
                      const alreadyAdded = stocktakeItems.some(e => e.inventoryItemId === i.id);
                      return (
                        <button
                          key={i.id}
                          disabled={alreadyAdded}
                          onClick={() => stocktakeAddItem(i)}
                          className={clsx(
                            'w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors',
                            alreadyAdded && 'opacity-40 cursor-not-allowed'
                          )}>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-slate-900 dark:text-white truncate">{i.productName}</div>
                            <div className="text-xs text-slate-400 dark:text-slate-500 font-mono">{i.productSku} · {i.quantityInStock} {i.productUnit} in stock</div>
                          </div>
                          {alreadyAdded && <span className="text-xs text-indigo-500 font-semibold flex-shrink-0">Added</span>}
                        </button>
                      );
                    })}
                  {(data.items || []).filter(i =>
                    i.productName?.toLowerCase().includes(stocktakeSearch.toLowerCase()) ||
                    i.productSku?.toLowerCase().includes(stocktakeSearch.toLowerCase())
                  ).length === 0 && (
                    <div className="px-4 py-3 text-sm text-slate-400 dark:text-slate-500">No products match "{stocktakeSearch}"</div>
                  )}
                </div>
              )}
            </div>
            {/* Click-away to close dropdown */}
            {stocktakeSearchOpen && (
              <div className="fixed inset-0 z-20" onClick={() => setStocktakeSearchOpen(false)} />
            )}
          </div>

          {/* Count list */}
          {stocktakeItems.length === 0 ? (
            <div className="text-center py-16 text-slate-400 dark:text-slate-500">
              <ScanLine size={36} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">No products added yet</p>
              <p className="text-xs mt-1">Search above to add products to the count</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="card dark:bg-slate-800 dark:border-slate-700/50 overflow-hidden p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-700/30 border-b border-slate-100 dark:border-slate-700">
                        <th className="table-header px-4 py-3 text-left">Product</th>
                        <th className="table-header px-4 py-3 text-right">System Qty</th>
                        <th className="table-header px-4 py-3 text-right">Counted Qty</th>
                        <th className="table-header px-4 py-3 text-right">Difference</th>
                        <th className="table-header px-4 py-3 text-center w-16"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {stocktakeItems.map(entry => {
                        const counted = entry.countedQty === '' ? null : Number(entry.countedQty);
                        const diff = counted !== null ? counted - entry.currentQty : null;
                        return (
                          <tr key={entry.inventoryItemId} className="border-b border-slate-50 dark:border-slate-700/30">
                            <td className="px-4 py-3">
                              <div className="font-medium text-slate-900 dark:text-white">{entry.productName}</div>
                              <div className="text-xs font-mono text-slate-400 dark:text-slate-500">{entry.productSku}</div>
                            </td>
                            <td className="px-4 py-3 text-right text-slate-500 dark:text-slate-400">
                              {entry.currentQty} <span className="text-xs">{entry.productUnit}</span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <input
                                type="number"
                                min="0"
                                value={entry.countedQty}
                                onChange={e => stocktakeUpdateCountedQty(entry.inventoryItemId, e.target.value)}
                                ref={el => { stocktakeCountedQtyRefs.current[entry.inventoryItemId] = el; }}
                                className="input w-24 text-right dark:bg-slate-700 dark:border-slate-600 dark:text-white py-1 px-2"
                              />
                            </td>
                            <td className="px-4 py-3 text-right">
                              {diff === null ? (
                                <span className="text-slate-300 dark:text-slate-600">—</span>
                              ) : diff === 0 ? (
                                <span className="text-slate-400 dark:text-slate-500 text-xs font-medium">No change</span>
                              ) : diff > 0 ? (
                                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">+{diff}</span>
                              ) : (
                                <span className="text-red-600 dark:text-red-400 font-semibold">{diff}</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <button
                                onClick={() => stocktakeRemoveItem(entry.inventoryItemId)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Reason + Commit */}
              <div className="card dark:bg-slate-800 dark:border-slate-700/50 p-4 space-y-4">
                <div>
                  <label className="label dark:text-slate-300">Reason / Reference <span className="text-slate-400 text-xs font-normal">(applied to all adjustments)</span></label>
                  <input
                    value={stocktakeReason}
                    onChange={e => setStocktakeReason(e.target.value)}
                    placeholder="e.g. Physical stocktake June 2026"
                    className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white max-w-sm"
                  />
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <button
                    onClick={handleStocktakeCommit}
                    disabled={stocktakeCommitting || stocktakeItems.every(e => e.countedQty === '')}
                    className="btn-primary flex items-center gap-2 disabled:opacity-50">
                    {stocktakeCommitting
                      ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Committing…</>
                      : <><CheckCircle size={15} /> Commit All ({stocktakeItems.length} item{stocktakeItems.length !== 1 ? 's' : ''})</>
                    }
                  </button>
                  <button
                    onClick={() => { setStocktakeItems([]); setStocktakeDone(null); }}
                    className="btn-secondary text-sm">
                    Clear All
                  </button>
                  <span className="text-xs text-slate-400 dark:text-slate-500">
                    {stocktakeItems.filter(e => Number(e.countedQty) !== e.currentQty).length} product{stocktakeItems.filter(e => Number(e.countedQty) !== e.currentQty).length !== 1 ? 's' : ''} will be adjusted
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'history' && (
        <div className="space-y-4">
          {/* Filter bar */}
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-sm text-slate-500 dark:text-slate-400 font-medium">Filter:</span>
            {[['', 'All'], ['in', 'Stock In'], ['out', 'Stock Out'], ['sale', 'Sale'], ['adjustment', 'Adjustment']].map(([v, l]) => (
              <button key={v} onClick={() => { setGlobalHistoryType(v); loadGlobalHistory(1, v); }}
                className={clsx('px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all', globalHistoryType === v ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:border-indigo-400')}>
                {l}
              </button>
            ))}
          </div>

          {globalHistoryLoading ? (
            <div className="flex items-center justify-center h-48"><div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>
          ) : globalHistory.movements.length === 0 ? (
            <div className="text-center py-12 text-slate-400 dark:text-slate-500">
              <History size={32} className="mx-auto mb-3 opacity-40" />
              <p className="text-sm">No movement records found.</p>
            </div>
          ) : (
            <div className="card dark:bg-slate-800 dark:border-slate-700/50 overflow-hidden p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-700/30 border-b border-slate-100 dark:border-slate-700">
                      <th className="table-header px-4 py-3 text-left">Date</th>
                      <th className="table-header px-4 py-3 text-left">Type</th>
                      <th className="table-header px-4 py-3 text-left">Product</th>
                      <th className="table-header px-4 py-3 text-right">Qty</th>
                      <th className="table-header px-4 py-3 text-right">Balance</th>
                      <th className="table-header px-4 py-3 text-left">Reference</th>
                      <th className="table-header px-4 py-3 text-left">By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {globalHistory.movements.map((m: any) => (
                      <tr key={m.id} className="border-b border-slate-50 dark:border-slate-700/30 hover:bg-slate-50/50 dark:hover:bg-slate-700/20 transition-colors">
                        <td className="px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">{fmtDate(m.created_at)}</td>
                        <td className="px-4 py-2.5">
                          <span className={clsx('text-xs font-semibold px-2 py-0.5 rounded-full', movementTypeColor(m.type))}>
                            {movementTypeLabel(m.type)}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="font-medium text-slate-900 dark:text-white text-xs">{m.product_name ?? '—'}</div>
                          {m.product_sku && <div className="text-slate-400 dark:text-slate-500 font-mono text-xs">{m.product_sku}</div>}
                        </td>
                        <td className={clsx('px-4 py-2.5 text-right font-bold text-sm', m.type === 'in' ? 'text-emerald-600 dark:text-emerald-400' : m.type === 'sale' || m.type === 'out' ? 'text-red-600 dark:text-red-400' : 'text-slate-700 dark:text-slate-200')}>
                          {m.type === 'in' ? '+' : m.type === 'out' || m.type === 'sale' ? '-' : '='}{m.quantity}
                        </td>
                        <td className="px-4 py-2.5 text-right text-xs text-slate-500 dark:text-slate-400">
                          {m.balance_after !== null ? m.balance_after : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400">
                          {m.invoice_ref && <span className="text-indigo-600 dark:text-indigo-400">{m.invoice_ref}</span>}
                          {m.reason && !m.invoice_ref && <span>{m.reason}</span>}
                          {m.supplier_name && <span className="block text-slate-400 dark:text-slate-500">{m.supplier_name}</span>}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400">{m.created_by_name ?? 'System'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {globalHistory.total > globalHistory.limit && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-700/20">
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {globalHistory.total} total · Page {globalHistory.page} of {Math.ceil(globalHistory.total / globalHistory.limit)}
                  </span>
                  <div className="flex gap-2">
                    <button disabled={globalHistory.page <= 1} onClick={() => loadGlobalHistory(globalHistory.page - 1)}
                      className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-40">
                      <ChevronLeft size={14} />
                    </button>
                    <button disabled={globalHistory.page >= Math.ceil(globalHistory.total / globalHistory.limit)} onClick={() => loadGlobalHistory(globalHistory.page + 1)}
                      className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-40">
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Barcode Scanner Modal */}
      {showBarcodeScanner && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => { stopCamera(); setShowBarcodeScanner(false); }} />
          <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm animate-fade-in border border-slate-100 dark:border-slate-700">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Barcode size={17} className={barcodeScanMode === 'out' ? 'text-red-600' : barcodeScanMode === 'stocktake' ? 'text-indigo-600' : barcodeScanMode === 'adjust' ? 'text-indigo-600' : 'text-emerald-600'} />
                  {barcodeScanMode === 'out' ? 'Scan to Stock Out' : barcodeScanMode === 'adjust' ? 'Scan to Adjust Stock' : barcodeScanMode === 'stocktake' ? 'Scan to Add to Stocktake' : 'Scan to Stock In'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {barcodeScanMode === 'stocktake'
                    ? 'Each scan adds the product to your count list. Already-added items jump to their qty row.'
                    : 'USB scanner, camera, or type SKU manually'}
                </p>
              </div>
              <button onClick={() => { stopCamera(); setShowBarcodeScanner(false); }} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700">
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Status feedback */}
              {barcodeFlash === 'success' && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-sm font-semibold">
                  <CheckCircle size={15} /> {barcodeMsg}
                </div>
              )}
              {barcodeFlash === 'error' && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-sm font-semibold">
                  <AlertCircle size={15} /> {barcodeMsg}
                </div>
              )}

              {/* Keyboard / USB scanner input */}
              <div>
                <label className="label dark:text-slate-300 mb-1">Barcode / SKU</label>
                <div className="relative">
                  <Barcode size={15} className={clsx(
                    'absolute left-3 top-1/2 -translate-y-1/2 transition-colors pointer-events-none',
                    barcodeFlash === 'success' ? 'text-emerald-500' :
                    barcodeFlash === 'error' ? 'text-red-500' :
                    barcodeScanMode === 'out' ? 'text-red-400' :
                    barcodeScanMode === 'adjust' || barcodeScanMode === 'stocktake' ? 'text-indigo-400' : 'text-slate-400'
                  )} />
                  <input
                    ref={barcodeInputRef}
                    type="text"
                    placeholder="Scan barcode or type SKU + Enter…"
                    className={clsx(
                      'input pl-9 dark:bg-slate-700 dark:border-slate-600 dark:text-white font-mono transition-all',
                      barcodeFlash === 'success' && 'border-emerald-400 ring-1 ring-emerald-300',
                      barcodeFlash === 'error' && 'border-red-400 ring-1 ring-red-300',
                    )}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const val = (e.target as HTMLInputElement).value.trim();
                        if (val) handleBarcodeInput(val);
                      }
                    }}
                    autoComplete="off"
                    disabled={barcodeLoading}
                  />
                  {barcodeLoading && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <div className={clsx('w-4 h-4 border-2 border-t-transparent rounded-full animate-spin', barcodeScanMode === 'out' ? 'border-red-500' : barcodeScanMode === 'adjust' || barcodeScanMode === 'stocktake' ? 'border-indigo-500' : 'border-emerald-500')} />
                    </div>
                  )}
                </div>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                  USB wedge scanners auto-submit on Enter. Manual entry: type SKU then press Enter.
                </p>
              </div>

              {/* Camera scanning */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-600 overflow-hidden">
                {cameraActive ? (
                  <div className="relative">
                    <video
                      ref={videoRef}
                      className="w-full rounded-t-xl bg-black"
                      style={{ maxHeight: 220, objectFit: 'cover' }}
                      muted
                      playsInline
                    />
                    {/* Scan guide overlay */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className={clsx('w-48 h-28 border-2 rounded-lg opacity-70', barcodeScanMode === 'out' ? 'border-red-400' : barcodeScanMode === 'adjust' || barcodeScanMode === 'stocktake' ? 'border-indigo-400' : 'border-emerald-400')} />
                    </div>
                    <button
                      type="button"
                      onClick={stopCamera}
                      className="w-full py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <X size={12} /> Stop Camera
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={startCamera}
                    disabled={cameraSupported === false}
                    className={clsx(
                      'w-full py-3.5 flex flex-col items-center gap-1.5 transition-colors',
                      cameraSupported === false
                        ? 'opacity-50 cursor-not-allowed bg-slate-50 dark:bg-slate-700/50'
                        : barcodeScanMode === 'out'
                          ? 'hover:bg-red-50 dark:hover:bg-red-900/20'
                          : barcodeScanMode === 'adjust' || barcodeScanMode === 'stocktake'
                            ? 'hover:bg-indigo-50 dark:hover:bg-indigo-900/20'
                            : 'hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
                    )}
                  >
                    <Camera size={22} className={
                      cameraSupported === false ? 'text-slate-400' :
                      barcodeScanMode === 'out' ? 'text-red-600 dark:text-red-400' :
                      barcodeScanMode === 'adjust' || barcodeScanMode === 'stocktake' ? 'text-indigo-600 dark:text-indigo-400' : 'text-emerald-600 dark:text-emerald-400'
                    } />
                    <span className={clsx('text-xs font-semibold',
                      cameraSupported === false ? 'text-slate-400' :
                      barcodeScanMode === 'out' ? 'text-red-700 dark:text-red-400' :
                      barcodeScanMode === 'adjust' || barcodeScanMode === 'stocktake' ? 'text-indigo-700 dark:text-indigo-400' : 'text-emerald-700 dark:text-emerald-400'
                    )}>
                      {cameraSupported === false ? 'Camera scan not supported in this browser' : 'Tap to scan with camera'}
                    </span>
                    {cameraSupported !== false && (
                      <span className="text-xs text-slate-400 dark:text-slate-500">Uses BarcodeDetector API (Chrome / Android)</span>
                    )}
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => { stopCamera(); setShowBarcodeScanner(false); }}
                className="w-full btn-secondary"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stock In Drawer */}
      {showStockIn && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowStockIn(null)} />
          <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md animate-fade-in border border-slate-100 dark:border-slate-700 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700 sticky top-0 bg-white dark:bg-slate-800">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2"><ArrowUp size={16} className="text-emerald-600" /> Stock In</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">{showStockIn.productName} · {showStockIn.quantityInStock} on hand</p>
              </div>
              <button onClick={() => setShowStockIn(null)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"><X size={16} /></button>
            </div>
            <form onSubmit={handleStockIn} className="p-5 space-y-4">
              {/* Barcode scan input — scan a different product while drawer is open */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/40 px-3 py-2.5">
                <div className="flex items-center gap-2 mb-1.5">
                  <Barcode size={13} className="text-emerald-600 flex-shrink-0" />
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Scan a different product</span>
                </div>
                <div className="relative">
                  <input
                    ref={drawerBarcodeInputRef}
                    type="text"
                    placeholder="Scan barcode or type SKU + Enter…"
                    className={clsx(
                      'input py-1.5 text-xs font-mono dark:bg-slate-700 dark:border-slate-600 dark:text-white transition-all',
                      barcodeFlash === 'success' && 'border-emerald-400 ring-1 ring-emerald-300',
                      barcodeFlash === 'error' && 'border-red-400 ring-1 ring-red-300',
                    )}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const val = (e.target as HTMLInputElement).value.trim();
                        if (val) handleBarcodeInput(val, true, 'in');
                      }
                    }}
                    autoComplete="off"
                    disabled={barcodeLoading}
                  />
                  {barcodeLoading && (
                    <div className="absolute right-2 top-1/2 -translate-y-1/2">
                      <div className="w-3 h-3 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                </div>
                {barcodeFlash === 'success' && barcodeMsg && (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1">
                    <CheckCircle size={11} /> {barcodeMsg}
                  </p>
                )}
                {barcodeFlash === 'error' && barcodeMsg && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1 flex items-center gap-1">
                    <AlertCircle size={11} /> {barcodeMsg}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label dark:text-slate-300">Quantity *</label>
                  <input required type="number" min="1" value={stockInForm.quantity} onChange={e => setStockInForm(p => ({ ...p, quantity: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
                </div>
                <div>
                  <label className="label dark:text-slate-300">Cost Price</label>
                  <input type="number" step="0.01" value={stockInForm.costPrice} onChange={e => setStockInForm(p => ({ ...p, costPrice: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="0.00" />
                </div>
              </div>
              <div>
                <label className="label dark:text-slate-300">Supplier</label>
                <select value={stockInForm.supplierId} onChange={e => setStockInForm(p => ({ ...p, supplierId: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                  <option value="">None</option>
                  {suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label dark:text-slate-300">Invoice / Reference</label>
                <input value={stockInForm.invoiceRef} onChange={e => setStockInForm(p => ({ ...p, invoiceRef: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="e.g. INV-2024-001" />
              </div>
              <div>
                <label className="label dark:text-slate-300">Notes</label>
                <textarea rows={2} value={stockInForm.notes} onChange={e => setStockInForm(p => ({ ...p, notes: e.target.value }))} className="input resize-none dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowStockIn(null)} className="flex-1 btn-secondary">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 btn-primary bg-emerald-600 hover:bg-emerald-700">{saving ? 'Saving...' : 'Add Stock'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stock Out Drawer */}
      {showStockOut && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowStockOut(null)} />
          <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md animate-fade-in border border-slate-100 dark:border-slate-700 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700 sticky top-0 bg-white dark:bg-slate-800">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2"><ArrowDown size={16} className="text-red-600" /> Stock Out</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">{showStockOut.productName} · {showStockOut.quantityInStock} on hand</p>
              </div>
              <button onClick={() => setShowStockOut(null)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"><X size={16} /></button>
            </div>
            <form onSubmit={handleStockOut} className="p-5 space-y-4">
              {/* Barcode scan input — scan a different product while drawer is open */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/40 px-3 py-2.5">
                <div className="flex items-center gap-2 mb-1.5">
                  <Barcode size={13} className="text-red-600 flex-shrink-0" />
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Scan a different product</span>
                </div>
                <div className="relative">
                  <input
                    ref={drawerStockOutBarcodeInputRef}
                    type="text"
                    placeholder="Scan barcode or type SKU + Enter…"
                    className={clsx(
                      'input py-1.5 text-xs font-mono dark:bg-slate-700 dark:border-slate-600 dark:text-white transition-all',
                      barcodeFlash === 'success' && 'border-emerald-400 ring-1 ring-emerald-300',
                      barcodeFlash === 'error' && 'border-red-400 ring-1 ring-red-300',
                    )}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const val = (e.target as HTMLInputElement).value.trim();
                        if (val) handleBarcodeInput(val, true, 'out');
                      }
                    }}
                    autoComplete="off"
                    disabled={barcodeLoading}
                  />
                  {barcodeLoading && (
                    <div className="absolute right-2 top-1/2 -translate-y-1/2">
                      <div className="w-3 h-3 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                </div>
                {barcodeFlash === 'success' && barcodeMsg && (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1">
                    <CheckCircle size={11} /> {barcodeMsg}
                  </p>
                )}
                {barcodeFlash === 'error' && barcodeMsg && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1 flex items-center gap-1">
                    <AlertCircle size={11} /> {barcodeMsg}
                  </p>
                )}
              </div>
              <div>
                <label className="label dark:text-slate-300">Quantity *</label>
                <input required type="number" min="1" max={showStockOut.quantityInStock} value={stockOutForm.quantity} onChange={e => setStockOutForm(p => ({ ...p, quantity: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
              </div>
              <div>
                <label className="label dark:text-slate-300">Reason *</label>
                <select required value={stockOutForm.reason} onChange={e => setStockOutForm(p => ({ ...p, reason: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                  {STOCK_OUT_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="label dark:text-slate-300">Notes</label>
                <textarea rows={2} value={stockOutForm.notes} onChange={e => setStockOutForm(p => ({ ...p, notes: e.target.value }))} className="input resize-none dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowStockOut(null)} className="flex-1 btn-secondary">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 btn-primary bg-red-600 hover:bg-red-700">{saving ? 'Saving...' : 'Remove Stock'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stock Adjust Drawer */}
      {showStockAdjust && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowStockAdjust(null)} />
          <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md animate-fade-in border border-slate-100 dark:border-slate-700 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700 sticky top-0 bg-white dark:bg-slate-800">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2"><RotateCcw size={16} className="text-indigo-600" /> Adjust Stock</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">{showStockAdjust.productName} · currently {showStockAdjust.quantityInStock} on hand</p>
              </div>
              <button onClick={() => setShowStockAdjust(null)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"><X size={16} /></button>
            </div>
            <form onSubmit={handleStockAdjust} className="p-5 space-y-4">
              {/* Barcode scan input — scan a different product while drawer is open */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/40 px-3 py-2.5">
                <div className="flex items-center gap-2 mb-1.5">
                  <Barcode size={13} className="text-indigo-600 flex-shrink-0" />
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Scan a different product</span>
                </div>
                <div className="relative">
                  <input
                    ref={drawerAdjustBarcodeInputRef}
                    type="text"
                    placeholder="Scan barcode or type SKU + Enter…"
                    className={clsx(
                      'input py-1.5 text-xs font-mono dark:bg-slate-700 dark:border-slate-600 dark:text-white transition-all',
                      barcodeFlash === 'success' && 'border-emerald-400 ring-1 ring-emerald-300',
                      barcodeFlash === 'error' && 'border-red-400 ring-1 ring-red-300',
                    )}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const val = (e.target as HTMLInputElement).value.trim();
                        if (val) handleBarcodeInput(val, true, 'adjust');
                      }
                    }}
                    autoComplete="off"
                    disabled={barcodeLoading}
                  />
                  {barcodeLoading && (
                    <div className="absolute right-2 top-1/2 -translate-y-1/2">
                      <div className="w-3 h-3 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                </div>
                {barcodeFlash === 'success' && barcodeMsg && (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1">
                    <CheckCircle size={11} /> {barcodeMsg}
                  </p>
                )}
                {barcodeFlash === 'error' && barcodeMsg && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1 flex items-center gap-1">
                    <AlertCircle size={11} /> {barcodeMsg}
                  </p>
                )}
              </div>
              <div>
                <label className="label dark:text-slate-300">New Quantity (set stock to) *</label>
                <input
                  required
                  type="number"
                  min="0"
                  value={stockAdjustForm.newQuantity}
                  onChange={e => setStockAdjustForm(p => ({ ...p, newQuantity: e.target.value }))}
                  className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                  placeholder="Enter the correct quantity"
                />
                {stockAdjustForm.newQuantity !== '' && (
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                    {Number(stockAdjustForm.newQuantity) > showStockAdjust.quantityInStock
                      ? `+${Number(stockAdjustForm.newQuantity) - showStockAdjust.quantityInStock} from current`
                      : Number(stockAdjustForm.newQuantity) < showStockAdjust.quantityInStock
                        ? `−${showStockAdjust.quantityInStock - Number(stockAdjustForm.newQuantity)} from current`
                        : 'No change from current'}
                  </p>
                )}
              </div>
              <div>
                <label className="label dark:text-slate-300">Reason *</label>
                <input
                  required
                  value={stockAdjustForm.reason}
                  onChange={e => setStockAdjustForm(p => ({ ...p, reason: e.target.value }))}
                  className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                  placeholder="e.g. Physical count, recount, reconciliation…"
                />
              </div>
              <div>
                <label className="label dark:text-slate-300">Notes</label>
                <textarea rows={2} value={stockAdjustForm.notes} onChange={e => setStockAdjustForm(p => ({ ...p, notes: e.target.value }))} className="input resize-none dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowStockAdjust(null)} className="flex-1 btn-secondary">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 btn-primary">{saving ? 'Saving...' : 'Set Stock Level'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* History Modal */}
      {showHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowHistory(null)} />
          <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl animate-fade-in border border-slate-100 dark:border-slate-700 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2"><History size={16} className="text-indigo-600" /> Movement History</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">{showHistory.productName}</p>
              </div>
              <button onClick={() => setShowHistory(null)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"><X size={16} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {historyLoading ? (
                <div className="flex items-center justify-center h-32"><div className="w-6 h-6 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>
              ) : history.movements.length === 0 ? (
                <p className="text-center text-slate-400 py-8">No movement history yet</p>
              ) : (
                <div className="space-y-2">
                  {history.movements.map((m: any) => (
                    <div key={m.id} className="flex items-start gap-3 p-3 rounded-xl border border-slate-100 dark:border-slate-700">
                      <div className={clsx('mt-0.5 flex-shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full', movementTypeColor(m.type))}>
                        {movementTypeLabel(m.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-sm font-semibold text-slate-900 dark:text-white">
                            {m.type === 'in' ? '+' : m.type === 'out' ? '-' : '='}{m.quantity}
                          </span>
                          {m.balance_after !== null && (
                            <span className="text-xs text-slate-400 dark:text-slate-500">Balance: {m.balance_after}</span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-x-3 mt-0.5">
                          {m.reason && <span className="text-xs text-slate-500 dark:text-slate-400">{m.reason}</span>}
                          {m.supplier_name && <span className="text-xs text-indigo-600 dark:text-indigo-400">{m.supplier_name}</span>}
                          {m.invoice_ref && <span className="text-xs text-slate-400 dark:text-slate-500">Ref: {m.invoice_ref}</span>}
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-xs text-slate-400 dark:text-slate-500">
                          <span>{m.created_by_name ?? 'System'}</span>
                          <span>·</span>
                          <span>{fmtDate(m.created_at)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {history.total > history.limit && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 dark:border-slate-700">
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Page {history.page} of {Math.ceil(history.total / history.limit)}
                </span>
                <div className="flex gap-2">
                  <button disabled={history.page <= 1} onClick={() => loadHistory(showHistory, history.page - 1)}
                    className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40">
                    <ChevronLeft size={14} />
                  </button>
                  <button disabled={history.page >= Math.ceil(history.total / history.limit)} onClick={() => loadHistory(showHistory, history.page + 1)}
                    className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40">
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
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
              <button onClick={() => setShowAddProduct(false)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"><X size={16} /></button>
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
                    {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
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
              <div>
                <label className="label dark:text-slate-300">Reorder Level</label>
                <input type="number" min="0" value={productForm.reorderLevel} onChange={e => setProductForm(p => ({ ...p, reorderLevel: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowAddProduct(false)} className="flex-1 btn-secondary">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 btn-primary">{saving ? 'Adding...' : 'Add Product'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Product Modal */}
      {showEditProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowEditProduct(null)} />
          <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md animate-fade-in border border-slate-100 dark:border-slate-700">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
              <h3 className="font-bold text-slate-900 dark:text-white">Edit Product</h3>
              <button onClick={() => setShowEditProduct(null)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"><X size={16} /></button>
            </div>
            <form onSubmit={handleEditProduct} className="p-5 space-y-4">
              <div>
                <label className="label dark:text-slate-300">Product Name *</label>
                <input required value={showEditProduct.productName} onChange={e => setShowEditProduct((p: any) => ({ ...p, productName: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
              </div>
              <div>
                <label className="label dark:text-slate-300">Category</label>
                <select value={showEditProduct.categoryId ?? ''} onChange={e => setShowEditProduct((p: any) => ({ ...p, categoryId: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                  <option value="">None</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label dark:text-slate-300">Selling Price</label>
                  <input type="number" step="0.01" value={showEditProduct.productPrice} onChange={e => setShowEditProduct((p: any) => ({ ...p, productPrice: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
                </div>
                <div>
                  <label className="label dark:text-slate-300">Cost Price</label>
                  <input type="number" step="0.01" value={showEditProduct.productCostPrice} onChange={e => setShowEditProduct((p: any) => ({ ...p, productCostPrice: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label dark:text-slate-300">Unit</label>
                  <select value={showEditProduct.productUnit} onChange={e => setShowEditProduct((p: any) => ({ ...p, productUnit: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                    {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label dark:text-slate-300">Reorder Level</label>
                  <input type="number" min="0" value={showEditProduct.reorderLevel} onChange={e => setShowEditProduct((p: any) => ({ ...p, reorderLevel: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
                </div>
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowEditProduct(null)} className="flex-1 btn-secondary">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 btn-primary">{saving ? 'Saving...' : 'Save Changes'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
