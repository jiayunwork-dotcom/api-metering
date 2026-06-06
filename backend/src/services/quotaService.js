import redis from '../config/redis.js';
import { notificationQueue, emailQueue } from '../config/queue.js';
import { Quota, Tenant, Notification, sequelize, Op } from '../models/index.js';
import { getMonthKey } from '../utils/dateUtils.js';
import { sendQuotaNotification } from '../utils/emailService.js';

const QUOTA_REDIS_PREFIX = 'quota:usage';
const QUOTA_THRESHOLDS = [80, 90, 95, 100];

export function getQuotaRedisKey(tenantId, apiInterfaceId, type, dimension, month) {
  const apiPart = apiInterfaceId || 'global';
  return `${QUOTA_REDIS_PREFIX}:${month}:${tenantId}:${apiPart}:${type}:${dimension}`;
}

export async function checkAndConsumeQuota(tenantId, apiInterfaceId, dimension, usageAmount, month) {
  const targetMonth = month || getMonthKey();
  
  try {
    const quotas = await Quota.findAll({
      where: {
        tenantId,
        month: targetMonth,
        dimension,
        [Op.or]: [
          { apiInterfaceId },
          { apiInterfaceId: null },
        ],
      },
      order: [['apiInterfaceId', 'DESC']],
    });

    if (quotas.length === 0) {
      return { allowed: true, consumed: [] };
    }

    let hardLimitExceeded = false;
    const consumed = [];

    for (const quota of quotas) {
      const key = getQuotaRedisKey(
        tenantId,
        quota.apiInterfaceId,
        quota.type,
        dimension,
        targetMonth
      );

      let currentUsage;
      try {
        const luaScript = `
          local current = tonumber(redis.call('GET', KEYS[1]) or '0')
          local new_val = current + tonumber(ARGV[1])
          redis.call('SET', KEYS[1], new_val)
          return new_val
        `;
        
        currentUsage = await redis.eval(luaScript, 1, key, usageAmount.toString());
      } catch (redisError) {
        console.error('Redis quota operation failed:', redisError);
        
        if (quota.type === 'hard_limit') {
          return { allowed: false, reason: 'Quota service unavailable', hardLimit: true };
        }
        
        currentUsage = await getQuotaUsageFromDB(quota) + usageAmount;
        await incrementQuotaUsageDB(quota, usageAmount);
      }

      const usagePercent = (currentUsage / parseFloat(quota.limitAmount)) * 100;
      
      consumed.push({
        quotaId: quota.id,
        type: quota.type,
        dimension,
        usage: currentUsage,
        limit: quota.limitAmount,
        usagePercent,
      });

      if (quota.type === 'hard_limit' && currentUsage > parseFloat(quota.limitAmount)) {
        hardLimitExceeded = true;
      }

      await checkQuotaThresholds(quota, currentUsage, usagePercent);
    }

    if (hardLimitExceeded) {
      return {
        allowed: false,
        reason: 'Hard limit exceeded',
        hardLimit: true,
        consumed,
      };
    }

    return { allowed: true, consumed };
  } catch (error) {
    console.error('Quota check failed:', error);
    return { allowed: true, error: error.message };
  }
}

async function getQuotaUsageFromDB(quota) {
  const { UsageAggregation } = await import('../models/index.js');
  const { fn, col } = require('sequelize');
  
  let usageField;
  switch (quota.dimension) {
    case 'count':
      usageField = 'callCount';
      break;
    case 'data_transfer':
      usageField = 'dataTransferMB';
      break;
    case 'compute_time':
      usageField = 'computeSeconds';
      break;
    default:
      return 0;
  }

  const result = await UsageAggregation.findOne({
    where: {
      tenantId: quota.tenantId,
      apiInterfaceId: quota.apiInterfaceId || { [Op.ne]: null },
      month: quota.month,
      granularity: 'day',
    },
    attributes: [[fn('SUM', col(usageField)), 'total']],
    raw: true,
  });

  return result?.total || 0;
}

async function incrementQuotaUsageDB(quota, amount) {
  const key = `quota:db:fallback:${quota.id}`;
  await redis.incrbyfloat(key, amount);
}

async function checkQuotaThresholds(quota, currentUsage, usagePercent) {
  const thresholds = QUOTA_THRESHOLDS.filter(t => usagePercent >= t);
  
  for (const threshold of thresholds) {
    if (!quota.notifiedLevels.includes(threshold)) {
      await triggerQuotaNotification(quota, threshold, currentUsage);
      
      quota.notifiedLevels = [...quota.notifiedLevels, threshold];
      await quota.save();
    }
  }
}

