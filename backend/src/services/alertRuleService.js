import {
  AlertRule,
  AlertTriggerHistory,
  Notification,
  Tenant,
  UsageAggregation,
  Bill,
  sequelize,
  Op,
  fn,
  col,
} from '../models/index.js';
import { getDayStart, getHourStart, getMonthKey } from '../utils/dateUtils.js';
import { setRateLimitRule, clearRateLimit } from './rateLimitService.js';
import { openCircuit } from './circuitBreakerService.js';
import { queueWebhookNotification } from './webhookService.js';
import { emailQueue } from '../config/queue.js';

const MAX_RULES_PER_TENANT = 5;

function getCurrentHourKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}`;
}

export async function getAlertRules(tenantId) {
  return await AlertRule.findAll({
    where: { tenantId },
    include: ['apiInterface'],
    order: [['priority', 'DESC'], ['createdAt', 'ASC']],
  });
}

export async function getAlertRuleById(id, tenantId) {
  return await AlertRule.findOne({
    where: { id, tenantId },
    include: ['apiInterface'],
  });
}

export async function createAlertRule(tenantId, data) {
  const ruleCount = await AlertRule.count({ where: { tenantId } });
  if (ruleCount >= MAX_RULES_PER_TENANT) {
    throw new Error(`每个租户最多只能创建${MAX_RULES_PER_TENANT}条预警规则`);
  }

  const maxPriority = await AlertRule.max('priority', { where: { tenantId } });
  const newPriority = (maxPriority || 0) + 1;

  return await AlertRule.create({
    ...data,
    tenantId,
    priority: data.priority || newPriority,
  });
}

export async function updateAlertRule(id, tenantId, data) {
  const rule = await getAlertRuleById(id, tenantId);
  if (!rule) {
    throw new Error('预警规则不存在');
  }

  return await rule.update(data);
}

export async function deleteAlertRule(id, tenantId) {
  const rule = await getAlertRuleById(id, tenantId);
  if (!rule) {
    throw new Error('预警规则不存在');
  }

  if (rule.actionType === 'rate_limit') {
    await clearRateLimit(tenantId, rule.apiInterfaceId);
  }

  await rule.destroy();
  return { success: true };
}

export async function updateRulePriorities(tenantId, orderedRuleIds) {
  const transaction = await sequelize.transaction();

  try {
    for (let i = 0; i < orderedRuleIds.length; i++) {
      await AlertRule.update(
        { priority: orderedRuleIds.length - i },
        { where: { id: orderedRuleIds[i], tenantId }, transaction }
      );
    }
    await transaction.commit();
    return { success: true };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function getTriggerHistory(tenantId, alertRuleId, limit = 20) {
  const where = { tenantId };
  if (alertRuleId) where.alertRuleId = alertRuleId;

  return await AlertTriggerHistory.findAll({
    where,
    include: ['alertRule', 'apiInterface'],
    order: [['triggeredAt', 'DESC']],
    limit,
  });
}

async function getCurrentValue(rule) {
  const { conditionType, conditionConfig, tenantId, apiInterfaceId } = rule;
  const now = new Date();

  switch (conditionType) {
    case 'daily_call_count': {
      const dayStart = getDayStart(now);
      const result = await UsageAggregation.findOne({
        where: {
          tenantId,
          apiInterfaceId: apiInterfaceId || { [Op.ne]: null },
          granularity: 'minute',
          periodStart: { [Op.gte]: dayStart },
        },
        attributes: [[fn('SUM', col('callCount')), 'totalCalls']],
        raw: true,
      });
      return parseFloat(result?.totalCalls || 0);
    }

    case 'hourly_data_volume': {
      const hourStart = getHourStart(now);
      const result = await UsageAggregation.findOne({
        where: {
          tenantId,
          apiInterfaceId: apiInterfaceId || { [Op.ne]: null },
          granularity: 'minute',
          periodStart: { [Op.gte]: hourStart },
        },
        attributes: [[fn('SUM', col('dataTransferMB')), 'totalMB']],
        raw: true,
      });
      return parseFloat(result?.totalMB || 0);
    }

    case 'monthly_cost': {
      const monthKey = getMonthKey(now);
      const bill = await Bill.findOne({
        where: { tenantId, month: monthKey },
        attributes: ['totalAmount'],
      });
      return parseFloat(bill?.totalAmount || 0);
    }

    case 'custom':
      return conditionConfig.customValue || 0;

    default:
      return 0;
  }
}

function checkCondition(conditionType, currentValue, threshold) {
  return currentValue > threshold;
}

async function sendNotifications(rule, triggerData) {
  const { notificationMethods } = rule;
  const status = {};
  const tenant = await Tenant.findByPk(rule.tenantId);

  if (notificationMethods.includes('internal')) {
    try {
      const content = `预警规则"${rule.name}"已触发。当前值: ${triggerData.currentValue}${triggerData.unit}，阈值: ${triggerData.thresholdValue}${triggerData.unit}。执行动作: ${getActionLabel(triggerData.actionType)}`;

      await Notification.create({
        tenantId: rule.tenantId,
        type: 'alert_triggered',
        title: `预警触发 - ${rule.name}`,
        content,
        level: rule.actionType === 'circuit_break' ? 'critical' : rule.actionType === 'rate_limit' ? 'error' : 'warning',
        metadata: {
          alertRuleId: rule.id,
          triggerData,
        },
      });
      status.internal = { success: true };
    } catch (error) {
      status.internal = { success: false, error: error.message };
    }
  }

  if (notificationMethods.includes('email') && tenant?.contactEmail) {
    try {
      await emailQueue.add({
        type: 'alert_notification',
        tenantId: rule.tenantId,
        tenantEmail: tenant.contactEmail,
        ruleName: rule.name,
        triggerData,
      }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 60000 },
      });
      status.email = { success: true, queued: true };
    } catch (error) {
      status.email = { success: false, error: error.message };
    }
  }

  if (notificationMethods.includes('webhook')) {
    try {
      const webhookResult = await queueWebhookNotification(rule.tenantId, rule, triggerData);
      status.webhook = { success: true, ...webhookResult };
    } catch (error) {
      status.webhook = { success: false, error: error.message };
    }
  }

  return status;
}

function getActionLabel(actionType) {
  const labels = {
    notify_only: '仅通知',
    rate_limit: '限流',
    circuit_break: '熔断',
  };
  return labels[actionType] || actionType;
}

async function executeAction(rule, triggerData) {
  const { actionType, actionConfig, tenantId, apiInterfaceId } = rule;
  const result = {};

  switch (actionType) {
    case 'notify_only':
      result.action = 'notify_only';
      break;

    case 'rate_limit': {
      const qps = actionConfig?.qps || 10;
      const burst = actionConfig?.burst || qps * 2;
      const success = await setRateLimitRule(tenantId, apiInterfaceId, rule.id, qps, burst);
      result.action = 'rate_limit';
      result.qps = qps;
      result.burst = burst;
      result.success = success;
      break;
    }

    case 'circuit_break': {
      const cooldownPeriod = rule.cooldownPeriod || 30;
      const state = await openCircuit(tenantId, apiInterfaceId, rule.id, cooldownPeriod);
      result.action = 'circuit_break';
      result.cooldownPeriod = cooldownPeriod;
      result.cooldownUntil = state.cooldownUntil;
      result.success = true;
      break;
    }

    default:
      result.action = 'unknown';
  }

  return result;
}

export async function evaluateRules(tenantId, apiInterfaceId = null) {
  const rules = await AlertRule.findAll({
    where: {
      tenantId,
      status: 'active',
      [Op.or]: [
        { apiInterfaceId },
        { apiInterfaceId: null },
      ],
    },
    order: [['priority', 'DESC']],
  });

  if (rules.length === 0) {
    return { evaluated: 0, triggered: 0 };
  }

  const currentHour = getCurrentHourKey();
  let triggeredCount = 0;

  for (const rule of rules) {
    if (rule.lastTriggeredHour === currentHour) {
      continue;
    }

    const currentValue = await getCurrentValue(rule);
    const threshold = parseFloat(rule.conditionConfig.threshold);
    const unit = rule.conditionConfig.unit || '';

    if (checkCondition(rule.conditionType, currentValue, threshold)) {
      const triggeredAt = new Date();

      const triggerData = {
        triggeredAt: triggeredAt.toISOString(),
        triggerHour: currentHour,
        conditionType: rule.conditionType,
        currentValue,
        thresholdValue: threshold,
        unit,
        actionType: rule.actionType,
      };

      const [actionResult, notificationStatus] = await Promise.all([
        executeAction(rule, triggerData),
        sendNotifications(rule, triggerData),
      ]);

      try {
        await AlertTriggerHistory.create({
          tenantId,
          alertRuleId: rule.id,
          apiInterfaceId: rule.apiInterfaceId,
          triggeredAt,
          triggerHour: currentHour,
          conditionType: rule.conditionType,
          currentValue,
          thresholdValue: threshold,
          unit,
          actionType: rule.actionType,
          actionResult,
          notificationStatus,
        });

        await rule.update({
          lastTriggeredAt: triggeredAt,
          lastTriggeredHour: currentHour,
        });
      } catch (error) {
        if (error.name !== 'SequelizeUniqueConstraintError') {
          console.error('Failed to record trigger history:', error);
        }
      }

      triggeredCount++;

      if (rule.actionType === 'circuit_break') {
        break;
      }
    }
  }

  return { evaluated: rules.length, triggered: triggeredCount };
}

export async function evaluateAllTenants() {
  const tenants = await Tenant.findAll({
    where: { status: 'active' },
    attributes: ['id'],
  });

  const results = [];
  for (const tenant of tenants) {
    try {
      const result = await evaluateRules(tenant.id);
      results.push({ tenantId: tenant.id, ...result });
    } catch (error) {
      console.error(`Failed to evaluate rules for tenant ${tenant.id}:`, error);
      results.push({ tenantId: tenant.id, error: error.message });
    }
  }

  return results;
}

export async function getTenantAlertStatus(tenantId) {
  const [rules, triggerHistory, circuitBreakers] = await Promise.all([
    getAlertRules(tenantId),
    getTriggerHistory(tenantId, null, 10),
    import('./circuitBreakerService.js').then(m => m.getCircuitBreakerStatus(tenantId)),
  ]);

  return {
    rules,
    triggerHistory,
    circuitBreakers,
  };
}

export default {
  getAlertRules,
  getAlertRuleById,
  createAlertRule,
  updateAlertRule,
  deleteAlertRule,
  updateRulePriorities,
  getTriggerHistory,
  evaluateRules,
  evaluateAllTenants,
  getTenantAlertStatus,
};
