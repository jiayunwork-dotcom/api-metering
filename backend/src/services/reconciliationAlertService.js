import {
  ReconciliationAlertConfig,
  ReconciliationAlertRecord,
  ReconciliationTask,
  ReconciliationDiff,
  Tenant,
  ApiInterface,
  Op,
} from '../models/index.js';
import axios from 'axios';
import { alertQueue } from '../config/queue.js';

export { alertQueue };

export async function getAlertConfig() {
  let config = await ReconciliationAlertConfig.findOne({
    order: [['createdAt', 'DESC']],
  });

  if (!config) {
    config = await ReconciliationAlertConfig.create({
      enabled: true,
      diffThreshold: 5,
      notificationMethods: ['internal'],
    });
  }

  return config;
}

export async function updateAlertConfig(data) {
  let config = await ReconciliationAlertConfig.findOne({
    order: [['createdAt', 'DESC']],
  });

  if (!config) {
    config = await ReconciliationAlertConfig.create(data);
  } else {
    await config.update(data);
  }

  return config;
}

export async function testWebhook(webhookUrl, headers = {}, timeout = 5000) {
  const testPayload = {
    test: true,
    timestamp: new Date().toISOString(),
    message: 'This is a test message from API Metering Reconciliation Alert System',
    type: 'reconciliation_alert_test',
  };

  try {
    const startTime = Date.now();
    const response = await axios.post(webhookUrl, testPayload, {
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      timeout,
      validateStatus: () => true,
    });
    const duration = Date.now() - startTime;

    const result = {
      success: response.status >= 200 && response.status < 300,
      status: response.status,
      statusText: response.statusText,
      responseTime: duration,
      responseBody: typeof response.data === 'string' ? response.data : JSON.stringify(response.data),
      headers: response.headers,
    };

    const config = await ReconciliationAlertConfig.findOne({
      order: [['createdAt', 'DESC']],
    });
    if (config) {
      await config.update({
        lastTestedAt: new Date(),
        lastTestResult: result,
      });
    }

    return result;
  } catch (error) {
    const result = {
      success: false,
      error: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      responseBody: error.response?.data ? (typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data)) : undefined,
    };

    const config = await ReconciliationAlertConfig.findOne({
      order: [['createdAt', 'DESC']],
    });
    if (config) {
      await config.update({
        lastTestedAt: new Date(),
        lastTestResult: result,
      });
    }

    return result;
  }
}

export async function checkAndTriggerAlert(taskId) {
  const task = await ReconciliationTask.findByPk(taskId);
  if (!task) {
    throw new Error(`Task ${taskId} not found`);
  }

  const config = await getAlertConfig();
  if (!config.enabled) {
    console.log(`Alert is disabled, skipping for task ${taskId}`);
    return null;
  }

  if (task.diffCount <= config.diffThreshold) {
    console.log(`Diff count ${task.diffCount} is below threshold ${config.diffThreshold}, skipping alert for task ${taskId}`);
    return null;
  }

  console.log(`Triggering alert for task ${taskId}, diff count: ${task.diffCount}`);

  const diffs = await ReconciliationDiff.findAll({
    where: { taskId },
    include: [
      { model: Tenant, attributes: ['id', 'name', 'code'] },
      { model: ApiInterface, attributes: ['id', 'name', 'path'] },
    ],
    limit: 10,
    order: [['severity', 'DESC'], ['diffAmount', 'DESC']],
  });

  const alertContent = {
    taskId: task.id,
    taskNo: task.taskNo,
    taskType: task.taskType,
    diffCount: task.diffCount,
    quotaDiffCount: task.quotaDiffCount,
    aggregationDiffCount: task.aggregationDiffCount,
    eventMissingCount: task.eventMissingCount,
    triggeredAt: task.triggeredAt,
    completedAt: task.completedAt,
    diffs: diffs.map(d => ({
      id: d.id,
      diffType: d.diffType,
      severity: d.severity,
      tenantName: d.Tenant?.name,
      apiName: d.ApiInterface?.name,
      dateKey: d.dateKey,
      dimension: d.dimension,
      diffAmount: d.diffAmount,
      diffPercent: d.diffPercent,
    })),
  };

  const results = [];

  if (config.notificationMethods.includes('internal')) {
    const internalResult = await sendInternalNotification(task, alertContent);
    results.push({ channel: 'internal', ...internalResult });
  }

  if (config.notificationMethods.includes('webhook') && config.webhookUrl) {
    await alertQueue.add({
      taskId,
      config: config.toJSON(),
      alertContent,
      retryCount: 0,
    }, {
      attempts: 1,
    });
    results.push({ channel: 'webhook', status: 'queued' });
  }

  return {
    triggered: true,
    diffCount: task.diffCount,
    threshold: config.diffThreshold,
    results,
  };
}

