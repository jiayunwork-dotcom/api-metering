import {
  sequelize,
  Op,
  fn,
  col,
  DeadLetterEvent,
  MeteringEvent,
  UsageAggregation,
  ReconciliationTask,
} from '../models/index.js';
import { replayQueue } from '../config/queue.js';
import { getMonthKey, getEventId, getDayStart, getDayEnd, getMinuteStart, getMinuteEnd } from '../utils/dateUtils.js';
import { createAuditLog, createReconciliationTask } from './reconciliationService.js';
import { broadcastReplayProgress } from '../websocket/replaySocket.js';
import dayjs from 'dayjs';

const activeReplayJobs = new Map();

export async function getDeadLetterEvents(params = {}) {
  const where = {};
  if (params.status) where.status = params.status;
  if (params.tenantId) where.tenantId = params.tenantId;
  if (params.month) where.month = params.month;
  
  return await DeadLetterEvent.findAndCountAll({
    where,
    order: [['createdAt', 'DESC']],
    limit: params.limit || 50,
    offset: params.offset || 0,
  });
}

export async function replayEvents(deadLetterIds, operator, options = {}) {
  const { dryRun = false, triggerReconciliation = true } = options;
  
  const deadLetters = await DeadLetterEvent.findAll({
    where: {
      id: { [Op.in]: deadLetterIds },
      status: { [Op.in]: ['pending', 'failed'] },
    },
  });
  
  if (deadLetters.length === 0) {
    return {
      success: true,
      total: 0,
      success: 0,
      skipped: 0,
      failed: 0,
      message: '没有可重放的事件',
    };
  }
  
  const jobId = `replay-${Date.now()}-${operator}`;
  
  if (dryRun) {
    return await dryRunReplay(deadLetters, operator);
  }
  
  await replayQueue.add({
    jobId,
    deadLetterIds,
    operator,
    triggerReconciliation,
  }, {
    attempts: 1,
    timeout: 30 * 60 * 1000,
  });
  
  return {
    success: true,
    jobId,
    total: deadLetters.length,
    message: '重放任务已提交，正在处理中',
  };
}

async function dryRunReplay(deadLetters, operator) {
  const results = {
    total: deadLetters.length,
    toReplay: [],
    toSkip: [],
    willUpdateAggregations: [],
    estimatedChanges: {
      callCount: 0,
      dataTransferMB: 0,
      computeSeconds: 0,
    },
  };
  
  for (const dl of deadLetters) {
    const eventData = dl.eventData;
    const tenantId = eventData.tenantId || dl.tenantId;
    const apiInterfaceId = eventData.apiInterfaceId;
    const timestamp = new Date(eventData.timestamp);
    const eventId = getEventId(tenantId, apiInterfaceId, timestamp);
    
    const existing = await MeteringEvent.findOne({
      where: { eventId },
      attributes: ['id', 'eventId'],
    });
    
    const month = getMonthKey(timestamp);
    const dayStart = getDayStart(timestamp);
    
    const info = {
      deadLetterId: dl.id,
      eventId,
      tenantId,
      apiInterfaceId,
      timestamp: eventData.timestamp,
      originalMonth: dl.month,
      correctMonth: month,
      callCount: 1,
      dataTransferMB: Number(eventData.dataTransferMB || 0),
      computeSeconds: Number(eventData.computeSeconds || 0),
    };
    
    if (existing) {
      results.toSkip.push({ ...info, reason: '事件已存在，将跳过' });
    } else {
      results.toReplay.push(info);
      results.estimatedChanges.callCount += 1;
      results.estimatedChanges.dataTransferMB += Number(eventData.dataTransferMB || 0);
      results.estimatedChanges.computeSeconds += Number(eventData.computeSeconds || 0);
      
      const aggKey = `${tenantId}-${apiInterfaceId}-${dayjs(dayStart).format('YYYY-MM-DD')}`;
      if (!results.willUpdateAggregations.find(a => a.key === aggKey)) {
        results.willUpdateAggregations.push({
          key: aggKey,
          tenantId,
          apiInterfaceId,
          date: dayjs(dayStart).format('YYYY-MM-DD'),
          month,
        });
      }
    }
  }
  
  await createAuditLog({
    operationType: 'event_replay_dryrun',
    operator,
    reason: '事件重放dry-run',
    metadata: {
      total: results.total,
      replayCount: results.toReplay.length,
      skipCount: results.toSkip.length,
      estimatedChanges: results.estimatedChanges,
    },
    affectedCount: results.total,
    status: 'success',
  });
  
  return {
    success: true,
    dryRun: true,
    ...results,
    successCount: results.toReplay.length,
    skippedCount: results.toSkip.length,
    failedCount: 0,
  };
}

