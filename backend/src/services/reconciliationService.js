import {
  sequelize,
  Op,
  fn,
  col,
  literal,
  ReconciliationTask,
  ReconciliationDiff,
  ReconciliationAuditLog,
  MeteringEvent,
  UsageAggregation,
  Quota,
  Tenant,
  ApiInterface,
} from '../models/index.js';
import redis from '../config/redis.js';
import { reconciliationQueue } from '../config/queue.js';
import { getMonthKey, getDayStart, getDayEnd, getEventId } from '../utils/dateUtils.js';
import { getQuotaRedisKey } from './quotaService.js';
import dayjs from 'dayjs';

const DIMENSIONS = ['count', 'data_transfer', 'compute_time'];

const DIFF_THRESHOLDS = {
  count: 1,
  data_transfer: 0.01,
  compute_time: 0.01,
};

export async function generateTaskNo(date = new Date()) {
  const dateStr = dayjs(date).format('YYYYMMDD');
  const prefix = `RECON-${dateStr}-`;
  
  const lastTask = await ReconciliationTask.findOne({
    where: {
      taskNo: {
        [Op.like]: `${prefix}%`,
      },
    },
    order: [['taskNo', 'DESC']],
  });
  
  let sequence = 1;
  if (lastTask) {
    const lastSeq = parseInt(lastTask.taskNo.split('-').pop(), 10);
    sequence = lastSeq + 1;
  }
  
  return `${prefix}${String(sequence).padStart(6, '0')}`;
}

export async function createReconciliationTask(options) {
  const { taskType, startDate, endDate, tenantIds = null, triggeredBy = 'system' } = options;
  
  const taskNo = await generateTaskNo();
  
  const task = await ReconciliationTask.create({
    taskNo,
    taskType,
    status: 'pending',
    startDate: dayjs(startDate).startOf('day').toDate(),
    endDate: dayjs(endDate).endOf('day').toDate(),
    tenantIds,
    triggeredBy,
    triggeredAt: new Date(),
    progress: 0,
  });
  
  await reconciliationQueue.add({
    taskId: task.id,
  }, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
  });
  
  await createAuditLog({
    operationType: 'reconciliation_trigger',
    operator: triggeredBy,
    taskId: task.id,
    reason: `触发${taskType === 'auto' ? '自动' : taskType === 'manual' ? '手动' : '局部'}对账任务`,
    metadata: { startDate, endDate, tenantIds },
  });
  
  return task;
}

export async function triggerAutoReconciliation() {
  const yesterday = dayjs().subtract(1, 'day').toDate();
  return await createReconciliationTask({
    taskType: 'auto',
    startDate: yesterday,
    endDate: yesterday,
    triggeredBy: 'system',
  });
}

export async function processReconciliationTask(job) {
  const { taskId } = job.data;
  
  const task = await ReconciliationTask.findByPk(taskId);
  if (!task) {
    throw new Error(`Reconciliation task ${taskId} not found`);
  }
  
  if (task.status !== 'pending') {
    console.log(`Task ${taskId} already processed, skipping`);
    return { success: false, reason: 'Task already processed' };
  }
  
  try {
    task.status = 'running';
    task.startedAt = new Date();
    await task.save();
    
    const diffs = await executeReconciliation(task, (progress) => {
      task.progress = progress;
      task.save();
    });
    
    task.status = 'completed';
    task.completedAt = new Date();
    task.durationMs = task.completedAt.getTime() - task.startedAt.getTime();
    task.diffCount = diffs.length;
    task.quotaDiffCount = diffs.filter(d => d.diffType === 'quota_deviation').length;
    task.aggregationDiffCount = diffs.filter(d => d.diffType === 'aggregation_deviation').length;
    task.eventMissingCount = diffs.filter(d => d.diffType === 'event_missing').length;
    task.progress = 100;
    
    await task.save();
    
    console.log(`Reconciliation task ${taskId} completed: ${diffs.length} diffs found`);
    return { success: true, diffCount: diffs.length };
    
  } catch (error) {
    console.error(`Reconciliation task ${taskId} failed:`, error);
    task.status = 'failed';
    task.errorMessage = error.message;
    task.completedAt = new Date();
    if (task.startedAt) {
      task.durationMs = task.completedAt.getTime() - task.startedAt.getTime();
    }
    await task.save();
    throw error;
  }
}

