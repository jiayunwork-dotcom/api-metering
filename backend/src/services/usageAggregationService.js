import { aggregationQueue } from '../config/queue.js';
import { UsageAggregation, MeteringEvent, Op, sequelize } from '../models/index.js';
import {
  getMinuteStart, getMinuteEnd,
  getHourStart, getHourEnd,
  getDayStart, getDayEnd,
  getMonthKey,
} from '../utils/dateUtils.js';

const AGGREGATION_RETENTION = {
  minute: 7 * 24 * 60,
  hour: 90 * 24,
  day: Infinity,
};

export async function processMinuteAggregation(job) {
  const { aggregations } = job.data;
  
  try {
    for (const agg of aggregations) {
      const existing = await UsageAggregation.findOne({
        where: {
          tenantId: agg.tenantId,
          apiInterfaceId: agg.apiInterfaceId,
          granularity: 'minute',
          periodStart: agg.periodStart,
        },
      });

      if (existing) {
        await existing.increment({
          callCount: agg.callCount,
          successCount: agg.successCount,
          totalRequestSize: agg.totalRequestSize,
          totalResponseSize: agg.totalResponseSize,
          totalDuration: agg.totalDuration,
          dataTransferMB: agg.dataTransferMB,
          computeSeconds: agg.computeSeconds,
          version: 1,
        });
      } else {
        await UsageAggregation.create({
          ...agg,
          granularity: 'minute',
        });
      }
    }

    const hourGroups = new Map();
    for (const agg of aggregations) {
      const hourStart = getHourStart(agg.periodStart);
      const key = `${agg.tenantId}:${agg.apiInterfaceId}:${hourStart.getTime()}`;
      
      if (!hourGroups.has(key)) {
        hourGroups.set(key, {
          tenantId: agg.tenantId,
          apiInterfaceId: agg.apiInterfaceId,
          periodStart: hourStart,
          periodEnd: getHourEnd(agg.periodStart),
          month: agg.month,
          callCount: 0,
          successCount: 0,
          totalRequestSize: 0,
          totalResponseSize: 0,
          totalDuration: 0,
          dataTransferMB: 0,
          computeSeconds: 0,
        });
      }

      const group = hourGroups.get(key);
      group.callCount += agg.callCount;
      group.successCount += agg.successCount;
      group.totalRequestSize += agg.totalRequestSize;
      group.totalResponseSize += agg.totalResponseSize;
      group.totalDuration += agg.totalDuration;
      group.dataTransferMB += agg.dataTransferMB;
      group.computeSeconds += agg.computeSeconds;
    }

    const hourAggregations = Array.from(hourGroups.values());
    
    if (hourAggregations.length > 0) {
      await aggregationQueue.add({
        granularity: 'hour',
        aggregations: hourAggregations,
      }, {
        attempts: 5,
        delay: 60000,
        backoff: { type: 'exponential', delay: 5000 },
      });
    }

    console.log(`Processed ${aggregations.length} minute aggregations, queued ${hourAggregations.length} hour aggregations`);
    return { processed: aggregations.length };
  } catch (error) {
    console.error('Minute aggregation failed:', error);
    throw error;
  }
}

export async function processHourAggregation(job) {
  const { aggregations } = job.data;
  
  try {
    for (const agg of aggregations) {
      const existing = await UsageAggregation.findOne({
        where: {
          tenantId: agg.tenantId,
          apiInterfaceId: agg.apiInterfaceId,
          granularity: 'hour',
          periodStart: agg.periodStart,
        },
      });

      if (existing) {
        await existing.update({
          callCount: agg.callCount,
          successCount: agg.successCount,
          totalRequestSize: agg.totalRequestSize,
          totalResponseSize: agg.totalResponseSize,
          totalDuration: agg.totalDuration,
          dataTransferMB: agg.dataTransferMB,
          computeSeconds: agg.computeSeconds,
          version: existing.version + 1,
        });
      } else {
        await UsageAggregation.create({
          ...agg,
          granularity: 'hour',
        });
      }
    }

    const dayGroups = new Map();
    for (const agg of aggregations) {
      const dayStart = getDayStart(agg.periodStart);
      const key = `${agg.tenantId}:${agg.apiInterfaceId}:${dayStart.getTime()}`;
      
      if (!dayGroups.has(key)) {
        dayGroups.set(key, {
          tenantId: agg.tenantId,
          apiInterfaceId: agg.apiInterfaceId,
          periodStart: dayStart,
          periodEnd: getDayEnd(agg.periodStart),
          month: agg.month,
          callCount: 0,
          successCount: 0,
          totalRequestSize: 0,
          totalResponseSize: 0,
          totalDuration: 0,
          dataTransferMB: 0,
          computeSeconds: 0,
        });
      }

      const group = dayGroups.get(key);
      group.callCount += agg.callCount;
      group.successCount += agg.successCount;
      group.totalRequestSize += agg.totalRequestSize;
      group.totalResponseSize += agg.totalResponseSize;
      group.totalDuration += agg.totalDuration;
      group.dataTransferMB += agg.dataTransferMB;
      group.computeSeconds += agg.computeSeconds;
    }

    const dayAggregations = Array.from(dayGroups.values());
    
    if (dayAggregations.length > 0) {
      await aggregationQueue.add({
        granularity: 'day',
        aggregations: dayAggregations,
      }, {
        attempts: 5,
        delay: 300000,
        backoff: { type: 'exponential', delay: 10000 },
      });
    }

    console.log(`Processed ${aggregations.length} hour aggregations, queued ${dayAggregations.length} day aggregations`);
    return { processed: aggregations.length };
  } catch (error) {
    console.error('Hour aggregation failed:', error);
    throw error;
  }
}

