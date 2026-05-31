import { useEffect, useState } from 'react';
import { productsApi } from '../lib/api';
import { BookOpen, Search, Tag, Plus, X, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';

const fmt = (v: string | number) => `₵${Number(v).toLocaleString('en-GH', { minimumFractionDigits: 2 })}`;

const SUBJECTS = ['Mathematics', 'Science', 'English', 'Social Studies', 'ICT', 'French', 'History', 'Geography', 'Biology', 'Chemistry', 'Physics', 'Religious Studies', 'Creative Arts', 'Physical Education', 'Other'];
const LEVELS = ['Nursery', 'Kindergarten', 'Primary (1-3)', 'Primary (4-6)', 'JHS 1-3', 'SHS 1-3', 'University', 'Professional', 'General'];
const UNITS = ['piece', 'book', 'set', 'pack'];

export default function Bookstore() {
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterSubject, setFilterSubject] = useState('');
  const [filterLevel, setFilterLevel] = useState('');
  const [filterCategory, setFilterCategory] = useState<number | null>(null);
  const [showAddBook, setShowAddBook] = useState(false);
  const [showDetail, setShowDetail] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [bookForm, setBookForm] = useState({
    name: '', sku: '', price: '', costPrice: '', unit: 'book', categoryId: '', reorderLevel: '5',
    isbn: '', author: '', publisher: '', subject: '', educationalLevel: '', edition: '', description: '',
  });

  const load = () => {
    setLoading(true);
    Promise.all([productsApi.list(), productsApi.categories()])
      .then(([p, c]) => { setProducts(p); setCategories(c); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const filtered = products
    .filter(p => p.isActive)
    .filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.sku?.toLowerCase().includes(search.toLowerCase()) || p.author?.toLowerCase().includes(search.toLowerCase()))
    .filter(p => !filterSubject || p.subject === filterSubject)
    .filter(p => !filterLevel || p.educationalLevel === filterLevel)
    .filter(p => !filterCategory || p.categoryId === filterCategory);

  const lowStockCount = filtered.filter(p => p.quantityInStock !== null && p.quantityInStock <= (p.reorderLevel ?? 5) && p.quantityInStock > 0).length;
  const outOfStockCount = filtered.filter(p => p.quantityInStock === 0).length;

  const handleAddBook = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await productsApi.create({
        ...bookForm,
        categoryId: bookForm.categoryId ? Number(bookForm.categoryId) : undefined,
        reorderLevel: Number(bookForm.reorderLevel) || 5,
      });
      load();
      setShowAddBook(false);
      setBookForm({ name: '', sku: '', price: '', costPrice: '', unit: 'book', categoryId: '', reorderLevel: '5', isbn: '', author: '', publisher: '', subject: '', educationalLevel: '', edition: '', description: '' });
    } catch (err: any) { alert(err.message); }
    finally { setSaving(false); }
  };

  const activeSubjects = [...new Set(products.filter(p => p.subject).map(p => p.subject))];
  const activeLevels = [...new Set(products.filter(p => p.educationalLevel).map(p => p.educationalLevel))];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="page-title dark:text-white flex items-center gap-2">
            <BookOpen size={24} className="text-indigo-600" /> Bookstore Catalog
          </h1>
          <p className="page-subtitle dark:text-slate-400">
            {products.filter(p => p.isActive).length} active books · {categories.length} categories
            {lowStockCount > 0 && <span className="ml-2 inline-flex items-center gap-1 text-amber-600 dark:text-amber-400"><AlertTriangle size={12} />{lowStockCount} low stock</span>}
          </p>
        </div>
        <button onClick={() => setShowAddBook(true)} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Add Book
        </button>
      </div>

      {/* Low stock alert */}
      {(lowStockCount > 0 || outOfStockCount > 0) && (
        <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl">
          <AlertTriangle size={18} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <span className="font-semibold text-amber-800 dark:text-amber-300">
              {outOfStockCount > 0 && `${outOfStockCount} out of stock`}
              {outOfStockCount > 0 && lowStockCount > 0 && ', '}
              {lowStockCount > 0 && `${lowStockCount} low stock`}
            </span>
          </div>
        </div>
      )}

      {/* Search + Filters */}
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <div className="relative max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search title, author, SKU..." className="input pl-9 dark:bg-slate-800 dark:border-slate-600 dark:text-white dark:placeholder-slate-400" />
        </div>
        {activeSubjects.length > 0 && (
          <select value={filterSubject} onChange={e => setFilterSubject(e.target.value)} className="input max-w-xs dark:bg-slate-800 dark:border-slate-600 dark:text-white">
            <option value="">All Subjects</option>
            {activeSubjects.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        {activeLevels.length > 0 && (
          <select value={filterLevel} onChange={e => setFilterLevel(e.target.value)} className="input max-w-xs dark:bg-slate-800 dark:border-slate-600 dark:text-white">
            <option value="">All Levels</option>
            {activeLevels.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        )}
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setFilterCategory(null)} className={clsx('px-3 py-1.5 rounded-lg text-xs font-semibold transition-all', !filterCategory ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600')}>
            All
          </button>
          {categories.map(c => (
            <button key={c.id} onClick={() => setFilterCategory(c.id === filterCategory ? null : c.id)}
              className={clsx('px-3 py-1.5 rounded-lg text-xs font-semibold transition-all', filterCategory === c.id ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600')}>
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48"><div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400 dark:text-slate-500">No books found</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filtered.map(p => {
            const isLowStock = p.quantityInStock !== null && p.quantityInStock <= (p.reorderLevel ?? 5) && p.quantityInStock > 0;
            const isOutOfStock = p.quantityInStock === 0;
            return (
              <div key={p.id} onClick={() => setShowDetail(p)}
                className={clsx('card dark:bg-slate-800 dark:border-slate-700/50 hover:shadow-md transition-all group cursor-pointer', isOutOfStock && 'opacity-60')}>
                <div className="aspect-[3/4] bg-gradient-to-br from-indigo-50 to-indigo-100 dark:from-indigo-900/20 dark:to-indigo-900/10 rounded-xl mb-3 flex items-center justify-center group-hover:from-indigo-100 group-hover:to-indigo-200 dark:group-hover:from-indigo-900/30 dark:group-hover:to-indigo-900/20 transition-all relative overflow-hidden">
                  <BookOpen size={32} className="text-indigo-300 dark:text-indigo-600" />
                  {(isOutOfStock || isLowStock) && (
                    <div className={clsx('absolute top-2 right-2 w-2.5 h-2.5 rounded-full', isOutOfStock ? 'bg-red-500' : 'bg-amber-500')} />
                  )}
                </div>
                <h3 className="text-xs font-semibold text-slate-900 dark:text-white line-clamp-2 leading-snug">{p.name}</h3>
                {p.author && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">{p.author}</p>}
                <div className="mt-1 flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500">
                  <Tag size={10} /><span>{p.sku}</span>
                </div>
                {(p.subject || p.educationalLevel) && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {p.subject && <span className="text-xs bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded-md">{p.subject}</span>}
                    {p.educationalLevel && <span className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded-md">{p.educationalLevel}</span>}
                  </div>
                )}
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400">{fmt(p.price)}</span>
                  <span className={clsx('text-xs font-medium px-1.5 py-0.5 rounded-md', isOutOfStock ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' : isLowStock ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400')}>
                    {isOutOfStock ? 'Out' : `${p.quantityInStock ?? '?'} left`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Book Detail Modal */}
      {showDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowDetail(null)} />
          <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm animate-fade-in border border-slate-100 dark:border-slate-700">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
              <h3 className="font-bold text-slate-900 dark:text-white">Book Details</h3>
              <button onClick={() => setShowDetail(null)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"><X size={16} /></button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <div className="font-bold text-slate-900 dark:text-white text-base">{showDetail.name}</div>
                {showDetail.author && <div className="text-sm text-slate-500 dark:text-slate-400">by {showDetail.author}</div>}
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {showDetail.isbn && <div><span className="text-slate-400 dark:text-slate-500 text-xs">ISBN</span><div className="font-mono text-slate-700 dark:text-slate-200">{showDetail.isbn}</div></div>}
                {showDetail.publisher && <div><span className="text-slate-400 dark:text-slate-500 text-xs">Publisher</span><div className="text-slate-700 dark:text-slate-200">{showDetail.publisher}</div></div>}
                {showDetail.subject && <div><span className="text-slate-400 dark:text-slate-500 text-xs">Subject</span><div className="text-slate-700 dark:text-slate-200">{showDetail.subject}</div></div>}
                {showDetail.educationalLevel && <div><span className="text-slate-400 dark:text-slate-500 text-xs">Level</span><div className="text-slate-700 dark:text-slate-200">{showDetail.educationalLevel}</div></div>}
                {showDetail.edition && <div><span className="text-slate-400 dark:text-slate-500 text-xs">Edition</span><div className="text-slate-700 dark:text-slate-200">{showDetail.edition}</div></div>}
                <div><span className="text-slate-400 dark:text-slate-500 text-xs">SKU</span><div className="font-mono text-slate-700 dark:text-slate-200">{showDetail.sku}</div></div>
                <div><span className="text-slate-400 dark:text-slate-500 text-xs">Price</span><div className="font-bold text-indigo-600 dark:text-indigo-400">{fmt(showDetail.price)}</div></div>
                <div><span className="text-slate-400 dark:text-slate-500 text-xs">In Stock</span><div className={clsx('font-semibold', showDetail.quantityInStock === 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-700 dark:text-slate-200')}>{showDetail.quantityInStock ?? '?'}</div></div>
              </div>
              {showDetail.categoryName && (
                <div className="text-xs text-slate-400 dark:text-slate-500">Category: {showDetail.categoryName}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add Book Modal */}
      {showAddBook && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowAddBook(false)} />
          <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg animate-fade-in border border-slate-100 dark:border-slate-700 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700 sticky top-0 bg-white dark:bg-slate-800">
              <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2"><BookOpen size={16} className="text-indigo-600" /> Add Book / Product</h3>
              <button onClick={() => setShowAddBook(false)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"><X size={16} /></button>
            </div>
            <form onSubmit={handleAddBook} className="p-5 space-y-4">
              <div className="pb-2 border-b border-slate-100 dark:border-slate-700">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">Basic Info</p>
                <div className="space-y-3">
                  <div>
                    <label className="label dark:text-slate-300">Title / Product Name *</label>
                    <input required value={bookForm.name} onChange={e => setBookForm(p => ({ ...p, name: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label dark:text-slate-300">SKU *</label>
                      <input required value={bookForm.sku} onChange={e => setBookForm(p => ({ ...p, sku: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="BK-001" />
                    </div>
                    <div>
                      <label className="label dark:text-slate-300">Category</label>
                      <select value={bookForm.categoryId} onChange={e => setBookForm(p => ({ ...p, categoryId: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                        <option value="">None</option>
                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="label dark:text-slate-300">Price *</label>
                      <input required type="number" step="0.01" value={bookForm.price} onChange={e => setBookForm(p => ({ ...p, price: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="0.00" />
                    </div>
                    <div>
                      <label className="label dark:text-slate-300">Cost</label>
                      <input type="number" step="0.01" value={bookForm.costPrice} onChange={e => setBookForm(p => ({ ...p, costPrice: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="0.00" />
                    </div>
                    <div>
                      <label className="label dark:text-slate-300">Reorder At</label>
                      <input type="number" min="0" value={bookForm.reorderLevel} onChange={e => setBookForm(p => ({ ...p, reorderLevel: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">Book Details (optional)</p>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label dark:text-slate-300">Author</label>
                      <input value={bookForm.author} onChange={e => setBookForm(p => ({ ...p, author: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
                    </div>
                    <div>
                      <label className="label dark:text-slate-300">Publisher</label>
                      <input value={bookForm.publisher} onChange={e => setBookForm(p => ({ ...p, publisher: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label dark:text-slate-300">ISBN</label>
                      <input value={bookForm.isbn} onChange={e => setBookForm(p => ({ ...p, isbn: e.target.value }))} className="input font-mono dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="978-..." />
                    </div>
                    <div>
                      <label className="label dark:text-slate-300">Edition</label>
                      <input value={bookForm.edition} onChange={e => setBookForm(p => ({ ...p, edition: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="e.g. 3rd" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label dark:text-slate-300">Subject</label>
                      <select value={bookForm.subject} onChange={e => setBookForm(p => ({ ...p, subject: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                        <option value="">None</option>
                        {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="label dark:text-slate-300">Educational Level</label>
                      <select value={bookForm.educationalLevel} onChange={e => setBookForm(p => ({ ...p, educationalLevel: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                        <option value="">None</option>
                        {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowAddBook(false)} className="flex-1 btn-secondary">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 btn-primary">{saving ? 'Adding...' : 'Add to Catalog'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