export async function processEventReplay(job) {
  const { jobId, deadLetterIds, operator, triggerReconciliation } = job.data;
  
  const deadLetters = await DeadLetterEvent.findAll({
    where: {
      id: { [Op.in]: deadLetterIds },
      status: { [Op.in]: ['pending', 'failed'] },
    },
  });
  
  const result = {
    jobId,
    total: deadLetters.length,
    success: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    startTime: new Date(),
  };
  
  activeReplayJobs.set(jobId, result);
  
  try {
    for (let i = 0; i < deadLetters.length; i++) {
      const dl = deadLetters[i];
      
      try {
        const replayResult = await replaySingleEvent(dl);
        
        if (replayResult.skipped) {
          result.skipped++;
          dl.status = 'ignored';
        } else {
          result.success++;
          dl.status = 'reprocessed';
        }
        
        dl.processedAt = new Date();
        dl.processedBy = operator;
        dl.retryCount = (dl.retryCount || 0) + 1;
        await dl.save();
        
      } catch (error) {
        result.failed++;
        result.errors.push({
          deadLetterId: dl.id,
          error: error.message,
        });
        dl.status = 'failed';
        dl.lastError = error.message;
        dl.retryCount = (dl.retryCount || 0) + 1;
        await dl.save();
      }
      
      const progress = Math.round(((i + 1) / deadLetters.length) * 100);
      result.progress = progress;
      
      broadcastReplayProgress(jobId, {
        progress,
        processed: i + 1,
        total: deadLetters.length,
        success: result.success,
        skipped: result.skipped,
        failed: result.failed,
      });
    }
    
    result.endTime = new Date();
    result.durationMs = result.endTime.getTime() - result.startTime.getTime();
    
    await createAuditLog({
      operationType: 'event_replay',
      operator,
      reason: '事件重放',
      metadata: {
        jobId,
        total: result.total,
        success: result.success,
        skipped: result.skipped,
        failed: result.failed,
        durationMs: result.durationMs,
      },
      affectedCount: result.success,
      status: result.failed > 0 ? 'partial' : 'success',
      errorMessage: result.failed > 0 ? `${result.failed} 条事件重放失败` : null,
    });
    
    if (triggerReconciliation && result.success > 0) {
      const tenantIds = [...new Set(deadLetters.map(dl => dl.eventData.tenantId || dl.tenantId))];
      const minTimestamp = new Date(Math.min(...deadLetters.map(dl => new Date(dl.eventData.timestamp).getTime())));
      const maxTimestamp = new Date(Math.max(...deadLetters.map(dl => new Date(dl.eventData.timestamp).getTime())));
      
      await createReconciliationTask({
        taskType: 'partial',
        startDate: minTimestamp,
        endDate: maxTimestamp,
        tenantIds,
        triggeredBy: 'system-auto',
      });
      
      result.triggeredReconciliation = true;
    }
    
    broadcastReplayProgress(jobId, {
      ...result,
      completed: true,
    });
    
    return result;
    
  } finally {
    setTimeout(() => {
      activeReplayJobs.delete(jobId);
    }, 30 * 60 * 1000);
  }
}

