import {
  sequelize,
  Op,
  fn,
  col,
  ReconciliationDiff,
  ReconciliationTask,
  ReconciliationAuditLog,
  MeteringEvent,
  UsageAggregation,
  Quota,
  Bill,
  BillItem,
  Tenant,
  ApiInterface,
} from '../models/index.js';
import redis from '../config/redis.js';
import { getQuotaRedisKey } from './quotaService.js';
import { getMonthKey, getDayStart, getDayEnd, getMinuteStart, getMinuteEnd } from '../utils/dateUtils.js';
import { createAuditLog } from './reconciliationService.js';
import dayjs from 'dayjs';

const DIMENSION_FIELD_MAP = {
  count: {
    eventField: 'id',
    eventAggFn: 'COUNT',
    aggregationField: 'callCount',
  },
  data_transfer: {
    eventField: 'dataTransferMB',
    eventAggFn: 'SUM',
    aggregationField: 'dataTransferMB',
  },
  compute_time: {
    eventField: 'computeSeconds',
    eventAggFn: 'SUM',
    aggregationField: 'computeSeconds',
  },
};

export async function resolveDiff(diffId, strategy, operator, options = {}) {
  const diff = await ReconciliationDiff.findByPk(diffId);
  if (!diff) {
    throw new Error(`差异记录 ${diffId} 不存在`);
  }

  if (['resolved', 'ignored'].includes(diff.status)) {
    return {
      success: false,
      alreadyResolved: true,
      message: '该差异已处理，请勿重复操作',
      status: diff.status,
    };
  }

  if (diff.status === 'processing') {
    return {
      success: false,
      processing: true,
      message: '该差异正在处理中，请稍后再试',
    };
  }

  diff.status = 'processing';
  await diff.save();

  try {
    let result;
    const beforeValues = {
      redisQuotaValue: diff.redisQuotaValue,
      dbAggregationValue: diff.dbAggregationValue,
      eventSumValue: diff.eventSumValue,
    };

    switch (strategy) {
      case 'auto':
        result = await autoFixDiff(diff, operator, options.reason);
        break;
      case 'manual':
        if (options.manualValue === undefined || options.manualValue === null) {
          throw new Error('手动修正必须提供修正值');
        }
        result = await manualFixDiff(diff, operator, options.manualValue, options.reason);
        break;
      case 'ignore':
        result = await ignoreDiff(diff, operator, options.reason);
        break;
      case 'migrate':
        if (diff.diffType !== 'cross_month_misplacement') {
          throw new Error('只有跨月归属错误的差异才能执行迁移操作');
        }
        result = await migrateCrossMonthEvents(diff, operator, options.reason);
        break;
      default:
        throw new Error(`不支持的修正策略: ${strategy}`);
    }

    diff.status = result.status;
    diff.resolutionStrategy = strategy;
    diff.resolvedAt = new Date();
    diff.resolvedBy = operator;
    diff.resolutionReason = options.reason;
    diff.beforeValues = beforeValues;
    diff.afterValues = result.afterValues;
    if (strategy === 'manual') {
      diff.manualCorrectionValue = options.manualValue;
    }
    await diff.save();

    await createAuditLog({
      operationType: getAuditOperationType(strategy),
      operator,
      taskId: diff.taskId,
      diffId: diff.id,
      beforeValues,
      afterValues: result.afterValues,
      reason: options.reason || `${getStrategyName(strategy)}修正`,
      affectedCount: result.affectedCount || 1,
      status: 'success',
    });

    return {
      success: true,
      ...result,
    };
  } catch (error) {
    console.error(`修正差异 ${diffId} 失败:`, error);
    diff.status = 'failed';
    diff.lastError = error.message;
    diff.retryCount = (diff.retryCount || 0) + 1;
    await diff.save();

    await createAuditLog({
      operationType: getAuditOperationType(strategy),
      operator,
      taskId: diff.taskId,
      diffId: diff.id,
      reason: options.reason,
      status: 'failed',
      errorMessage: error.message,
    });

    throw error;
  }
}