export async function processDayAggregation(job) {
  const { aggregations } = job.data;
  
  try {
    for (const agg of aggregations) {
      const existing = await UsageAggregation.findOne({
        where: {
          tenantId: agg.tenantId,
          apiInterfaceId: agg.apiInterfaceId,
          granularity: 'day',
          periodStart: agg.periodStart,
        },
      });

      if (existing) {
        await existing.update({
          callCount: agg.callCount,
          successCount: agg.successCount,
          totalRequestSize: agg.totalRequestSize,
          totalResponseSize: agg.totalResponseSize,
          totalDuration: agg.totalDuration,
          dataTransferMB: agg.dataTransferMB,
          computeSeconds: agg.computeSeconds,
          version: existing.version + 1,
        });
      } else {
        await UsageAggregation.create({
          ...agg,
          granularity: 'day',
        });
      }
    }

    console.log(`Processed ${aggregations.length} day aggregations`);
    return { processed: aggregations.length };
  } catch (error) {
    console.error('Day aggregation failed:', error);
    throw error;
  }
}

export async function processAggregation(job) {
  const { granularity, aggregations } = job.data;
  
  switch (granularity) {
    case 'minute':
      return await processMinuteAggregation(job);
    case 'hour':
      return await processHourAggregation(job);
    case 'day':
      return await processDayAggregation(job);
    default:
      throw new Error(`Unknown granularity: ${granularity}`);
  }
}

export async function getUsageData(tenantId, apiInterfaceId, granularity, startDate, endDate) {
  const where = {
    granularity,
    periodStart: {
      [Op.between]: [startDate, endDate],
    },
  };

  if (tenantId) where.tenantId = tenantId;
  if (apiInterfaceId) where.apiInterfaceId = apiInterfaceId;

  return await UsageAggregation.findAll({
    where,
    order: [['periodStart', 'ASC']],
  });
}

export async function getMonthlyUsage(tenantId, month) {
  const targetMonth = month || getMonthKey();
  
  const result = await UsageAggregation.findAll({
    where: {
      tenantId,
      month: targetMonth,
      granularity: 'day',
    },
    attributes: [
      'apiInterfaceId',
      [sequelize.fn('SUM', sequelize.col('callCount')), 'totalCallCount'],
      [sequelize.fn('SUM', sequelize.col('successCount')), 'totalSuccessCount'],
      [sequelize.fn('SUM', sequelize.col('dataTransferMB')), 'totalDataTransferMB'],
      [sequelize.fn('SUM', sequelize.col('computeSeconds')), 'totalComputeSeconds'],
    ],
    group: ['apiInterfaceId'],
  });

  return result.map(r => ({
    apiInterfaceId: r.apiInterfaceId,
    callCount: r.get('totalCallCount'),
    successCount: r.get('totalSuccessCount'),
    dataTransferMB: r.get('totalDataTransferMB'),
    computeSeconds: r.get('totalComputeSeconds'),
  }));
}

export async function getTenantCurrentUsage(tenantId, month) {
  const targetMonth = month || getMonthKey();
  
  return await UsageAggregation.findAll({
    where: {
      tenantId,
      month: targetMonth,
      granularity: 'day',
    },
    include: ['ApiInterface'],
    attributes: [
      'apiInterfaceId',
      [sequelize.fn('SUM', sequelize.col('callCount')), 'callCount'],
      [sequelize.fn('SUM', sequelize.col('dataTransferMB')), 'dataTransferMB'],
      [sequelize.fn('SUM', sequelize.col('computeSeconds')), 'computeSeconds'],
    ],
    group: ['apiInterfaceId', 'ApiInterface.id'],
  });
}

export async function cleanupOldAggregations() {
  const now = new Date();
  const minuteCutoff = new Date(now.getTime() - AGGREGATION_RETENTION.minute * 60 * 1000);
  const hourCutoff = new Date(now.getTime() - AGGREGATION_RETENTION.hour * 60 * 60 * 1000);

  const minuteDeleted = await UsageAggregation.destroy({
    where: {
      granularity: 'minute',
      periodStart: { [Op.lt]: minuteCutoff },
    },
  });

  const hourDeleted = await UsageAggregation.destroy({
    where: {
      granularity: 'hour',
      periodStart: { [Op.lt]: hourCutoff },
    },
  });

  console.log(`Cleaned up ${minuteDeleted} minute aggregations, ${hourDeleted} hour aggregations`);
  return { minuteDeleted, hourDeleted };
}

aggregationQueue.process('aggregation', processAggregation);
aggregationQueue.process(processAggregation);

export default {
  processAggregation,
  processMinuteAggregation,
  processHourAggregation,
  processDayAggregation,
  getUsageData,
  getMonthlyUsage,
  getTenantCurrentUsage,
  cleanupOldAggregations,
};
