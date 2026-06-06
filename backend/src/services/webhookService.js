import { WebhookConfig, DeadLetterEvent } from '../models/index.js';
import { notificationQueue } from '../config/queue.js';
import { getMonthKey } from '../utils/dateUtils.js';

export async function sendWebhook(webhookConfig, payload) {
  const { url, method = 'POST', headers = {}, timeout = 5000 } = webhookConfig;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'No response body');
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    await webhookConfig.update({
      lastSuccessAt: new Date(),
      lastError: null,
    });

    return { success: true, status: response.status };
  } catch (error) {
    clearTimeout(timeoutId);

    const errorMessage = error.name === 'AbortError'
      ? `Request timeout after ${timeout}ms`
      : error.message;

    await webhookConfig.update({
      lastFailureAt: new Date(),
      lastError: errorMessage,
    });

    return { success: false, error: errorMessage };
  }
}

export async function sendWithRetry(webhookConfig, payload) {
  const { maxRetries = 3, retryDelays = [10000, 30000, 60000] } = webhookConfig;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await sendWebhook(webhookConfig, payload);

    if (result.success) {
      return result;
    }

    if (attempt < maxRetries) {
      const delay = retryDelays[attempt] || 60000;
      await new Promise(resolve => setTimeout(resolve, delay));
    } else {
      await DeadLetterEvent.create({
        eventData: {
          type: 'webhook',
          webhookId: webhookConfig.id,
          webhookUrl: webhookConfig.url,
          payload,
          error: result.error,
        },
        errorMessage: `Webhook failed after ${maxRetries + 1} attempts: ${result.error}`,
        tenantId: webhookConfig.tenantId,
        month: getMonthKey(),
        processedBy: 'webhook',
      });

      return result;
    }
  }
}

export async function queueWebhookNotification(tenantId, alertRule, triggerData) {
  const webhookConfigs = await WebhookConfig.findAll({
    where: { tenantId, status: 'active' },
  });

  if (webhookConfigs.length === 0) {
    return { queued: 0, message: 'No active webhook configs' };
  }

  const payload = {
    tenantId,
    ruleId: alertRule.id,
    ruleName: alertRule.name,
    triggeredAt: triggerData.triggeredAt,
    conditionType: triggerData.conditionType,
    currentValue: triggerData.currentValue,
    thresholdValue: triggerData.thresholdValue,
    unit: triggerData.unit,
    actionType: triggerData.actionType,
    timestamp: new Date().toISOString(),
  };

  for (const config of webhookConfigs) {
    await notificationQueue.add({
      type: 'webhook',
      webhookId: config.id,
      payload,
    }, {
      attempts: 1,
      removeOnComplete: true,
    });
  }

  return { queued: webhookConfigs.length, webhooks: webhookConfigs.map(w => ({ id: w.id, url: w.url })) };
}

export async function processWebhookJob(job) {
  const { webhookId, payload } = job.data;

  const webhookConfig = await WebhookConfig.findByPk(webhookId);
  if (!webhookConfig) {
    return { success: false, error: 'Webhook config not found' };
  }

  if (webhookConfig.status !== 'active') {
    return { success: false, error: 'Webhook config is disabled' };
  }

  return await sendWithRetry(webhookConfig, payload);
}

export async function getWebhookConfigs(tenantId) {
  return await WebhookConfig.findAll({
    where: { tenantId },
    order: [['createdAt', 'DESC']],
  });
}

export async function createWebhookConfig(tenantId, data) {
  return await WebhookConfig.create({
    ...data,
    tenantId,
  });
}

export async function updateWebhookConfig(id, tenantId, data) {
  const config = await WebhookConfig.findOne({ where: { id, tenantId } });
  if (!config) {
    throw new Error('Webhook config not found');
  }

  return await config.update(data);
}

export async function deleteWebhookConfig(id, tenantId) {
  const config = await WebhookConfig.findOne({ where: { id, tenantId } });
  if (!config) {
    throw new Error('Webhook config not found');
  }

  await config.destroy();
  return { success: true };
}

export async function testWebhookConfig(id, tenantId) {
  const config = await WebhookConfig.findOne({ where: { id, tenantId } });
  if (!config) {
    throw new Error('Webhook config not found');
  }

  const testPayload = {
    tenantId,
    ruleId: 'test',
    ruleName: '测试规则',
    triggeredAt: new Date().toISOString(),
    conditionType: 'test',
    currentValue: 100,
    thresholdValue: 50,
    unit: '次',
    actionType: 'notify_only',
    timestamp: new Date().toISOString(),
    test: true,
  };

  return await sendWebhook(config, testPayload);
}

notificationQueue.process('webhook', processWebhookJob);

export default {
  sendWebhook,
  sendWithRetry,
  queueWebhookNotification,
  processWebhookJob,
  getWebhookConfigs,
  createWebhookConfig,
  updateWebhookConfig,
  deleteWebhookConfig,
  testWebhookConfig,
};