async function autoFixDiff(diff, operator, reason) {
  const { tenantId, apiInterfaceId, dateKey, month, dimension, expectedValue } = diff;
  const dimensionConfig = DIMENSION_FIELD_MAP[dimension];
  const aggField = dimensionConfig.aggregationField;

  const tx = await sequelize.transaction();

  try {
    const dayStart = getDayStart(dayjs(dateKey).toDate());
    const dayEnd = getDayEnd(dayjs(dateKey).toDate());

    const eventSum = await MeteringEvent.findOne({
      where: {
        tenantId,
        apiInterfaceId,
        timestamp: {
          [Op.between]: [dayStart, dayEnd],
        },
      },
      attributes: [
        [fn(dimensionConfig.eventAggFn, col(dimensionConfig.eventField)), 'value'],
      ],
      raw: true,
      transaction: tx,
    });

    const correctValue = Number(eventSum?.value || 0);

    const existingAgg = await UsageAggregation.findOne({
      where: {
        tenantId,
        apiInterfaceId,
        granularity: 'day',
        periodStart: dayStart,
      },
      transaction: tx,
    });

    if (existingAgg) {
      await existingAgg.update({
        [aggField]: correctValue,
        version: existingAgg.version + 1,
      }, { transaction: tx });
    } else {
      await UsageAggregation.create({
        tenantId,
        apiInterfaceId,
        granularity: 'day',
        periodStart: dayStart,
        periodEnd: dayEnd,
        month,
        [aggField]: correctValue,
        callCount: dimension === 'count' ? correctValue : 0,
        successCount: 0,
        totalRequestSize: 0,
        totalResponseSize: 0,
        totalDuration: 0,
        dataTransferMB: dimension === 'data_transfer' ? correctValue : 0,
        computeSeconds: dimension === 'compute_time' ? correctValue : 0,
      }, { transaction: tx });
    }

    const quotas = await Quota.findAll({
      where: {
        tenantId,
        apiInterfaceId: { [Op.or]: [apiInterfaceId, null] },
        month,
        dimension,
      },
      transaction: tx,
    });

    for (const quota of quotas) {
      const key = getQuotaRedisKey(
        tenantId,
        quota.apiInterfaceId,
        quota.type,
        dimension,
        month
      );

      const currentRedis = parseFloat(await redis.get(key) || '0');
      const redisDiff = correctValue - currentRedis;

      if (Math.abs(redisDiff) > 0.0001) {
        await redis.set(key, correctValue.toString());
      }
    }

    await tx.commit();

    const afterValues = {
      redisQuotaValue: correctValue,
      dbAggregationValue: correctValue,
      eventSumValue: correctValue,
    };

    return {
      status: 'resolved',
      afterValues,
      affectedCount: 1,
      message: '自动修正成功',
      correctValue,
    };
  } catch (error) {
    await tx.rollback();
    throw error;
  }
}

async function manualFixDiff(diff, operator, manualValue, reason) {
  const { tenantId, apiInterfaceId, dateKey, month, dimension } = diff;
  const dimensionConfig = DIMENSION_FIELD_MAP[dimension];
  const aggField = dimensionConfig.aggregationField;

  const tx = await sequelize.transaction();

  try {
    const dayStart = getDayStart(dayjs(dateKey).toDate());
    const dayEnd = getDayEnd(dayjs(dateKey).toDate());

    const existingAgg = await UsageAggregation.findOne({
      where: {
        tenantId,
        apiInterfaceId,
        granularity: 'day',
        periodStart: dayStart,
      },
      transaction: tx,
    });

    const manualNum = Number(manualValue);

    if (existingAgg) {
      await existingAgg.update({
        [aggField]: manualNum,
        version: existingAgg.version + 1,
      }, { transaction: tx });
    } else {
      await UsageAggregation.create({
        tenantId,
        apiInterfaceId,
        granularity: 'day',
        periodStart: dayStart,
        periodEnd: dayEnd,
        month,
        [aggField]: manualNum,
        callCount: dimension === 'count' ? manualNum : 0,
        successCount: 0,
        totalRequestSize: 0,
        totalResponseSize: 0,
        totalDuration: 0,
        dataTransferMB: dimension === 'data_transfer' ? manualNum : 0,
        computeSeconds: dimension === 'compute_time' ? manualNum : 0,
      }, { transaction: tx });
    }

    const quotas = await Quota.findAll({
      where: {
        tenantId,
        apiInterfaceId: { [Op.or]: [apiInterfaceId, null] },
        month,
        dimension,
      },
      transaction: tx,
    });

    for (const quota of quotas) {
      const key = getQuotaRedisKey(
        tenantId,
        quota.apiInterfaceId,
        quota.type,
        dimension,
        month
      );
      await redis.set(key, manualNum.toString());
    }

    await tx.commit();

    const afterValues = {
      redisQuotaValue: manualNum,
      dbAggregationValue: manualNum,
      eventSumValue: diff.eventSumValue,
    };

    return {
      status: 'resolved',
      afterValues,
      affectedCount: 1,
      message: '手动修正成功',
      manualValue: manualNum,
    };
  } catch (error) {
    await tx.rollback();
    throw error;
  }
}

