import { useEffect, useRef, useState } from 'react';
import { settingsApi } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Settings as SettingsIcon, Save, CheckCircle, Star, Upload, X, Link, ShieldAlert } from 'lucide-react';

const RETENTION_OPTIONS = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: '180', label: '180 days' },
  { value: 'forever', label: 'Keep forever' },
];

export default function Settings() {
  const { user } = useAuth();
  const isOwner = user?.role === 'owner';
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [logoMode, setLogoMode] = useState<'upload' | 'url'>('upload');
  const [logoUploading, setLogoUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { settingsApi.get().then(setSettings).finally(() => setLoading(false)); }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await settingsApi.update(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      window.dispatchEvent(new CustomEvent('shop-settings-updated', {
        detail: { shop_logo: settings.shop_logo ?? '', shop_name: settings.shop_name ?? '' },
      }));
    } catch (err: any) { alert(err.message); }
    finally { setSaving(false); }
  };

  const set = (key: string, value: string) => setSettings(p => ({ ...p, [key]: value }));

  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const MAX_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      alert('Logo file must be 5 MB or smaller.');
      e.target.value = '';
      return;
    }

    const allowed = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'];
    if (!allowed.includes(file.type)) {
      alert('Only PNG, JPG, SVG, or WebP files are supported.');
      e.target.value = '';
      return;
    }

    setLogoUploading(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      set('shop_logo', dataUrl);
      setLogoUploading(false);
    };
    reader.onerror = () => {
      alert('Failed to read file. Please try again.');
      setLogoUploading(false);
    };
    reader.readAsDataURL(file);
  };

  if (loading) return (
    <div className="flex items-center justify-center h-48"><div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>
  );

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="page-title dark:text-white flex items-center gap-2"><SettingsIcon size={24} className="text-indigo-600" /> Settings</h1>
        <p className="page-subtitle dark:text-slate-400">Configure your PrintShop Manager</p>
      </div>

      {saved && (
        <div className="flex items-center gap-2 p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl text-emerald-700 dark:text-emerald-400 text-sm font-medium">
          <CheckCircle size={16} /> Settings saved successfully
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        <div className="card dark:bg-slate-800 dark:border-slate-700/50">
          <h2 className="section-title dark:text-white mb-4">Shop Information</h2>
          <div className="space-y-4">
            <div>
              <label className="label dark:text-slate-300">Shop Name</label>
              <input value={settings.shop_name ?? ''} onChange={e => set('shop_name', e.target.value)} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="PrintShop Manager" />
            </div>
            <div>
              <label className="label dark:text-slate-300">Address</label>
              <textarea rows={2} value={settings.shop_address ?? ''} onChange={e => set('shop_address', e.target.value)} className="input resize-none dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="123 Print Street, Manila, Philippines" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label dark:text-slate-300">Phone</label>
                <input value={settings.shop_phone ?? ''} onChange={e => set('shop_phone', e.target.value)} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="+63 2 888 0000" />
              </div>
              <div>
                <label className="label dark:text-slate-300">Email</label>
                <input type="email" value={settings.shop_email ?? ''} onChange={e => set('shop_email', e.target.value)} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="info@printshop.ph" />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="label dark:text-slate-300 mb-0">Shop Logo</label>
                <div className="flex rounded-lg overflow-hidden border border-slate-200 dark:border-slate-600 text-xs">
                  <button
                    type="button"
                    onClick={() => setLogoMode('upload')}
                    className={`flex items-center gap-1 px-2.5 py-1 transition-colors ${logoMode === 'upload' ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600'}`}
                  >
                    <Upload size={11} /> Upload
                  </button>
                  <button
                    type="button"
                    onClick={() => setLogoMode('url')}
                    className={`flex items-center gap-1 px-2.5 py-1 transition-colors ${logoMode === 'url' ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600'}`}
                  >
                    <Link size={11} /> URL
                  </button>
                </div>
              </div>

              {logoMode === 'upload' ? (
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml,image/webp"
                    className="hidden"
                    onChange={handleLogoFileChange}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={logoUploading}
                    className="flex items-center gap-2 px-4 py-2 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl text-sm text-slate-600 dark:text-slate-300 hover:border-indigo-400 dark:hover:border-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors disabled:opacity-50"
                  >
                    {logoUploading ? (
                      <><div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" /> Reading file…</>
                    ) : (
                      <><Upload size={15} /> Choose file (PNG, JPG, SVG, WebP — max 5 MB)</>
                    )}
                  </button>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Appears on printed receipts, job sheets, and PDFs.</p>
                </div>
              ) : (
                <div>
                  <input
                    value={settings.shop_logo?.startsWith('data:') ? '' : (settings.shop_logo ?? '')}
                    onChange={e => set('shop_logo', e.target.value)}
                    className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                    placeholder="https://example.com/logo.png"
                  />
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Paste a publicly accessible URL to your logo.</p>
                </div>
              )}

              {settings.shop_logo && (
                <div className="mt-3 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl flex items-center gap-3">
                  <img
                    src={settings.shop_logo}
                    alt="Logo preview"
                    className="h-14 w-auto max-w-[140px] object-contain rounded"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-200">Preview</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 truncate">
                      {settings.shop_logo.startsWith('data:') ? 'Uploaded file (stored as data URL)' : settings.shop_logo}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { set('shop_logo', ''); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                    className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    title="Remove logo"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="card dark:bg-slate-800 dark:border-slate-700/50">
          <h2 className="section-title dark:text-white mb-4">Financial Settings</h2>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label dark:text-slate-300">Currency</label>
                <select
                  value={settings.currency ?? 'GHS'}
                  onChange={e => {
                    const symbols: Record<string, string> = {
                      GHS: 'GH₵', USD: '$', EUR: '€', GBP: '£', NGN: '₦',
                      KES: 'KSh', ZAR: 'R', PHP: '₱', SGD: 'S$',
                    };
                    set('currency', e.target.value);
                    set('currency_symbol', symbols[e.target.value] ?? e.target.value);
                  }}
                  className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                >
                  <option value="GHS">GHS — Ghana Cedi (GH₵)</option>
                  <option value="USD">USD — US Dollar ($)</option>
                  <option value="EUR">EUR — Euro (€)</option>
                  <option value="GBP">GBP — British Pound (£)</option>
                  <option value="NGN">NGN — Nigerian Naira (₦)</option>
                  <option value="KES">KES — Kenyan Shilling (KSh)</option>
                  <option value="ZAR">ZAR — South African Rand (R)</option>
                  <option value="PHP">PHP — Philippine Peso (₱)</option>
                  <option value="SGD">SGD — Singapore Dollar (S$)</option>
                </select>
              </div>
              <div>
                <label className="label dark:text-slate-300">Currency Symbol</label>
                <input
                  type="text"
                  value={settings.currency_symbol ?? 'GH₵'}
                  onChange={e => set('currency_symbol', e.target.value)}
                  className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                  placeholder="GH₵"
                  maxLength={6}
                />
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Shown on receipts, invoices, and reports</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label dark:text-slate-300">VAT / Tax Rate (%)</label>
                <input type="number" step="0.01" min="0" max="100" value={settings.tax_rate ?? '0'} onChange={e => set('tax_rate', e.target.value)} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="0" />
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Ghana standard VAT is 15% (NHIL + GETFund inclusive)</p>
              </div>
              <div>
                <label className="label dark:text-slate-300">VAT Registration No.</label>
                <input type="text" value={settings.vat_number ?? ''} onChange={e => set('vat_number', e.target.value)} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="e.g. V0012345678" />
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Printed on receipts and invoices if set</p>
              </div>
            </div>
          </div>
        </div>

        <div className="card dark:bg-slate-800 dark:border-slate-700/50">
          <h2 className="section-title dark:text-white mb-4">Receipt Settings</h2>
          <div>
            <label className="label dark:text-slate-300">Receipt Footer Message</label>
            <textarea rows={3} value={settings.receipt_footer ?? ''} onChange={e => set('receipt_footer', e.target.value)} className="input resize-none dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="Thank you for your business! Come again." />
          </div>
        </div>

        <div className="card dark:bg-slate-800 dark:border-slate-700/50">
          <h2 className="section-title dark:text-white mb-1 flex items-center gap-2"><Star size={16} className="text-amber-500" /> Loyalty Programme</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">Configure how customers earn and redeem loyalty points.</p>
          <div className="space-y-4">
            <div className="flex items-center justify-between py-2">
              <div>
                <div className="text-sm font-semibold text-slate-800 dark:text-white">Enable Loyalty Programme</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Award points automatically on every paid sale</div>
              </div>
              <button
                type="button"
                onClick={() => set('loyalty_enabled', (settings.loyalty_enabled ?? 'true') === 'false' ? 'true' : 'false')}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${(settings.loyalty_enabled ?? 'true') !== 'false' ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-600'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${(settings.loyalty_enabled ?? 'true') !== 'false' ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label dark:text-slate-300">Points per GH₵1 spent</label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="100"
                  value={settings.loyalty_earn_rate ?? '1'}
                  onChange={e => set('loyalty_earn_rate', e.target.value)}
                  className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                  placeholder="1"
                />
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">e.g. 1 = earn 1 point per GH₵1 spent</p>
              </div>
              <div>
                <label className="label dark:text-slate-300">Points needed per GH₵1 discount</label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  value={settings.loyalty_points_per_cedis ?? '100'}
                  onChange={e => set('loyalty_points_per_cedis', e.target.value)}
                  className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                  placeholder="100"
                />
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">e.g. 100 = 100 pts gives GH₵1 off</p>
              </div>
            </div>
            <div>
              <label className="label dark:text-slate-300">Minimum points to redeem</label>
              <input
                type="number"
                step="1"
                min="1"
                value={settings.loyalty_min_redeem ?? '100'}
                onChange={e => set('loyalty_min_redeem', e.target.value)}
                className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white max-w-48"
                placeholder="100"
              />
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Customer must have at least this many points to redeem</p>
            </div>
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 text-xs text-amber-700 dark:text-amber-300">
              <strong>Example:</strong> With earn rate = 1 and 100 pts = GH₵1 — a GH₵50 sale earns 50 pts worth GH₵0.50.
            </div>
          </div>
        </div>

        {isOwner && (
          <div className="card dark:bg-slate-800 dark:border-slate-700/50">
            <h2 className="section-title dark:text-white mb-1 flex items-center gap-2">
              <ShieldAlert size={16} className="text-red-500" /> Security Events Retention
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Automatically delete unauthorized access log entries older than the chosen period. Old entries are pruned each time the security events list is loaded.
            </p>
            <div>
              <label className="label dark:text-slate-300">Retention Period</label>
              <select
                value={settings.security_events_retention_days ?? 'forever'}
                onChange={e => set('security_events_retention_days', e.target.value)}
                className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white max-w-xs"
              >
                {RETENTION_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                {(settings.security_events_retention_days ?? 'forever') === 'forever'
                  ? 'Security events are kept indefinitely until manually cleared.'
                  : `Security events older than ${RETENTION_OPTIONS.find(o => o.value === settings.security_events_retention_days)?.label} will be removed automatically.`}
              </p>
            </div>
          </div>
        )}

        <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2">
          <Save size={16} /> {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </form>
    </div>
  );
}
