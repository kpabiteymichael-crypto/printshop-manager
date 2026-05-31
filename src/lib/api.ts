import axios, { AxiosError } from 'axios';

const BASE_URL = '/api';

const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('ps_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err: AxiosError<{ error?: string; message?: string }>) => {
    const url = err.config?.url || '';
    const isAuthEndpoint = /\/(login|logout)/.test(url);

    if (err.response?.status === 401 && !isAuthEndpoint) {
      localStorage.removeItem('ps_token');
      window.location.href = '/login';
      return Promise.reject(err);
    }

    const message =
      err.response?.data?.error ||
      err.response?.data?.message ||
      (err.code === 'ECONNABORTED' ? 'Request timed out. Please try again.' : null) ||
      (!err.response ? 'Network error. Check your connection.' : null) ||
      'An unexpected error occurred.';

    return Promise.reject(new Error(message));
  }
);

// ─── Auth ─────────────────────────────────────────────────
export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }).then(r => r.data),
  logout: () => api.post('/auth/logout').then(r => r.data),
  me: () => api.get('/auth/me').then(r => r.data),
  updateProfile: (data: { name?: string; email?: string; phone?: string; currentPassword?: string; newPassword?: string }) =>
    api.put('/auth/profile', data).then(r => r.data),
};

// ─── Dashboard ────────────────────────────────────────────
export const dashboardApi = {
  summary: () => api.get('/dashboard/summary').then(r => r.data),
};

// ─── POS ──────────────────────────────────────────────────
export const posApi = {
  products: (search?: string, categoryId?: number) =>
    api.get('/pos/products', { params: { ...(search ? { search } : {}), ...(categoryId ? { categoryId } : {}) } }).then(r => r.data),
  services: () => api.get('/pos/services').then(r => r.data),
  barcodeSearch: (sku: string) => api.get(`/pos/barcode/${encodeURIComponent(sku)}`).then(r => r.data),
  createSale: (data: object) => api.post('/pos/sale', data).then(r => r.data),
  getSales: (sessionId?: number, date?: string, filters?: { dateFrom?: string; dateTo?: string; paymentMethod?: string; cashierId?: number }) =>
    api.get('/pos/sales', { params: { ...(sessionId ? { sessionId } : {}), ...(date ? { date } : {}), ...filters } }).then(r => r.data),
  getSale: (id: number) => api.get(`/pos/sales/${id}`).then(r => r.data),
  getReceipt: (receiptNumber: string) => api.get(`/pos/receipt/${encodeURIComponent(receiptNumber)}`).then(r => r.data),
  refund: (saleId: number, itemIds: number[]) => api.post(`/pos/sales/${saleId}/refund`, { itemIds }).then(r => r.data),
};

// ─── Print Jobs ───────────────────────────────────────────
export const printJobsApi = {
  list: (params?: { status?: string; date?: string; operatorId?: number }) =>
    api.get('/print-jobs', { params: params ?? {} }).then(r => r.data),
  get: (id: number) => api.get(`/print-jobs/${id}`).then(r => r.data),
  create: (data: object) => api.post('/print-jobs', data).then(r => r.data),
  updateStatus: (id: number, status: string) => api.patch(`/print-jobs/${id}/status`, { status }).then(r => r.data),
  assign: (id: number, assignedTo: number | null) => api.patch(`/print-jobs/${id}/assign`, { assignedTo }).then(r => r.data),
  operators: () => api.get('/print-jobs/operators').then(r => r.data),
  delete: (id: number) => api.delete(`/print-jobs/${id}`).then(r => r.data),
  uploadFile: (id: number, data: { filename: string; fileData: string }) =>
    api.post(`/print-jobs/${id}/file`, data).then(r => r.data),
};