async function ignoreDiff(diff, operator, reason) {
  return {
    status: 'ignored',
    afterValues: {
      redisQuotaValue: diff.redisQuotaValue,
      dbAggregationValue: diff.dbAggregationValue,
      eventSumValue: diff.eventSumValue,
    },
    affectedCount: 1,
    message: '已忽略该差异',
  };
}

async function migrateCrossMonthEvents(diff, operator, reason) {
  const { tenantId, apiInterfaceId, sourceMonth, targetMonth, eventIds } = diff;

  if (!eventIds || eventIds.length === 0) {
    throw new Error('没有需要迁移的事件');
  }

  const targetBill = await Bill.findOne({
    where: {
      tenantId,
      month: targetMonth,
      status: 'confirmed',
    },
  });

  if (targetBill) {
    throw new Error(`目标月份 ${targetMonth} 的账单已确认，请先将账单回退为待确认状态后再执行迁移`);
  }

  const tx = await sequelize.transaction();

  try {
    const events = await MeteringEvent.findAll({
      where: {
        eventId: { [Op.in]: eventIds },
      },
      transaction: tx,
    });

    if (events.length === 0) {
      throw new Error('未找到需要迁移的事件');
    }

    let sourceCallCount = 0;
    let sourceSuccessCount = 0;
    let sourceRequestSize = 0;
    let sourceResponseSize = 0;
    let sourceDuration = 0;
    let sourceDataTransfer = 0;
    let sourceComputeSeconds = 0;

    for (const event of events) {
      sourceCallCount += 1;
      sourceSuccessCount += event.isSuccess ? 1 : 0;
      sourceRequestSize += Number(event.requestSize || 0);
      sourceResponseSize += Number(event.responseSize || 0);
      sourceDuration += Number(event.duration || 0);
      sourceDataTransfer += Number(event.dataTransferMB || 0);
      sourceComputeSeconds += Number(event.computeSeconds || 0);

      event.month = targetMonth;
      await event.save({ transaction: tx });
    }

    const sourceDays = new Set(events.map(e => dayjs(e.timestamp).format('YYYY-MM-DD')));
    for (const dayKey of sourceDays) {
      const dayStart = getDayStart(dayjs(dayKey).toDate());
      const dayEnd = getDayEnd(dayjs(dayKey).toDate());

      const sourceAgg = await UsageAggregation.findOne({
        where: {
          tenantId,
          apiInterfaceId,
          granularity: 'day',
          periodStart: dayStart,
          month: sourceMonth,
        },
        transaction: tx,
      });

      if (sourceAgg) {
        await sourceAgg.decrement({
          callCount: sourceCallCount,
          successCount: sourceSuccessCount,
          totalRequestSize: sourceRequestSize,
          totalResponseSize: sourceResponseSize,
          totalDuration: sourceDuration,
          dataTransferMB: sourceDataTransfer,
          computeSeconds: sourceComputeSeconds,
        }, { transaction: tx });
      }
    }

    const targetDays = new Set(events.map(e => dayjs(e.timestamp).format('YYYY-MM-DD')));
    for (const dayKey of targetDays) {
      const dayStart = getDayStart(dayjs(dayKey).toDate());
      const dayEnd = getDayEnd(dayjs(dayKey).toDate());

      const targetAgg = await UsageAggregation.findOne({
        where: {
          tenantId,
          apiInterfaceId,
          granularity: 'day',
          periodStart: dayStart,
          month: targetMonth,
        },
        transaction: tx,
      });

      if (targetAgg) {
        await targetAgg.increment({
          callCount: sourceCallCount,
          successCount: sourceSuccessCount,
          totalRequestSize: sourceRequestSize,
          totalResponseSize: sourceResponseSize,
          totalDuration: sourceDuration,
          dataTransferMB: sourceDataTransfer,
          computeSeconds: sourceComputeSeconds,
        }, { transaction: tx });
      } else {
        await UsageAggregation.create({
          tenantId,
          apiInterfaceId,
          granularity: 'day',
          periodStart: dayStart,
          periodEnd: dayEnd,
          month: targetMonth,
          callCount: sourceCallCount,
          successCount: sourceSuccessCount,
          totalRequestSize: sourceRequestSize,
          totalResponseSize: sourceResponseSize,
          totalDuration: sourceDuration,
          dataTransferMB: sourceDataTransfer,
          computeSeconds: sourceComputeSeconds,
        }, { transaction: tx });
      }
    }

    const sourceBill = await Bill.findOne({
      where: {
        tenantId,
        month: sourceMonth,
      },
      transaction: tx,
    });

    if (sourceBill) {
      await updateBillAmounts(sourceBill, tenantId, sourceMonth, tx);
    }

    const targetBillToUpdate = await Bill.findOne({
      where: {
        tenantId,
        month: targetMonth,
      },
      transaction: tx,
    });

    if (targetBillToUpdate) {
      await updateBillAmounts(targetBillToUpdate, tenantId, targetMonth, tx);
    }

    await tx.commit();

    return {
      status: 'resolved',
      afterValues: {
        migratedCount: events.length,
        sourceMonth,
        targetMonth,
      },
      affectedCount: events.length,
      message: `成功迁移 ${events.length} 条事件从 ${sourceMonth} 到 ${targetMonth}`,
    };
  } catch (error) {
    await tx.rollback();
    throw error;
  }
}

