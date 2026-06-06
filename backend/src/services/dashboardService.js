import {
  Tenant, Bill, UsageAggregation, Notification, ApiInterface,
  sequelize, Op, fn, col,
} from '../models/index.js';
import { getMonthKey, getMonthStart, getMonthEnd } from '../utils/dateUtils.js';
import { getTenantsAtQuotaThreshold } from './quotaService.js';

export async function getDashboardStats() {
  const currentMonth = getMonthKey();
  const monthStart = getMonthStart();
  const monthEnd = getMonthEnd();

  const [
    totalTenants,
    activeTenants,
    totalRevenue,
    totalCalls,
    pendingConfirmBills,
    recentNotifications,
    quotaWarnings,
  ] = await Promise.all([
    Tenant.count(),
    Tenant.count({ where: { status: 'active' } }),
    Bill.sum('totalAmount', {
      where: {
        month: currentMonth,
        status: { [Op.in]: ['confirmed', 'paid'] },
      },
    }),
    UsageAggregation.sum('callCount', {
      where: {
        month: currentMonth,
        granularity: 'day',
      },
    }),
    Bill.count({ where: { status: 'pending_confirm' } }),
    Notification.findAll({
      where: { read: false },
      include: [{ model: Tenant, attributes: ['id', 'name', 'code'] }],
      order: [['createdAt', 'DESC']],
      limit: 10,
    }),
    getTenantsAtQuotaThreshold(80),
  ]);

  return {
    totalTenants,
    activeTenants,
    totalRevenue: totalRevenue || 0,
    totalCalls: totalCalls || 0,
    pendingConfirmBills,
    recentNotifications,
    quotaWarnings: quotaWarnings.slice(0, 10),
  };
}

export async function getCallTrend(granularity = 'day', startDate, endDate) {
  if (!startDate) {
    startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  }
  if (!endDate) {
    endDate = new Date();
  }

  const aggGranularity = granularity === 'hour' ? 'hour' : 'day';

  const data = await UsageAggregation.findAll({
    where: {
      granularity: aggGranularity,
      periodStart: {
        [Op.between]: [startDate, endDate],
      },
    },
    attributes: [
      'periodStart',
      [fn('SUM', col('callCount')), 'totalCalls'],
      [fn('SUM', col('successCount')), 'successCalls'],
    ],
    group: ['periodStart'],
    order: [['periodStart', 'ASC']],
    raw: true,
  });

  return data.map(d => ({
    date: d.periodStart,
    totalCalls: parseInt(d.totalCalls) || 0,
    successCalls: parseInt(d.successCalls) || 0,
    successRate: d.totalCalls > 0 ? (d.successCalls / d.totalCalls * 100).toFixed(2) : 0,
  }));
}

export async function getTopTenants(limit = 10) {
  const currentMonth = getMonthKey();

  const data = await UsageAggregation.findAll({
    where: {
      month: currentMonth,
      granularity: 'day',
    },
    include: [{ model: Tenant, attributes: ['id', 'name', 'code'] }],
    attributes: [
      'tenantId',
      [fn('SUM', col('callCount')), 'totalCalls'],
      [fn('SUM', col('dataTransferMB')), 'totalDataMB'],
    ],
    group: ['tenantId', 'Tenant.id'],
    order: [[fn('SUM', col('callCount')), 'DESC']],
    limit,
    raw: true,
  });

  return data.map(d => ({
    tenantId: d.tenantId,
    tenantName: d['Tenant.name'],
    tenantCode: d['Tenant.code'],
    totalCalls: parseInt(d.totalCalls) || 0,
    totalDataMB: parseFloat(d.totalDataMB) || 0,
  }));
}

export async function getRevenueTrend(months = 6) {
  const result = [];
  const now = new Date();

  for (let i = months - 1; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const month = getMonthKey(date);

    const revenue = await Bill.sum('totalAmount', {
      where: {
        month,
        status: { [Op.in]: ['confirmed', 'paid'] },
      },
    });

    result.push({
      month,
      revenue: revenue || 0,
    });
  }

  return result;
}

export async function getApiUsageRanking(limit = 10) {
  const currentMonth = getMonthKey();

  const data = await UsageAggregation.findAll({
    where: {
      month: currentMonth,
      granularity: 'day',
    },
    include: [{ model: ApiInterface, attributes: ['id', 'name', 'path'] }],
    attributes: [
      'apiInterfaceId',
      [fn('SUM', col('callCount')), 'totalCalls'],
    ],
    group: ['apiInterfaceId', 'ApiInterface.id'],
    order: [[fn('SUM', col('callCount')), 'DESC']],
    limit,
    raw: true,
  });

  return data.map(d => ({
    apiInterfaceId: d.apiInterfaceId,
    apiName: d['ApiInterface.name'],
    apiPath: d['ApiInterface.path'],
    totalCalls: parseInt(d.totalCalls) || 0,
  }));
}

export default {
  getDashboardStats,
  getCallTrend,
  getTopTenants,
  getRevenueTrend,
  getApiUsageRanking,
};