// ─── Inventory ────────────────────────────────────────────
export const inventoryApi = {
  list: (params?: { category?: number; lowStock?: boolean; outOfStock?: boolean }) =>
    api.get('/inventory', { params }).then(r => r.data),
  alerts: () => api.get('/inventory/alerts').then(r => r.data),
  lowStock: () => api.get('/inventory/low-stock').then(r => r.data),
  history: (id: number, page = 1, limit = 20) =>
    api.get(`/inventory/${id}/history`, { params: { page, limit } }).then(r => r.data),
  globalHistory: (page = 1, limit = 20, type?: string) =>
    api.get('/inventory/history', { params: { page, limit, ...(type ? { type } : {}) } }).then(r => r.data),
  stockIn: (data: { inventoryItemId: number; quantity: number; costPrice?: string; supplierId?: number; invoiceRef?: string; notes?: string }) =>
    api.post('/inventory/stock-in', data).then(r => r.data),
  stockOut: (data: { inventoryItemId: number; quantity: number; reason?: string; notes?: string }) =>
    api.post('/inventory/stock-out', data).then(r => r.data),
  adjust: (data: { inventoryItemId: number; type: string; quantity: number; reason?: string }) =>
    api.post('/inventory/adjust', data).then(r => r.data),
};

// ─── Products ─────────────────────────────────────────────
export const productsApi = {
  list: (search?: string) => api.get('/products', { params: search ? { search } : {} }).then(r => r.data),
  get: (id: number) => api.get(`/products/${id}`).then(r => r.data),
  create: (data: object) => api.post('/products', data).then(r => r.data),
  update: (id: number, data: object) => api.put(`/products/${id}`, data).then(r => r.data),
  delete: (id: number) => api.delete(`/products/${id}`).then(r => r.data),
  categories: () => api.get('/products/categories').then(r => r.data),
  services: () => api.get('/products/services').then(r => r.data),
};

// ─── Customers ────────────────────────────────────────────
export const customersApi = {
  list: (params?: { search?: string; type?: string }) => api.get('/customers', { params }).then(r => r.data),
  get: (id: number) => api.get(`/customers/${id}`).then(r => r.data),
  profile: (id: number) => api.get(`/customers/${id}/profile`).then(r => r.data),
  create: (data: object) => api.post('/customers', data).then(r => r.data),
  update: (id: number, data: object) => api.put(`/customers/${id}`, data).then(r => r.data),
  delete: (id: number) => api.delete(`/customers/${id}`).then(r => r.data),
};

// ─── Suppliers ────────────────────────────────────────────
export const suppliersApi = {
  list: () => api.get('/suppliers').then(r => r.data),
  get: (id: number) => api.get(`/suppliers/${id}`).then(r => r.data),
  create: (data: object) => api.post('/suppliers', data).then(r => r.data),
  update: (id: number, data: object) => api.put(`/suppliers/${id}`, data).then(r => r.data),
  delete: (id: number) => api.delete(`/suppliers/${id}`).then(r => r.data),
  orders: (id: number) => api.get(`/suppliers/${id}/orders`).then(r => r.data),
  purchaseOrders: () => api.get('/suppliers/purchase-orders').then(r => r.data),
  getPO: (id: number) => api.get(`/suppliers/purchase-orders/${id}`).then(r => r.data),
  createPO: (data: object) => api.post('/suppliers/purchase-orders', data).then(r => r.data),
  updatePOStatus: (id: number, status: string) => api.put(`/suppliers/purchase-orders/${id}/status`, { status }).then(r => r.data),
  receivePO: (id: number, lines?: Array<{ lineItemId: number; deliveredQuantity: number }>) =>
    api.put(`/suppliers/purchase-orders/${id}/receive`, { lines }).then(r => r.data),
};

// ─── Cash ─────────────────────────────────────────────────
export const cashApi = {
  sessions: () => api.get('/cash/sessions').then(r => r.data),
  currentSession: () => api.get('/cash/sessions/current').then(r => r.data),
  openSession: (data: { openingBalance: string; notes?: string }) =>
    api.post('/cash/sessions/open', data).then(r => r.data),
  closeSession: (id: number, data: { closingBalance: string; notes?: string }) =>
    api.post(`/cash/sessions/${id}/close`, data).then(r => r.data),
  sessionSummary: (id: number) => api.get(`/cash/sessions/${id}/summary`).then(r => r.data),
};

// ─── Expenses ─────────────────────────────────────────────
export const expensesApi = {
  list: (params?: { from?: string; to?: string; category?: string }) =>
    api.get('/expenses', { params }).then(r => r.data),
  categories: () => api.get('/expenses/categories').then(r => r.data),
  create: (data: object) => api.post('/expenses', data).then(r => r.data),
  delete: (id: number) => api.delete(`/expenses/${id}`).then(r => r.data),
};

