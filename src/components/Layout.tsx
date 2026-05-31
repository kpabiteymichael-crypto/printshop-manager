import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useOnline } from '../hooks/useOnline';
import { useState, useEffect } from 'react';
import { notificationsApi, authApi, inventoryApi } from '../lib/api';
import {
  LayoutDashboard, ShoppingCart, Printer, Package, BookOpen,
  Users, Truck, Wallet, Receipt, BarChart3, UserCog, Settings,
  CreditCard, Bell, LogOut, Menu, X, Sun, Moon, Wifi, WifiOff,
  ChevronRight, ChevronLeft, AlertCircle, CheckCircle, Eye, EyeOff,
  AlertTriangle, FileText, BookMarked, ShoppingBag,
} from 'lucide-react';
import clsx from 'clsx';

interface NavItem {
  label: string;
  to: string;
  icon: React.ReactNode;
  roles: string[];
}

const navItems: NavItem[] = [
  { label: 'Dashboard',   to: '/dashboard',  icon: <LayoutDashboard size={18} />, roles: ['owner', 'manager'] },
  { label: 'POS',         to: '/pos',        icon: <ShoppingCart size={18} />,    roles: ['owner', 'manager', 'cashier'] },
  { label: 'Print Jobs',  to: '/print-jobs', icon: <Printer size={18} />,         roles: ['owner', 'manager', 'print_operator', 'cashier'] },
  { label: 'Inventory',   to: '/inventory',  icon: <Package size={18} />,         roles: ['owner', 'manager', 'inventory_officer'] },
  { label: 'Bookstore',   to: '/bookstore',  icon: <BookOpen size={18} />,        roles: ['owner', 'manager', 'inventory_officer', 'cashier'] },
  { label: 'Customers',   to: '/customers',  icon: <Users size={18} />,           roles: ['owner', 'manager', 'cashier'] },
  { label: 'Suppliers',   to: '/suppliers',  icon: <Truck size={18} />,           roles: ['owner', 'manager', 'inventory_officer'] },
  { label: 'Cash',        to: '/cash',       icon: <Wallet size={18} />,          roles: ['owner', 'manager', 'cashier'] },
  { label: 'Expenses',    to: '/expenses',   icon: <Receipt size={18} />,         roles: ['owner', 'manager', 'cashier'] },
  { label: 'Debts',       to: '/debts',      icon: <CreditCard size={18} />,      roles: ['owner', 'manager', 'cashier'] },
  { label: 'Sales History', to: '/sales',     icon: <ShoppingBag size={18} />,     roles: ['owner', 'manager', 'cashier'] },
  { label: 'Receipts',    to: '/receipts',   icon: <BookMarked size={18} />,      roles: ['owner', 'manager', 'cashier'] },
  { label: 'Quotations',  to: '/quotations', icon: <FileText size={18} />,        roles: ['owner', 'manager', 'cashier'] },
  { label: 'Invoices',    to: '/invoices',   icon: <FileText size={18} />,        roles: ['owner', 'manager', 'cashier'] },
  { label: 'Reports',     to: '/reports',    icon: <BarChart3 size={18} />,       roles: ['owner', 'manager'] },
  { label: 'Staff',       to: '/staff',      icon: <UserCog size={18} />,         roles: ['owner'] },
  { label: 'Settings',    to: '/settings',   icon: <Settings size={18} />,        roles: ['owner', 'manager'] },
];

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  manager: 'Manager',
  cashier: 'Cashier',
  print_operator: 'Print Operator',
  inventory_officer: 'Inv. Officer',
};

const ROLE_COLORS: Record<string, string> = {
  owner: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  manager: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  cashier: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  print_operator: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  inventory_officer: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
};

