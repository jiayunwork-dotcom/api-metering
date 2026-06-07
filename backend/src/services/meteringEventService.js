import redis from '../config/redis.js';
import { eventPersistenceQueue, aggregationQueue } from '../config/queue.js';
import { MeteringEvent, Tenant, ApiInterface, DeadLetterEvent } from '../models/index.js';
import { getEventId, getMonthKey, getMinuteStart, getMinuteEnd } from '../utils/dateUtils.js';
import { Op } from 'sequelize';

const EVENT_BUFFER_KEY = 'metering_events:buffer';
const EVENT_BUFFER_MAX_SIZE = 10000;
const EVENT_BUFFER_FLUSH_INTERVAL = 30000;
const MAX_BATCH_SIZE = 500;
const EVENT_DEDUP_TTL = 3600;

let flushTimer = null;

export function startEventBufferFlush() {
  if (flushTimer) return;
  
  flushTimer = setInterval(async () => {
    try {
      await flushEventBuffer();
    } catch (error) {
      console.error('Event buffer flush failed:', error);
    }
  }, EVENT_BUFFER_FLUSH_INTERVAL);
  
  console.log('Event buffer flush timer started');
}

export function stopEventBufferFlush() {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
    console.log('Event buffer flush timer stopped');
  }
}

export async function collectEvents(events, apiKeyId = null) {
  if (!Array.isArray(events) || events.length === 0) {
    return { success: true, processed: 0, duplicates: 0 };
  }

  if (events.length > MAX_BATCH_SIZE) {
    throw new Error(`Batch size exceeds maximum of ${MAX_BATCH_SIZE}`);
  }

  const tenantCache = new Map();
  const apiCache = new Map();
  const processedEvents = [];
  let duplicateCount = 0;

  for (const event of events) {
    try {
      let tenant = tenantCache.get(event.tenantCode);
      if (!tenant) {
        tenant = await Tenant.findOne({
          where: { code: event.tenantCode, status: 'active' },
          attributes: ['id', 'status'],
        });
        if (!tenant) {
          throw new Error(`Tenant not found or disabled: ${event.tenantCode}`);
        }
        tenantCache.set(event.tenantCode, tenant);
      }

      let apiInterface = apiCache.get(event.apiPath);
      if (!apiInterface) {
        apiInterface = await ApiInterface.findOne({
          where: { path: event.apiPath, method: event.method || 'POST', status: 'active' },
          attributes: ['id', 'status'],
        });
        if (!apiInterface) {
          throw new Error(`API interface not found or disabled: ${event.apiPath}`);
        }
        apiCache.set(event.apiPath, apiInterface);
      }

      const timestamp = event.timestamp ? new Date(event.timestamp) : new Date();
      const eventId = getEventId(tenant.id, apiInterface.id, timestamp);

      const isDuplicate = await redis.set(
        `metering:dedup:${eventId}`,
        '1',
        'EX',
        EVENT_DEDUP_TTL,
        'NX'
      );

      if (!isDuplicate) {
        duplicateCount++;
        continue;
      }

      const totalSize = (event.requestSize || 0) + (event.responseSize || 0);
      const processedEvent = {
        eventId,
        tenantId: tenant.id,
        apiInterfaceId: apiInterface.id,
        timestamp,
        month: getMonthKey(timestamp),
        statusCode: event.statusCode,
        requestSize: event.requestSize || 0,
        responseSize: event.responseSize || 0,
        duration: event.duration || 0,
        totalSize,
        isSuccess: event.statusCode >= 200 && event.statusCode < 300,
        apiKeyId: event.apiKeyId || apiKeyId,
      };

      processedEvents.push(processedEvent);

      const bufferLen = await redis.lpush(
        EVENT_BUFFER_KEY,
        JSON.stringify(processedEvent)
      );

      if (bufferLen >= EVENT_BUFFER_MAX_SIZE) {
        await flushEventBuffer();
      }
    } catch (error) {
      console.error('Event processing failed:', error);
      await DeadLetterEvent.create({
        eventData: event,
        errorMessage: error.message,
        errorStack: error.stack,
        tenantId: tenantCache.get(event.tenantCode)?.id,
        month: getMonthKey(event.timestamp || new Date()),
      });
    }
  }

  return {
    success: true,
    processed: processedEvents.length,
    duplicates: duplicateCount,
  };
}