async function updateBillAmounts(bill, tenantId, month, tx) {
  const aggregations = await UsageAggregation.findAll({
    where: {
      tenantId,
      month,
      granularity: 'day',
    },
    attributes: [
      'apiInterfaceId',
      [fn('SUM', col('callCount')), 'totalCalls'],
      [fn('SUM', col('dataTransferMB')), 'totalData'],
      [fn('SUM', col('computeSeconds')), 'totalCompute'],
    ],
    group: ['apiInterfaceId'],
    transaction: tx,
  });

  let subtotal = 0;
  for (const agg of aggregations) {
    const calls = Number(agg.get('totalCalls') || 0);
    const data = Number(agg.get('totalData') || 0);
    const compute = Number(agg.get('totalCompute') || 0);

    const billItem = await BillItem.findOne({
      where: {
        billId: bill.id,
        apiInterfaceId: agg.apiInterfaceId,
      },
      transaction: tx,
    });

    if (billItem) {
      const rule = billItem.rateRule || {};
      let amount = 0;
      if (rule.callRate) amount += calls * Number(rule.callRate);
      if (rule.dataRate) amount += data * Number(rule.dataRate);
      if (rule.computeRate) amount += compute * Number(rule.computeRate);

      await billItem.update({
        callCount: calls,
        dataTransferMB: data,
        computeSeconds: compute,
        subtotalAmount: amount,
      }, { transaction: tx });

      subtotal += amount;
    }
  }

  if (bill.status === 'draft' || bill.status === 'pending_confirm') {
    await bill.update({
      subtotalAmount: subtotal,
      totalAmount: Math.max(0, subtotal - Number(bill.freeDeduction || 0) - Number(bill.packageDeduction || 0) + Number(bill.taxAmount || 0)),
    }, { transaction: tx });
  }
}

export async function batchResolveDiffs(diffIds, strategy, operator, options = {}) {
  const results = [];
  const successCount = { count: 0 };
  const failedCount = { count: 0 };

  for (const diffId of diffIds) {
    try {
      const result = await resolveDiff(diffId, strategy, operator, options);
      results.push({ diffId, ...result });
      if (result.success) {
        successCount.count++;
      } else {
        failedCount.count++;
      }
    } catch (error) {
      results.push({
        diffId,
        success: false,
        error: error.message,
      });
      failedCount.count++;
    }
  }

  return {
    success: true,
    total: diffIds.length,
    successCount: successCount.count,
    failedCount: failedCount.count,
    results,
  };
}

function getAuditOperationType(strategy) {
  const map = {
    auto: 'diff_auto_fix',
    manual: 'diff_manual_fix',
    ignore: 'diff_ignore',
    migrate: 'diff_migrate',
  };
  return map[strategy] || 'diff_auto_fix';
}

function getStrategyName(strategy) {
  const map = {
    auto: '自动',
    manual: '手动',
    ignore: '忽略',
    migrate: '迁移',
  };
  return map[strategy] || strategy;
}

export default {
  resolveDiff,
  batchResolveDiffs,
};
