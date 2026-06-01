import { useEffect, useState } from 'react';
import { settingsApi } from '../lib/api';
import { Settings as SettingsIcon, Save, CheckCircle, Star } from 'lucide-react';

export default function Settings() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { settingsApi.get().then(setSettings).finally(() => setLoading(false)); }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await settingsApi.update(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) { alert(err.message); }
    finally { setSaving(false); }
  };

  const set = (key: string, value: string) => setSettings(p => ({ ...p, [key]: value }));

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
              <label className="label dark:text-slate-300">Logo URL</label>
              <input value={settings.shop_logo ?? ''} onChange={e => set('shop_logo', e.target.value)} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="https://example.com/logo.png" />
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Paste a URL to your shop logo — it will appear on printed receipts and job sheets.</p>
              {settings.shop_logo && (
                <div className="mt-2 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg inline-flex items-center gap-3">
                  <img src={settings.shop_logo} alt="Logo preview" className="h-12 w-auto max-w-[120px] object-contain rounded" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  <span className="text-xs text-slate-500 dark:text-slate-400">Preview</span>
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

        <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2">
          <Save size={16} /> {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </form>
    </div>
  );
}