export async function flushEventBuffer() {
  const events = [];
  let batch;

  do {
    batch = await redis.rpop(EVENT_BUFFER_KEY, MAX_BATCH_SIZE);
    if (batch && batch.length > 0) {
      events.push(...batch.map(e => JSON.parse(e)));
    }
  } while (batch && batch.length > 0);

  if (events.length === 0) {
    return { flushed: 0 };
  }

  await eventPersistenceQueue.add({ events }, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
  });

  return { flushed: events.length };
}

export async function processEventPersistence(job) {
  const { events } = job.data;
  
  try {
    const result = await MeteringEvent.bulkCreate(events, {
      ignoreDuplicates: true,
      fields: [
        'eventId', 'tenantId', 'apiInterfaceId', 'timestamp', 'month',
        'statusCode', 'requestSize', 'responseSize', 'duration', 'isSuccess', 'apiKeyId',
      ],
    });

    const insertedCount = result.length;

    const minuteGroups = new Map();
    for (const event of events) {
      const minuteStart = getMinuteStart(event.timestamp);
      const key = `${event.tenantId}:${event.apiInterfaceId}:${minuteStart.getTime()}`;
      
      if (!minuteGroups.has(key)) {
        minuteGroups.set(key, {
          tenantId: event.tenantId,
          apiInterfaceId: event.apiInterfaceId,
          periodStart: minuteStart,
          periodEnd: getMinuteEnd(event.timestamp),
          month: event.month,
          callCount: 0,
          successCount: 0,
          totalRequestSize: 0,
          totalResponseSize: 0,
          totalDuration: 0,
        });
      }

      const group = minuteGroups.get(key);
      group.callCount++;
      if (event.isSuccess) group.successCount++;
      group.totalRequestSize += event.requestSize;
      group.totalResponseSize += event.responseSize;
      group.totalDuration += event.duration;
    }

    const aggregations = Array.from(minuteGroups.values()).map(g => ({
      ...g,
      dataTransferMB: (g.totalRequestSize + g.totalResponseSize) / (1024 * 1024),
      computeSeconds: g.totalDuration / 1000,
    }));

    if (aggregations.length > 0) {
      await aggregationQueue.add({
        granularity: 'minute',
        aggregations,
      }, {
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
      });
    }

    console.log(`Persisted ${insertedCount} events, queued ${aggregations.length} minute aggregations`);
    return { insertedCount, aggregatedCount: aggregations.length };
  } catch (error) {
    console.error('Event persistence failed:', error);
    
    for (const event of events) {
      await DeadLetterEvent.findOrCreate({
        where: { eventId: event.eventId },
        defaults: {
          eventData: event,
          errorMessage: error.message,
          errorStack: error.stack,
          tenantId: event.tenantId,
          month: event.month,
        },
      });
    }
    
    throw error;
  }
}

export async function getEventStats(tenantId, apiInterfaceId, startDate, endDate) {
  const where = {
    timestamp: {
      [Op.between]: [startDate, endDate],
    },
  };
  
  if (tenantId) where.tenantId = tenantId;
  if (apiInterfaceId) where.apiInterfaceId = apiInterfaceId;

  return await MeteringEvent.count({ where });
}

export async function reprocessDeadLetterEvents(deadLetterIds) {
  const deadLetters = await DeadLetterEvent.findAll({
    where: { id: deadLetterIds, status: 'pending' },
  });

  const results = [];
  for (const dl of deadLetters) {
    try {
      const event = dl.eventData;
      const processed = await collectEvents([{
        tenantCode: event.tenantCode,
        apiPath: event.apiPath,
        method: event.method,
        timestamp: event.timestamp,
        statusCode: event.statusCode,
        requestSize: event.requestSize,
        responseSize: event.responseSize,
        duration: event.duration,
      }]);

      if (processed.processed > 0) {
        dl.status = 'reprocessed';
        dl.processedAt = new Date();
        await dl.save();
        results.push({ id: dl.id, success: true });
      } else {
        results.push({ id: dl.id, success: false, reason: 'Duplicate or failed' });
      }
    } catch (error) {
      dl.retryCount = dl.retryCount + 1;
      dl.errorMessage = error.message;
      if (dl.retryCount >= 5) {
        dl.status = 'failed';
      }
      await dl.save();
      results.push({ id: dl.id, success: false, error: error.message });
    }
  }

  return results;
}

eventPersistenceQueue.process(processEventPersistence);

export default {
  collectEvents,
  flushEventBuffer,
  startEventBufferFlush,
  stopEventBufferFlush,
  processEventPersistence,
  getEventStats,
  reprocessDeadLetterEvents,
};
