import { useEffect, useState } from 'react';
import { settingsApi } from '../lib/api';
import { Settings as SettingsIcon, Save, CheckCircle } from 'lucide-react';

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
          </div>
        </div>

        <div className="card dark:bg-slate-800 dark:border-slate-700/50">
          <h2 className="section-title dark:text-white mb-4">Financial Settings</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label dark:text-slate-300">Currency</label>
              <select value={settings.currency ?? 'PHP'} onChange={e => set('currency', e.target.value)} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                <option value="PHP">PHP — Philippine Peso (₱)</option>
                <option value="USD">USD — US Dollar ($)</option>
                <option value="SGD">SGD — Singapore Dollar (S$)</option>
              </select>
            </div>
            <div>
              <label className="label dark:text-slate-300">Tax Rate (%)</label>
              <input type="number" step="0.01" min="0" max="100" value={settings.tax_rate ?? '0'} onChange={e => set('tax_rate', e.target.value)} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="0" />
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

        <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2">
          <Save size={16} /> {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </form>
    </div>
  );
}