async function triggerQuotaNotification(quota, threshold, currentUsage) {
  const tenant = await Tenant.findByPk(quota.tenantId);
  if (!tenant) return;

  const typeText = {
    free: '免费额度',
    package: '套餐包含量',
    hard_limit: '硬限制',
  }[quota.type];

  const notification = await Notification.create({
    tenantId: quota.tenantId,
    type: `quota_${threshold}`,
    title: `配额使用提醒 - ${threshold}%`,
    content: `您的${typeText}使用量已达到 ${threshold}%。当前用量：${currentUsage}${quota.unit}，配额上限：${quota.limitAmount}${quota.unit}`,
    level: threshold >= 100 ? 'critical' : threshold >= 95 ? 'error' : threshold >= 90 ? 'warning' : 'info',
    metadata: {
      quotaId: quota.id,
      threshold,
      currentUsage,
      limit: quota.limitAmount,
      type: quota.type,
      dimension: quota.dimension,
    },
  });

  await emailQueue.add({
    type: 'quota_notification',
    notificationId: notification.id,
    tenantId: tenant.id,
    quotaType: quota.type,
    threshold,
    currentUsage,
    limit: quota.limitAmount,
  }, {
    attempts: 5,
    backoff: { type: 'exponential', delay: 60000 },
  });
}

export async function createQuota(data) {
  const unitMap = {
    count: '次',
    data_transfer: 'MB',
    compute_time: '秒',
  };

  return await Quota.create({
    ...data,
    unit: unitMap[data.dimension],
    month: data.month || getMonthKey(),
    notifiedLevels: [],
  });
}

export async function getQuotaUsage(tenantId, month) {
  const targetMonth = month || getMonthKey();
  
  const quotas = await Quota.findAll({
    where: { tenantId, month: targetMonth },
    include: [
      { model: Tenant, attributes: ['id', 'name', 'code'] },
    ],
  });

  const usagePromises = quotas.map(async (quota) => {
    const key = getQuotaRedisKey(
      tenantId,
      quota.apiInterfaceId,
      quota.type,
      quota.dimension,
      targetMonth
    );
    
    let currentUsage;
    try {
      currentUsage = parseFloat(await redis.get(key) || '0');
    } catch {
      currentUsage = await getQuotaUsageFromDB(quota);
    }

    const usagePercent = parseFloat(quota.limitAmount) > 0 
      ? (currentUsage / parseFloat(quota.limitAmount)) * 100 
      : 0;

    return {
      ...quota.toJSON(),
      currentUsage,
      usagePercent: Math.min(usagePercent, 100),
    };
  });

  return Promise.all(usagePromises);
}

export async function processEmailJob(job) {
  const { type, notificationId, tenantId, quotaType, threshold, currentUsage, limit } = job.data;
  
  try {
    const tenant = await Tenant.findByPk(tenantId);
    if (!tenant) {
      return { success: false, error: 'Tenant not found' };
    }

    const notification = await Notification.findByPk(notificationId);
    if (!notification) {
      return { success: false, error: 'Notification not found' };
    }

    if (type === 'quota_notification') {
      const result = await sendQuotaNotification(tenant, quotaType, threshold, currentUsage, limit);
      
      if (result.success || result.skipped) {
        notification.emailSent = true;
        notification.emailSentAt = new Date();
        await notification.save();
        return { success: true };
      } else {
        throw new Error(result.error);
      }
    }

    return { success: false, error: 'Unknown email type' };
  } catch (error) {
    console.error('Email job failed:', error);
    
    const notification = await Notification.findByPk(notificationId);
    if (notification) {
      notification.emailRetryCount = (notification.emailRetryCount || 0) + 1;
      notification.emailLastError = error.message;
      await notification.save();
    }
    
    throw error;
  }
}

emailQueue.process(processEmailJob);

export async function getNotifications(tenantId, params = {}) {
  const where = {};
  if (tenantId) where.tenantId = tenantId;
  if (params.type) where.type = params.type;
  if (params.read !== undefined) where.read = params.read;

  return await Notification.findAndCountAll({
    where,
    order: [['createdAt', 'DESC']],
    limit: params.limit || 50,
    offset: params.offset || 0,
  });
}

export async function markNotificationRead(notificationId) {
  const notification = await Notification.findByPk(notificationId);
  if (!notification) {
    throw new Error('Notification not found');
  }

  notification.read = true;
  notification.readAt = new Date();
  return await notification.save();
}

export async function getTenantsAtQuotaThreshold(threshold) {
  const currentMonth = getMonthKey();
  const quotas = await Quota.findAll({
    where: { month: currentMonth },
    include: [{ model: Tenant, where: { status: 'active' } }],
  });

  const results = [];
  for (const quota of quotas) {
    const key = getQuotaRedisKey(
      quota.tenantId,
      quota.apiInterfaceId,
      quota.type,
      quota.dimension,
      currentMonth
    );
    
    let currentUsage;
    try {
      currentUsage = parseFloat(await redis.get(key) || '0');
    } catch {
      continue;
    }

    const usagePercent = (currentUsage / parseFloat(quota.limitAmount)) * 100;
    if (usagePercent >= threshold) {
      results.push({
        tenant: quota.Tenant,
        quota,
        currentUsage,
        usagePercent,
      });
    }
  }

  return results;
}

export default {
  checkAndConsumeQuota,
  createQuota,
  getQuotaUsage,
  getNotifications,
  markNotificationRead,
  getTenantsAtQuotaThreshold,
  processEmailJob,
};