async function replaySingleEvent(deadLetter) {
  const eventData = deadLetter.eventData;
  const tenantId = eventData.tenantId || deadLetter.tenantId;
  const apiInterfaceId = eventData.apiInterfaceId;
  const timestamp = new Date(eventData.timestamp);
  const eventId = getEventId(tenantId, apiInterfaceId, timestamp);
  const month = getMonthKey(timestamp);
  
  const existing = await MeteringEvent.findOne({
    where: { eventId },
    attributes: ['id'],
  });
  
  if (existing) {
    return { skipped: true, reason: 'duplicate' };
  }
  
  const tx = await sequelize.transaction();
  
  try {
    const dataTransferMB = eventData.requestSize && eventData.responseSize
      ? (Number(eventData.requestSize) + Number(eventData.responseSize)) / (1024 * 1024)
      : Number(eventData.dataTransferMB || 0);
    
    const computeSeconds = eventData.duration
      ? Number(eventData.duration) / 1000
      : Number(eventData.computeSeconds || 0);
    
    const isSuccess = eventData.statusCode 
      ? eventData.statusCode >= 200 && eventData.statusCode < 300
      : (eventData.isSuccess !== undefined ? eventData.isSuccess : true);
    
    await MeteringEvent.create({
      eventId,
      tenantId,
      apiInterfaceId,
      timestamp,
      month,
      statusCode: eventData.statusCode || 200,
      requestSize: Number(eventData.requestSize || 0),
      responseSize: Number(eventData.responseSize || 0),
      duration: Number(eventData.duration || 0),
      isSuccess,
      dataTransferMB,
      computeSeconds,
    }, { transaction: tx });
    
    await updateAggregationsForEvent(
      tenantId,
      apiInterfaceId,
      timestamp,
      month,
      1,
      isSuccess ? 1 : 0,
      Number(eventData.requestSize || 0),
      Number(eventData.responseSize || 0),
      Number(eventData.duration || 0),
      dataTransferMB,
      computeSeconds,
      tx
    );
    
    await tx.commit();
    
    return { success: true, eventId };
  } catch (error) {
    await tx.rollback();
    throw error;
  }
}

async function updateAggregationsForEvent(
  tenantId,
  apiInterfaceId,
  timestamp,
  month,
  callCount,
  successCount,
  requestSize,
  responseSize,
  duration,
  dataTransferMB,
  computeSeconds,
  tx
) {
  const minuteStart = getMinuteStart(timestamp);
  const minuteEnd = getMinuteEnd(timestamp);
  const hourStart = getMinuteStart(timestamp);
  const hourEnd = getMinuteEnd(timestamp);
  const dayStart = getDayStart(timestamp);
  const dayEnd = getDayEnd(timestamp);
  
  const aggregations = [
    { granularity: 'minute', periodStart: minuteStart, periodEnd: minuteEnd },
    { granularity: 'hour', periodStart: hourStart, periodEnd: hourEnd },
    { granularity: 'day', periodStart: dayStart, periodEnd: dayEnd },
  ];
  
  for (const agg of aggregations) {
    const existing = await UsageAggregation.findOne({
      where: {
        tenantId,
        apiInterfaceId,
        granularity: agg.granularity,
        periodStart: agg.periodStart,
      },
      transaction: tx,
    });
    
    if (existing) {
      await existing.increment({
        callCount,
        successCount,
        totalRequestSize: requestSize,
        totalResponseSize: responseSize,
        totalDuration: duration,
        dataTransferMB,
        computeSeconds,
      }, { transaction: tx });
    } else {
      await UsageAggregation.create({
        tenantId,
        apiInterfaceId,
        granularity: agg.granularity,
        periodStart: agg.periodStart,
        periodEnd: agg.periodEnd,
        month,
        callCount,
        successCount,
        totalRequestSize: requestSize,
        totalResponseSize: responseSize,
        totalDuration: duration,
        dataTransferMB,
        computeSeconds,
      }, { transaction: tx });
    }
  }
}

export function getReplayProgress(jobId) {
  return activeReplayJobs.get(jobId) || null;
}

replayQueue.process(processEventReplay);

export default {
  getDeadLetterEvents,
  replayEvents,
  processEventReplay,
  getReplayProgress,
};