async function sendInternalNotification(task, alertContent) {
  try {
    const record = await ReconciliationAlertRecord.create({
      taskId: task.id,
      diffCount: task.diffCount,
      alertTime: new Date(),
      channel: 'internal',
      sendStatus: 'success',
      alertContent,
      read: false,
    });

    return {
      success: true,
      recordId: record.id,
    };
  } catch (error) {
    console.error('Failed to create internal notification:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

export async function sendWebhookNotification(job) {
  const { taskId, config, alertContent, retryCount = 0 } = job.data;

  const record = await ReconciliationAlertRecord.create({
    taskId,
    diffCount: alertContent.diffCount,
    alertTime: new Date(),
    channel: 'webhook',
    sendStatus: retryCount > 0 ? 'retrying' : 'retrying',
    retryCount,
    alertContent,
  });

  try {
    const startTime = Date.now();
    const response = await axios.post(config.webhookUrl, {
      type: 'reconciliation_alert',
      timestamp: new Date().toISOString(),
      ...alertContent,
    }, {
      headers: {
        'Content-Type': 'application/json',
        ...config.webhookHeaders,
      },
      timeout: config.webhookTimeout || 5000,
      validateStatus: () => true,
    });
    const duration = Date.now() - startTime;

    if (response.status >= 200 && response.status < 300) {
      await record.update({
        sendStatus: 'success',
        lastHttpStatus: response.status,
        lastHttpResponse: typeof response.data === 'string' ? response.data : JSON.stringify(response.data),
      });
      console.log(`Webhook sent successfully for task ${taskId}, status: ${response.status}, time: ${duration}ms`);
      return { success: true };
    } else {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
  } catch (error) {
    console.error(`Webhook send failed for task ${taskId}, attempt ${retryCount + 1}:`, error.message);

    const maxRetries = config.webhookMaxRetries || 3;
    const retryDelays = config.webhookRetryDelays || [30000, 60000, 120000];
    const currentRetryCount = retryCount + 1;

    const updateData = {
      sendStatus: currentRetryCount >= maxRetries ? 'failed' : 'retrying',
      retryCount: currentRetryCount,
      failedReason: error.message,
      lastHttpStatus: error.response?.status,
      lastHttpResponse: error.response?.data ? (typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data)) : undefined,
    };

    await record.update(updateData);

    if (currentRetryCount < maxRetries) {
      const delay = retryDelays[retryCount] || retryDelays[retryDelays.length - 1];
      console.log(`Retrying webhook for task ${taskId} in ${delay}ms (attempt ${currentRetryCount + 1}/${maxRetries})`);
      await alertQueue.add({
        taskId,
        config,
        alertContent,
        retryCount: currentRetryCount,
      }, {
        delay,
        attempts: 1,
      });
      return { retrying: true, nextAttempt: currentRetryCount + 1, delay };
    } else {
      console.error(`Webhook failed permanently for task ${taskId} after ${maxRetries} attempts`);
      return { success: false, error: error.message, maxRetriesReached: true };
    }
  }
}

export async function getAlertRecords(params = {}) {
  const where = {};
  if (params.channel) where.channel = params.channel;
  if (params.sendStatus) where.sendStatus = params.sendStatus;
  if (params.taskId) where.taskId = params.taskId;
  if (params.read !== undefined) where.read = params.read;

  return await ReconciliationAlertRecord.findAndCountAll({
    where,
    include: [
      { model: ReconciliationTask, attributes: ['id', 'taskNo', 'taskType'] },
    ],
    order: [['alertTime', 'DESC']],
    limit: params.limit || 20,
    offset: params.offset || 0,
  });
}

export async function markAlertRead(recordId) {
  const record = await ReconciliationAlertRecord.findByPk(recordId);
  if (!record) {
    throw new Error('Alert record not found');
  }

  await record.update({
    read: true,
    readAt: new Date(),
  });

  return record;
}

export async function markAllAlertsRead() {
  const result = await ReconciliationAlertRecord.update(
    {
      read: true,
      readAt: new Date(),
    },
    {
      where: {
        read: false,
        channel: 'internal',
      },
    }
  );

  return { updated: result[0] };
}

export async function getUnreadAlertCount() {
  return await ReconciliationAlertRecord.count({
    where: {
      read: false,
      channel: 'internal',
    },
  });
}

alertQueue.process(sendWebhookNotification);

export default {
  getAlertConfig,
  updateAlertConfig,
  testWebhook,
  checkAndTriggerAlert,
  sendWebhookNotification,
  getAlertRecords,
  markAlertRead,
  markAllAlertsRead,
  getUnreadAlertCount,
};