// ─── Debts ────────────────────────────────────────────────
export const debtsApi = {
  list: (status?: string) => api.get('/debts', { params: status ? { status } : {} }).then(r => r.data),
  get: (id: number) => api.get(`/debts/${id}`).then(r => r.data),
  addPayment: (id: number, data: object) => api.post(`/debts/${id}/payments`, data).then(r => r.data),
};

// ─── Analytics ────────────────────────────────────────────
export const analyticsApi = {
  salesSummary: (period?: string) =>
    api.get('/analytics/sales-summary', { params: { period } }).then(r => r.data),
  revenueTrend: (days?: number) =>
    api.get('/analytics/revenue-trend', { params: { days } }).then(r => r.data),
  topProducts: (limit?: number, days?: number) =>
    api.get('/analytics/top-products', { params: { limit, days } }).then(r => r.data),
  topCustomers: (limit?: number, days?: number) =>
    api.get('/analytics/top-customers', { params: { limit, days } }).then(r => r.data),
  printStats: () => api.get('/analytics/print-stats').then(r => r.data),
  financialSummary: (months?: number) =>
    api.get('/analytics/financial-summary', { params: { months } }).then(r => r.data),
  insights: () => api.get('/analytics/insights').then(r => r.data),
};

// ─── Receipts ─────────────────────────────────────────────
export const receiptsApi = {
  list: () => api.get('/receipts').then(r => r.data),
  get: (id: number) => api.get(`/receipts/${id}`).then(r => r.data),
};

// ─── Quotations ───────────────────────────────────────────
export const quotationsApi = {
  list: () => api.get('/quotations').then(r => r.data),
  get: (id: number) => api.get(`/quotations/${id}`).then(r => r.data),
  create: (data: object) => api.post('/quotations', data).then(r => r.data),
  delete: (id: number) => api.delete(`/quotations/${id}`).then(r => r.data),
};

// ─── Invoices ─────────────────────────────────────────────
export const invoicesApi = {
  list: () => api.get('/invoices').then(r => r.data),
  get: (id: number) => api.get(`/invoices/${id}`).then(r => r.data),
  create: (data: object) => api.post('/invoices', data).then(r => r.data),
  updatePaymentStatus: (id: number, paymentStatus: string) =>
    api.patch(`/invoices/${id}/payment-status`, { paymentStatus }).then(r => r.data),
  delete: (id: number) => api.delete(`/invoices/${id}`).then(r => r.data),
};

// ─── Reports ──────────────────────────────────────────────
export const reportsApi = {
  salesSummary: (from?: string, to?: string) =>
    api.get('/reports/sales-summary', { params: { from, to } }).then(r => r.data),
  printJobsSummary: () => api.get('/reports/print-jobs-summary').then(r => r.data),
  generate: (type: string, from?: string, to?: string) =>
    api.get(`/reports/${type}`, { params: { from, to } }).then(r => r.data),
  exportUrl: (type: string, from?: string, to?: string, format: 'csv' | 'xlsx' = 'csv') =>
    `/api/reports/${type}/export?format=${format}${from ? `&from=${from}` : ''}${to ? `&to=${to}` : ''}`,
};

// ─── PDF ──────────────────────────────────────────────────
export const pdfApi = {
  receiptUrl: (id: number) => `/api/pdf/receipt/${id}`,
  quotationUrl: (id: number) => `/api/pdf/quotation/${id}`,
  invoiceUrl: (id: number) => `/api/pdf/invoice/${id}`,
  download: async (url: string, filename: string) => {
    const token = localStorage.getItem('ps_token');
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const blob = await response.blob();
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objUrl;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(objUrl);
  },
};

// ─── Settings ─────────────────────────────────────────────
export const settingsApi = {
  get: () => api.get('/settings').then(r => r.data),
  update: (data: Record<string, string>) => api.put('/settings', data).then(r => r.data),
  getStaff: () => api.get('/settings/staff').then(r => r.data),
  createStaff: (data: object) => api.post('/settings/staff', data).then(r => r.data),
  updateStaff: (id: number, data: object) => api.put(`/settings/staff/${id}`, data).then(r => r.data),
};

// ─── Notifications ────────────────────────────────────────
export const notificationsApi = {
  list: () => api.get('/notifications').then(r => r.data),
  markRead: (id: number) => api.patch(`/notifications/${id}/read`).then(r => r.data),
  markAllRead: () => api.patch('/notifications/read-all').then(r => r.data),
};

export default api;
