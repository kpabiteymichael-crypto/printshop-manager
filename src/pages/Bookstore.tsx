import { useEffect, useState } from 'react';
import { productsApi } from '../lib/api';
import { BookOpen, Search, Package, Tag } from 'lucide-react';
import clsx from 'clsx';

const php = (v: string | number) => `₱${Number(v).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;

export default function Bookstore() {
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([productsApi.list(), productsApi.categories()])
      .then(([p, c]) => { setProducts(p); setCategories(c); })
      .finally(() => setLoading(false));
  }, []);

  const filtered = products.filter(p => p.isActive)
    .filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.productSku?.toLowerCase().includes(search.toLowerCase()))
    .filter(p => !activeCategory || p.categoryId === activeCategory);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title dark:text-white flex items-center gap-2"><BookOpen size={24} className="text-indigo-600" /> Bookstore Catalog</h1>
        <p className="page-subtitle dark:text-slate-400">{products.filter(p => p.isActive).length} active products across {categories.length} categories</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products..." className="input pl-9 dark:bg-slate-800 dark:border-slate-600 dark:text-white dark:placeholder-slate-400" />
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setActiveCategory(null)} className={clsx('px-3 py-1.5 rounded-lg text-xs font-semibold transition-all', !activeCategory ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600')}>
            All
          </button>
          {categories.map(c => (
            <button key={c.id} onClick={() => setActiveCategory(c.id === activeCategory ? null : c.id)}
              className={clsx('px-3 py-1.5 rounded-lg text-xs font-semibold transition-all', activeCategory === c.id ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600')}>
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48"><div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <>
          {filtered.length === 0 ? (
            <div className="text-center py-16 text-slate-400 dark:text-slate-500">No products found</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {filtered.map(p => {
                const isLowStock = p.quantityInStock !== null && p.quantityInStock <= p.reorderLevel;
                const isOutOfStock = p.quantityInStock === 0;
                return (
                  <div key={p.id} className={clsx('card dark:bg-slate-800 dark:border-slate-700/50 hover:shadow-md transition-all group', isOutOfStock && 'opacity-60')}>
                    <div className="aspect-square bg-gradient-to-br from-indigo-50 to-indigo-100 dark:from-indigo-900/20 dark:to-indigo-900/10 rounded-xl mb-3 flex items-center justify-center group-hover:from-indigo-100 group-hover:to-indigo-200 dark:group-hover:from-indigo-900/30 dark:group-hover:to-indigo-900/20 transition-all">
                      <BookOpen size={28} className="text-indigo-400 dark:text-indigo-500" />
                    </div>
                    <h3 className="text-xs font-semibold text-slate-900 dark:text-white line-clamp-2 leading-snug">{p.name}</h3>
                    <div className="mt-1 flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500">
                      <Tag size={10} /><span>{p.productSku || p.sku}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400">{php(p.price)}</span>
                      <span className={clsx('text-xs font-medium px-1.5 py-0.5 rounded-md', isOutOfStock ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' : isLowStock ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400')}>
                        {isOutOfStock ? 'Out' : `${p.quantityInStock ?? '?'} left`}
                      </span>
                    </div>
                    {p.categoryName && <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">{p.categoryName}</div>}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