async function executeReconciliation(task, onProgress) {
  const startDate = task.startDate;
  const endDate = task.endDate;
  const tenantIds = task.tenantIds;
  
  const tenantWhere = tenantIds && tenantIds.length > 0 
    ? { id: { [Op.in]: tenantIds } }
    : { status: 'active' };
  
  const tenants = await Tenant.findAll({
    where: tenantWhere,
    attributes: ['id', 'name', 'code'],
  });
  
  const apiInterfaces = await ApiInterface.findAll({
    attributes: ['id', 'name', 'path'],
  });
  
  const dateRange = [];
  let currentDate = dayjs(startDate);
  const end = dayjs(endDate);
  while (currentDate.isBefore(end) || currentDate.isSame(end, 'day')) {
    dateRange.push(currentDate.toDate());
    currentDate = currentDate.add(1, 'day');
  }
  
  const totalSteps = tenants.length * dateRange.length;
  let processedSteps = 0;
  const allDiffs = [];
  
  for (const tenant of tenants) {
    for (const date of dateRange) {
      const dayDiffs = await reconcileSingleDay(tenant, apiInterfaces, date, task.id);
      allDiffs.push(...dayDiffs);
      
      processedSteps++;
      const progress = Math.round((processedSteps / totalSteps) * 100);
      if (onProgress) {
        onProgress(Math.min(progress, 99));
      }
    }
  }
  
  const crossMonthDiffs = await detectCrossMonthMisplacement(tenants, apiInterfaces, task.id);
  allDiffs.push(...crossMonthDiffs);
  
  return allDiffs;
}

async function reconcileSingleDay(tenant, apiInterfaces, date, taskId) {
  const diffs = [];
  const dateKey = dayjs(date).format('YYYY-MM-DD');
  const month = getMonthKey(date);
  const dayStart = getDayStart(date);
  const dayEnd = getDayEnd(date);
  
  const tx = await sequelize.transaction({
    isolationLevel: 'REPEATABLE READ',
    readOnly: true,
  });
  
  try {
    const eventSums = await getEventSumsWithSnapshot(tenant.id, dayStart, dayEnd, tx);
    const aggregationSums = await getAggregationSumsWithSnapshot(tenant.id, dayStart, dayEnd, tx);
    
    for (const api of apiInterfaces) {
      for (const dimension of DIMENSIONS) {
        const eventSum = eventSums[api.id]?.[dimension] || 0;
        const aggSum = aggregationSums[api.id]?.[dimension] || 0;
        
        const quotaRedisValue = await getQuotaRedisValue(tenant.id, api.id, dimension, month);
        
        const threshold = DIFF_THRESHOLDS[dimension];
        
        const aggDiff = Math.abs(Number(eventSum) - Number(aggSum));
        if (aggDiff > threshold) {
          const severity = getSeverity(aggDiff, Number(eventSum));
          diffs.push({
            taskId,
            diffType: 'aggregation_deviation',
            severity,
            tenantId: tenant.id,
            apiInterfaceId: api.id,
            dateKey,
            month,
            dimension,
            eventSumValue: eventSum,
            dbAggregationValue: aggSum,
            redisQuotaValue: quotaRedisValue,
            diffAmount: aggDiff,
            diffPercent: Number(eventSum) > 0 ? (aggDiff / Number(eventSum)) * 100 : 100,
            expectedValue: eventSum,
            actualValue: aggSum,
            status: 'pending',
          });
        }
        
        const quotaDiff = Math.abs(Number(eventSum) - Number(quotaRedisValue || 0));
        if (quotaDiff > threshold) {
          const severity = getSeverity(quotaDiff, Number(eventSum));
          diffs.push({
            taskId,
            diffType: 'quota_deviation',
            severity,
            tenantId: tenant.id,
            apiInterfaceId: api.id,
            dateKey,
            month,
            dimension,
            eventSumValue: eventSum,
            dbAggregationValue: aggSum,
            redisQuotaValue: quotaRedisValue,
            diffAmount: quotaDiff,
            diffPercent: Number(eventSum) > 0 ? (quotaDiff / Number(eventSum)) * 100 : 100,
            expectedValue: eventSum,
            actualValue: quotaRedisValue,
            status: 'pending',
          });
        }
        
        if (Number(eventSum) > 0 && Number(aggSum) === 0) {
          diffs.push({
            taskId,
            diffType: 'event_missing',
            severity: 'critical',
            tenantId: tenant.id,
            apiInterfaceId: api.id,
            dateKey,
            month,
            dimension,
            eventSumValue: eventSum,
            dbAggregationValue: 0,
            redisQuotaValue: 0,
            diffAmount: eventSum,
            diffPercent: 100,
            expectedValue: eventSum,
            actualValue: 0,
            status: 'pending',
          });
        }
      }
    }
    
    await tx.commit();
  } catch (error) {
    await tx.rollback();
    throw error;
  }
  
  if (diffs.length > 0) {
    await ReconciliationDiff.bulkCreate(diffs);
  }
  
  return diffs;
}

