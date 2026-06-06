import axios from 'axios';
import { ElMessage } from 'element-plus';
import router from '../router';

const request = axios.create({
  baseURL: '/api',
  timeout: 30000,
});

request.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

request.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      ElMessage.error('登录已过期，请重新登录');
      router.push('/login');
    } else if (error.response?.data?.message) {
      ElMessage.error(error.response.data.message);
    } else {
      ElMessage.error('请求失败，请稍后重试');
    }
    return Promise.reject(error);
  }
);

export const authApi = {
  login: (data) => request.post('/auth/login', data),
  getCurrentUser: () => request.get('/auth/me'),
  changePassword: (data) => request.post('/auth/change-password', data),
};

export const dashboardApi = {
  getStats: () => request.get('/dashboard/stats'),
  getCallTrend: (params) => request.get('/dashboard/call-trend', { params }),
  getTopTenants: (params) => request.get('/dashboard/top-tenants', { params }),
  getRevenueTrend: (params) => request.get('/dashboard/revenue-trend', { params }),
  getApiRanking: (params) => request.get('/dashboard/api-ranking', { params }),
};

export const tenantApi = {
  getList: (params) => request.get('/tenants', { params }),
  getDetail: (id) => request.get(`/tenants/${id}`),
  create: (data) => request.post('/tenants', data),
  update: (id, data) => request.put(`/tenants/${id}`, data),
  toggleStatus: (id) => request.post(`/tenants/${id}/toggle-status`),
  getQuotas: (id, params) => request.get(`/tenants/${id}/quotas`, { params }),
  createQuota: (id, data) => request.post(`/tenants/${id}/quotas`, data),
  updateQuota: (id, quotaId, data) => request.put(`/tenants/${id}/quotas/${quotaId}`, data),
};

export const ruleApi = {
  getList: (params) => request.get('/rules', { params }),
  getDetail: (id) => request.get(`/rules/${id}`),
  create: (data) => request.post('/rules', data),
  update: (id, data) => request.put(`/rules/${id}`, data),
  activate: (id) => request.post(`/rules/${id}/activate`),
  archive: (id) => request.post(`/rules/${id}/archive`),
  getHistory: (id) => request.get(`/rules/${id}/history`),
  validateTiers: (data) => request.post('/rules/validate-tiers', data),
  getApiInterfaces: () => request.get('/api-interfaces'),
  createApiInterface: (data) => request.post('/api-interfaces', data),
};

export const billingApi = {
  getBills: (params) => request.get('/bills', { params }),
  getBillDetail: (id) => request.get(`/bills/${id}`),
  generateBills: (data) => request.post('/bills/generate', data),
  regenerateBill: (id) => request.post(`/bills/${id}/regenerate`),
  confirmBill: (id) => request.post(`/bills/${id}/confirm`),
  exportBills: (params) => request.get('/bills/export/csv', { params, responseType: 'blob' }),
  getInvoices: (params) => request.get('/invoices', { params }),
  getInvoiceDetail: (id) => request.get(`/invoices/${id}`),
  createInvoice: (data) => request.post('/invoices', data),
  downloadInvoicePdf: (id) => request.get(`/invoices/${id}/pdf`, { responseType: 'blob' }),
};

export const usageApi = {
  query: (params) => request.get('/usage/query', { params }),
  export: (params) => request.get('/usage/export', { params, responseType: 'blob' }),
  getTenantCurrent: (tenantId, params) => request.get(`/usage/tenant/${tenantId}/current`, { params }),
  getNotifications: (params) => request.get('/notifications', { params }),
  markNotificationRead: (id) => request.post(`/notifications/${id}/read`),
  readAllNotifications: (data) => request.post('/notifications/read-all', data),
};

export const meteringApi = {
  collectEvents: (data) => request.post('/metering/events', data),
  checkQuota: (data) => request.post('/metering/events/check-quota', data),
  flushEvents: () => request.post('/metering/flush'),
  getDeadLetters: (params) => request.get('/metering/dead-letters', { params }),
  reprocessDeadLetters: (data) => request.post('/metering/dead-letters/reprocess', data),
};

export const alertApi = {
  getRules: (tenantId) => request.get(`/tenants/${tenantId}/alerts/rules`),
  getRule: (tenantId, ruleId) => request.get(`/tenants/${tenantId}/alerts/rules/${ruleId}`),
  createRule: (tenantId, data) => request.post(`/tenants/${tenantId}/alerts/rules`, data),
  updateRule: (tenantId, ruleId, data) => request.put(`/tenants/${tenantId}/alerts/rules/${ruleId}`, data),
  deleteRule: (tenantId, ruleId) => request.delete(`/tenants/${tenantId}/alerts/rules/${ruleId}`),
  reorderRules: (tenantId, orderedRuleIds) => request.post(`/tenants/${tenantId}/alerts/rules/reorder`, { orderedRuleIds }),
  getHistory: (tenantId, params) => request.get(`/tenants/${tenantId}/alerts/history`, { params }),
  getStatus: (tenantId) => request.get(`/tenants/${tenantId}/alerts/status`),
  getRateLimitStatus: (tenantId, params) => request.get(`/tenants/${tenantId}/alerts/rate-limit-status`, { params }),
  clearRateLimit: (tenantId, data) => request.post(`/tenants/${tenantId}/alerts/rate-limit/clear`, data),
  getCircuitBreakerStatus: (tenantId) => request.get(`/tenants/${tenantId}/alerts/circuit-breaker-status`),
  closeCircuitBreaker: (tenantId, data) => request.post(`/tenants/${tenantId}/alerts/circuit-breaker/close`, data),
  evaluateRules: (tenantId, data) => request.post(`/tenants/${tenantId}/alerts/evaluate`, data),
  getWebhooks: (tenantId) => request.get(`/tenants/${tenantId}/webhooks`),
  createWebhook: (tenantId, data) => request.post(`/tenants/${tenantId}/webhooks`, data),
  updateWebhook: (tenantId, webhookId, data) => request.put(`/tenants/${tenantId}/webhooks/${webhookId}`, data),
  deleteWebhook: (tenantId, webhookId) => request.delete(`/tenants/${tenantId}/webhooks/${webhookId}`),
  testWebhook: (tenantId, webhookId) => request.post(`/tenants/${tenantId}/webhooks/${webhookId}/test`),
};

export default request;