export default function Layout() {
  const { user, logout, updateUser } = useAuth();
  const { toggleTheme, isDark } = useTheme();
  const isOnline = useOnline();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotifs, setShowNotifs] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({ name: '', email: '', phone: '', currentPassword: '', newPassword: '', confirmPassword: '' });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileToast, setProfileToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [showPw, setShowPw] = useState(false);
  const [offlineBanner, setOfflineBanner] = useState(false);
  const [lowStockAlerts, setLowStockAlerts] = useState<any[]>([]);
  const [showLowStockBanner, setShowLowStockBanner] = useState(false);
  const [lowStockDismissed, setLowStockDismissed] = useState(false);

  useEffect(() => {
    notificationsApi.list().then(setNotifications).catch(() => {});
  }, []);

  useEffect(() => {
    if (!user || !['owner', 'manager', 'inventory_officer'].includes(user.role)) return;
    inventoryApi.alerts().then((items: any[]) => {
      setLowStockAlerts(items);
      if (items.length > 0 && !lowStockDismissed) setShowLowStockBanner(true);
    }).catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!isOnline) {
      setOfflineBanner(true);
    } else {
      const t = setTimeout(() => setOfflineBanner(false), 3000);
      return () => clearTimeout(t);
    }
  }, [isOnline]);

  const unreadCount = notifications.filter(n => !n.isRead).length;
  const userNav = navItems.filter(n => user && n.roles.includes(user.role));

  const handleLogout = () => { logout(); navigate('/login'); };

  const openProfile = () => {
    setProfileForm({ name: user?.name ?? '', email: user?.email ?? '', phone: user?.phone ?? '', currentPassword: '', newPassword: '', confirmPassword: '' });
    setProfileToast(null);
    setShowProfile(true);
  };

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (profileForm.newPassword && profileForm.newPassword !== profileForm.confirmPassword) {
      setProfileToast({ type: 'error', message: 'New passwords do not match' });
      return;
    }
    setProfileSaving(true);
    setProfileToast(null);
    try {
      const payload: any = {};
      if (profileForm.name.trim() !== user?.name) payload.name = profileForm.name.trim();
      if (profileForm.email.trim() !== user?.email) payload.email = profileForm.email.trim();
      if (profileForm.phone.trim() !== (user?.phone ?? '')) payload.phone = profileForm.phone.trim();
      if (profileForm.newPassword) {
        payload.currentPassword = profileForm.currentPassword;
        payload.newPassword = profileForm.newPassword;
      } else if (payload.email) {
        payload.currentPassword = profileForm.currentPassword;
      }
      if (Object.keys(payload).length === 0) {
        setProfileToast({ type: 'error', message: 'No changes to save' });
        return;
      }
      const result = await authApi.updateProfile(payload);
      updateUser(result.user, result.token);
      setProfileToast({ type: 'success', message: 'Profile updated successfully' });
      setProfileForm(p => ({ ...p, currentPassword: '', newPassword: '', confirmPassword: '' }));
    } catch (err: any) {
      setProfileToast({ type: 'error', message: err.message ?? 'Failed to update profile' });
    } finally {
      setProfileSaving(false);
    }
  };

  const SidebarContent = ({ mobile = false }: { mobile?: boolean }) => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className={clsx('flex items-center border-b border-slate-100 dark:border-slate-700/50', collapsed && !mobile ? 'px-3 py-4 justify-center' : 'px-4 py-4 gap-3')}>
        <div className="w-9 h-9 bg-gradient-to-br from-indigo-600 to-indigo-700 rounded-xl flex items-center justify-center shadow-md shadow-indigo-200 dark:shadow-indigo-900/40 flex-shrink-0">
          <Printer size={18} className="text-white" />
        </div>
        {(!collapsed || mobile) && (
          <div>
            <div className="font-bold text-slate-900 dark:text-white text-sm leading-tight">PrintShop</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Manager</div>
          </div>
        )}
      </div>

      {/* User badge */}
      {(!collapsed || mobile) && (
        <div className="px-3 py-3 border-b border-slate-100 dark:border-slate-700/50">
          <div className="flex items-center gap-2.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl px-3 py-2.5">
            <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
              {user?.name?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">{user?.name}</div>
              <span className={clsx('inline-flex items-center px-1.5 py-0.5 rounded-md text-xs font-semibold mt-0.5', user?.role ? ROLE_COLORS[user.role] : '')}>
                {user?.role ? ROLE_LABELS[user.role] : ''}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {userNav.map(item => {
          const isInventory = item.to === '/inventory';
          const badge = isInventory && lowStockAlerts.length > 0 ? lowStockAlerts.length : 0;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setMobileOpen(false)}
              title={collapsed && !mobile ? item.label : undefined}
              className={({ isActive }) => clsx(
                'flex items-center rounded-xl text-sm font-medium transition-all duration-150 group relative',
                collapsed && !mobile ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5',
                isActive
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200 dark:shadow-indigo-900/40'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/60 hover:text-slate-900 dark:hover:text-white'
              )}
            >
              <span className="flex-shrink-0 relative">
                {item.icon}
                {badge > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-amber-500 rounded-full text-white text-[9px] flex items-center justify-center font-bold leading-none">
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
              </span>
              {(!collapsed || mobile) && <span>{item.label}</span>}
              {(!collapsed || mobile) && badge > 0 && (
                <span className="ml-auto text-[10px] font-bold bg-amber-500 text-white px-1.5 py-0.5 rounded-full">{badge}</span>
              )}
              {(!collapsed || mobile) && badge === 0 && (
                <ChevronRight size={13} className="ml-auto opacity-0 group-hover:opacity-40 transition-opacity" />
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="px-2 py-3 border-t border-slate-100 dark:border-slate-700/50">
        <button
          onClick={handleLogout}
          title={collapsed && !mobile ? 'Sign Out' : undefined}
          className={clsx(
            'flex items-center w-full rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 transition-all',
            collapsed && !mobile ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5'
          )}
        >
          <LogOut size={18} />
          {(!collapsed || mobile) && <span>Sign Out</span>}
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 overflow-hidden transition-colors duration-200">
      {/* Desktop Sidebar */}
      <aside className={clsx(
        'hidden lg:flex flex-col bg-white dark:bg-slate-850 border-r border-slate-100 dark:border-slate-700/50 shadow-sm flex-shrink-0 transition-all duration-200',
        collapsed ? 'w-16' : 'w-60'
      )} style={{ backgroundColor: isDark ? '#1a2035' : undefined }}>
        <SidebarContent />
        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(c => !c)}
          className="absolute left-full top-20 -translate-x-1/2 w-5 h-5 rounded-full bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 shadow-sm flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors z-10"
          style={{ marginLeft: collapsed ? '2rem' : '15rem' }}
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-64 bg-white dark:border-r dark:border-slate-700/50 shadow-2xl animate-slide-in" style={{ backgroundColor: isDark ? '#1a2035' : undefined }}>
            <div className="flex justify-end px-3 pt-3">
              <button onClick={() => setMobileOpen(false)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700">
                <X size={18} />
              </button>
            </div>
            <SidebarContent mobile />
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Low stock banner */}
        {showLowStockBanner && lowStockAlerts.length > 0 && (
          <div className="flex items-center justify-between gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800">
            <div className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-300">
              <AlertTriangle size={15} className="text-amber-600 dark:text-amber-400 flex-shrink-0" />
              <span className="font-semibold">{lowStockAlerts.length} item{lowStockAlerts.length > 1 ? 's' : ''} at or below reorder level:</span>
              <span className="text-amber-700 dark:text-amber-400 truncate hidden sm:inline">{lowStockAlerts.slice(0, 3).map((i: any) => i.productName).join(', ')}{lowStockAlerts.length > 3 ? ` +${lowStockAlerts.length - 3} more` : ''}</span>
            </div>
            <button onClick={() => { setShowLowStockBanner(false); setLowStockDismissed(true); }} className="flex-shrink-0 p-1 rounded-lg text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40">
              <X size={14} />
            </button>
          </div>
        )}

        {/* Offline banner */}
        {(offlineBanner || !isOnline) && (
          <div className={clsx(
            'flex items-center justify-center gap-2 py-1.5 text-xs font-semibold transition-all',
            !isOnline
              ? 'bg-red-500 text-white'
              : 'bg-emerald-500 text-white'
          )}>
            {!isOnline ? (
              <><WifiOff size={13} /> You are offline — some features may not work</>
            ) : (
              <><Wifi size={13} /> Back online</>
            )}
          </div>
        )}

        {/* Top bar */}
        <header className="bg-white dark:bg-slate-850 border-b border-slate-100 dark:border-slate-700/50 px-4 py-3 flex items-center gap-3 shadow-sm flex-shrink-0 z-10" style={{ backgroundColor: isDark ? '#1a2035' : undefined }}>
          <button
            onClick={() => setMobileOpen(true)}
            className="lg:hidden p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            <Menu size={20} />
          </button>

          {/* Page title area */}
          <div className="flex-1" />

          {/* Online indicator */}
          <div className={clsx('hidden sm:flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full', isOnline ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400' : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400')}>
            <div className={clsx('w-1.5 h-1.5 rounded-full', isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-red-500')} />
            {isOnline ? 'Online' : 'Offline'}
          </div>

          {/* Dark mode toggle */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          {/* Notifications */}
          <div className="relative">
            <button
              onClick={() => { setShowNotifs(v => !v); setShowProfile(false); }}
              className="relative p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              <Bell size={18} />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 rounded-full text-white text-xs flex items-center justify-center font-bold leading-none">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {showNotifs && (
              <div className="absolute right-0 top-11 w-80 bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-700 z-50 overflow-hidden animate-fade-in">
                <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
                  <span className="font-semibold text-slate-900 dark:text-white text-sm">Notifications</span>
                  {unreadCount > 0 && (
                    <button onClick={() => {
                      notificationsApi.markAllRead();
                      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
                    }} className="text-xs text-indigo-600 dark:text-indigo-400 font-medium hover:underline">
                      Mark all read
                    </button>
                  )}
                </div>
                <div className="max-h-72 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="py-8 text-center text-slate-400 text-sm">No notifications</div>
                  ) : notifications.map(n => (
                    <div
                      key={n.id}
                      onClick={() => { notificationsApi.markRead(n.id); setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, isRead: true } : x)); }}
                      className={clsx('px-4 py-3 border-b border-slate-50 dark:border-slate-700/50 last:border-0 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors', !n.isRead && 'bg-indigo-50/60 dark:bg-indigo-900/10')}
                    >
                      <div className="text-sm font-semibold text-slate-900 dark:text-white">{n.title}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{n.message}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* User avatar */}
          <button
            onClick={() => { openProfile(); setShowNotifs(false); }}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity ml-1"
          >
            <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-sm">
              {user?.name?.charAt(0).toUpperCase()}
            </div>
            <div className="hidden sm:block text-left">
              <div className="text-sm font-semibold text-slate-900 dark:text-white leading-tight">{user?.name}</div>
              <div className="text-xs text-slate-400 dark:text-slate-500">{user?.role ? ROLE_LABELS[user.role] : ''}</div>
            </div>
          </button>
        </header>

        {/* Profile modal */}
        {showProfile && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowProfile(false)} />
            <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md animate-fade-in border border-slate-100 dark:border-slate-700">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-700">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Edit Profile</h3>
                <button onClick={() => setShowProfile(false)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700">
                  <X size={18} />
                </button>
              </div>
              <form onSubmit={handleProfileSave} className="p-6 space-y-4">
                {profileToast && (
                  <div className={clsx('flex items-center gap-2 p-3 rounded-xl text-sm font-medium', profileToast.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800')}>
                    {profileToast.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                    {profileToast.message}
                  </div>
                )}
                <div>
                  <label className="label dark:text-slate-300">Display Name</label>
                  <input type="text" value={profileForm.name} onChange={e => setProfileForm(p => ({ ...p, name: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" required minLength={2} />
                </div>
                <div>
                  <label className="label dark:text-slate-300">Email</label>
                  <input type="email" value={profileForm.email} onChange={e => setProfileForm(p => ({ ...p, email: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" required />
                </div>
                <div>
                  <label className="label dark:text-slate-300">Phone</label>
                  <input type="tel" value={profileForm.phone} onChange={e => setProfileForm(p => ({ ...p, phone: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="+63 9XX XXX XXXX" />
                </div>
                <div className="border-t border-slate-100 dark:border-slate-700 pt-4 space-y-3">
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Change Password</p>
                  <div>
                    <label className="label dark:text-slate-300">Current Password</label>
                    <div className="relative">
                      <input type={showPw ? 'text' : 'password'} value={profileForm.currentPassword} onChange={e => setProfileForm(p => ({ ...p, currentPassword: e.target.value }))} className="input pr-10 dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="Required to change email or password" autoComplete="current-password" />
                      <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                        {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="label dark:text-slate-300">New Password</label>
                    <input type={showPw ? 'text' : 'password'} value={profileForm.newPassword} onChange={e => setProfileForm(p => ({ ...p, newPassword: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="Leave blank to keep current" minLength={6} autoComplete="new-password" />
                  </div>
                  {profileForm.newPassword && (
                    <div>
                      <label className="label dark:text-slate-300">Confirm New Password</label>
                      <input type={showPw ? 'text' : 'password'} value={profileForm.confirmPassword} onChange={e => setProfileForm(p => ({ ...p, confirmPassword: e.target.value }))} className="input dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="Repeat new password" autoComplete="new-password" />
                    </div>
                  )}
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setShowProfile(false)} className="flex-1 btn-secondary dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600">Cancel</button>
                  <button type="submit" disabled={profileSaving} className="flex-1 btn-primary">
                    {profileSaving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6 pb-20 lg:pb-6">
          <Outlet />
        </main>

        {/* Mobile bottom nav */}
        <nav className="lg:hidden fixed bottom-0 inset-x-0 bg-white dark:bg-slate-850 border-t border-slate-100 dark:border-slate-700/50 flex items-center justify-around px-2 py-2 z-40 bottom-nav-safe" style={{ backgroundColor: isDark ? '#1a2035' : undefined }}>
          {userNav.slice(0, 5).map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => clsx(
                'flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl transition-all min-w-0 flex-1',
                isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400'
              )}
            >
              {item.icon}
              <span className="text-[10px] font-medium truncate">{item.label}</span>
            </NavLink>
          ))}
          {userNav.length > 5 && (
            <button
              onClick={() => setMobileOpen(true)}
              className="flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl text-slate-500 dark:text-slate-400 flex-1"
            >
              <Menu size={18} />
              <span className="text-[10px] font-medium">More</span>
            </button>
          )}
        </nav>
      </div>
    </div>
  );
}