async function getEventSumsWithSnapshot(tenantId, dayStart, dayEnd, tx) {
  const results = await MeteringEvent.findAll({
    where: {
      tenantId,
      timestamp: {
        [Op.between]: [dayStart, dayEnd],
      },
    },
    attributes: [
      'apiInterfaceId',
      [fn('COUNT', col('id')), 'countSum'],
      [fn('SUM', col('dataTransferMB')), 'dataTransferSum'],
      [fn('SUM', col('computeSeconds')), 'computeTimeSum'],
    ],
    group: ['apiInterfaceId'],
    raw: true,
    transaction: tx,
  });
  
  const sums = {};
  for (const r of results) {
    sums[r.apiInterfaceId] = {
      count: Number(r.countSum) || 0,
      data_transfer: Number(r.dataTransferSum) || 0,
      compute_time: Number(r.computeTimeSum) || 0,
    };
  }
  
  return sums;
}

async function getAggregationSumsWithSnapshot(tenantId, dayStart, dayEnd, tx) {
  const results = await UsageAggregation.findAll({
    where: {
      tenantId,
      granularity: 'day',
      periodStart: {
        [Op.between]: [dayStart, dayEnd],
      },
    },
    attributes: [
      'apiInterfaceId',
      [fn('SUM', col('callCount')), 'countSum'],
      [fn('SUM', col('dataTransferMB')), 'dataTransferSum'],
      [fn('SUM', col('computeSeconds')), 'computeTimeSum'],
    ],
    group: ['apiInterfaceId'],
    raw: true,
    transaction: tx,
  });
  
  const sums = {};
  for (const r of results) {
    sums[r.apiInterfaceId] = {
      count: Number(r.countSum) || 0,
      data_transfer: Number(r.dataTransferSum) || 0,
      compute_time: Number(r.computeTimeSum) || 0,
    };
  }
  
  return sums;
}

async function getQuotaRedisValue(tenantId, apiInterfaceId, dimension, month) {
  const quotas = await Quota.findAll({
    where: {
      tenantId,
      apiInterfaceId: { [Op.or]: [apiInterfaceId, null] },
      month,
      dimension,
    },
    order: [['apiInterfaceId', 'DESC']],
  });
  
  if (quotas.length === 0) return null;
  
  let total = 0;
  for (const quota of quotas) {
    const key = getQuotaRedisKey(
      tenantId,
      quota.apiInterfaceId,
      quota.type,
      dimension,
      month
    );
    const value = await redis.get(key);
    total += parseFloat(value || '0');
  }
  
  return total;
}

function getSeverity(diffAmount, expectedValue) {
  if (expectedValue === 0) return 'critical';
  const percent = (diffAmount / expectedValue) * 100;
  if (percent >= 10) return 'critical';
  if (percent >= 1) return 'warning';
  return 'minor';
}

async function detectCrossMonthMisplacement(tenants, apiInterfaces, taskId) {
  const diffs = [];
  
  for (const tenant of tenants) {
    for (const api of apiInterfaces) {
      const misplacedEvents = await MeteringEvent.findAll({
        where: {
          tenantId: tenant.id,
          apiInterfaceId: api.id,
          [Op.and]: [
            literal(
              `EXTRACT(MONTH FROM "timestamp") != CAST(SPLIT_PART("month", '-', 2) AS INTEGER)`
            ),
            literal(
              `EXTRACT(YEAR FROM "timestamp") != CAST(SPLIT_PART("month", '-', 1) AS INTEGER)`
            ),
          ],
        },
        attributes: ['id', 'eventId', 'timestamp', 'month'],
        limit: 1000,
      });
      
      if (misplacedEvents.length > 0) {
        const eventGroups = {};
        for (const event of misplacedEvents) {
          const correctMonth = getMonthKey(event.timestamp);
          const key = `${correctMonth}|${event.month}`;
          if (!eventGroups[key]) {
            eventGroups[key] = {
              events: [],
              eventIds: [],
            };
          }
          eventGroups[key].events.push(event);
          eventGroups[key].eventIds.push(event.eventId);
        }
        
        for (const [key, group] of Object.entries(eventGroups)) {
          const [targetMonth, sourceMonth] = key.split('|');
          const dateKey = dayjs(group.events[0].timestamp).format('YYYY-MM-DD');
          
          diffs.push({
            taskId,
            diffType: 'cross_month_misplacement',
            severity: 'warning',
            tenantId: tenant.id,
            apiInterfaceId: api.id,
            dateKey,
            month: sourceMonth,
            dimension: 'count',
            diffAmount: group.events.length,
            diffPercent: 100,
            eventSumValue: group.events.length,
            dbAggregationValue: group.events.length,
            expectedValue: 0,
            actualValue: group.events.length,
            affectedEventCount: group.events.length,
            eventIds: group.eventIds,
            sourceMonth,
            targetMonth,
            status: 'pending',
          });
        }
      }
    }
  }
  
  if (diffs.length > 0) {
    await ReconciliationDiff.bulkCreate(diffs);
  }
  
  return diffs;
}

export async function getTaskList(params = {}) {
  const where = {};
  if (params.status) where.status = params.status;
  if (params.taskType) where.taskType = params.taskType;
  
  return await ReconciliationTask.findAndCountAll({
    where,
    order: [['triggeredAt', 'DESC']],
    limit: params.limit || 20,
    offset: params.offset || 0,
  });
}

export async function getTaskDetail(taskId) {
  const task = await ReconciliationTask.findByPk(taskId, {
    include: [
      {
        model: ReconciliationDiff,
        separate: true,
        order: [['severity', 'DESC'], ['diffAmount', 'DESC']],
        include: [
          { model: Tenant, attributes: ['id', 'name', 'code'] },
          { model: ApiInterface, attributes: ['id', 'name', 'path'] },
        ],
      },
    ],
  });
  
  if (!task) return null;
  
  const diffs = task.ReconciliationDiffs || [];
  
  const consistencyByDimension = {
    count: { total: 0, consistent: 0 },
    data_transfer: { total: 0, consistent: 0 },
    compute_time: { total: 0, consistent: 0 },
  };
  
  for (const diff of diffs) {
    consistencyByDimension[diff.dimension].total++;
  }
  
  const dimensions = ['count', 'data_transfer', 'compute_time'];
  for (const dim of dimensions) {
    const aggDiffs = diffs.filter(d => d.diffType === 'aggregation_deviation' && d.dimension === dim);
    consistencyByDimension[dim].total += aggDiffs.length;
  }
  
  return {
    ...task.toJSON(),
    consistencyStats: {
      count: consistencyByDimension.count.total > 0 
        ? ((consistencyByDimension.count.total - diffs.filter(d => d.dimension === 'count').length) / consistencyByDimension.count.total * 100).toFixed(2)
        : 100,
      data_transfer: consistencyByDimension.data_transfer.total > 0
        ? ((consistencyByDimension.data_transfer.total - diffs.filter(d => d.dimension === 'data_transfer').length) / consistencyByDimension.data_transfer.total * 100).toFixed(2)
        : 100,
      compute_time: consistencyByDimension.compute_time.total > 0
        ? ((consistencyByDimension.compute_time.total - diffs.filter(d => d.dimension === 'compute_time').length) / consistencyByDimension.compute_time.total * 100).toFixed(2)
        : 100,
    },
  };
}

export async function getDiffList(params = {}) {
  const where = {};
  if (params.status) where.status = params.status;
  if (params.severity) where.severity = params.severity;
  if (params.diffType) where.diffType = params.diffType;
  if (params.tenantId) where.tenantId = params.tenantId;
  if (params.taskId) where.taskId = params.taskId;
  
  return await ReconciliationDiff.findAndCountAll({
    where,
    include: [
      { model: Tenant, attributes: ['id', 'name', 'code'] },
      { model: ApiInterface, attributes: ['id', 'name', 'path'] },
      { model: ReconciliationTask, attributes: ['id', 'taskNo'] },
    ],
    order: [
      ['severity', 'DESC'],
      ['diffAmount', 'DESC'],
      ['createdAt', 'DESC'],
    ],
    limit: params.limit || 20,
    offset: params.offset || 0,
  });
}

export async function getDiffDetail(diffId) {
  return await ReconciliationDiff.findByPk(diffId, {
    include: [
      { model: Tenant, attributes: ['id', 'name', 'code'] },
      { model: ApiInterface, attributes: ['id', 'name', 'path'] },
      { model: ReconciliationTask, attributes: ['id', 'taskNo', 'taskType', 'triggeredAt'] },
    ],
  });
}

export async function createAuditLog(data) {
  return await ReconciliationAuditLog.create({
    ...data,
    operatedAt: new Date(),
  });
}

export async function getAuditLogs(params = {}) {
  const where = {};
  if (params.operator) where.operator = params.operator;
  if (params.operationType) where.operationType = params.operationType;
  if (params.startDate) {
    where.operatedAt = {
      [Op.gte]: new Date(params.startDate),
    };
  }
  if (params.endDate) {
    where.operatedAt = where.operatedAt || {};
    where.operatedAt[Op.lte] = new Date(params.endDate);
  }
  
  return await ReconciliationAuditLog.findAndCountAll({
    where,
    order: [['operatedAt', 'DESC']],
    limit: params.limit || 50,
    offset: params.offset || 0,
  });
}

reconciliationQueue.process(processReconciliationTask);

export default {
  createReconciliationTask,
  triggerAutoReconciliation,
  processReconciliationTask,
  getTaskList,
  getTaskDetail,
  getDiffList,
  getDiffDetail,
  createAuditLog,
  getAuditLogs,
  generateTaskNo,
};
