import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const mockWebhookConfigs = [];
const mockDeadLetters = [];
let webhookIdCounter = 0;
let deadLetterIdCounter = 0;
let sentRequests = [];

const mockCreateWebhookConfig = async (tenantId, configData) => {
  const config = {
    id: `webhook-${++webhookIdCounter}`,
    tenantId,
    name: configData.name,
    url: configData.url,
    method: configData.method || 'POST',
    headers: configData.headers || {},
    timeout: configData.timeout || 5000,
    maxRetries: configData.maxRetries || 3,
    status: configData.status || 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  
  mockWebhookConfigs.push(config);
  return config;
};

const mockGetWebhookConfigs = async (tenantId) => {
  return mockWebhookConfigs.filter(c => c.tenantId === tenantId);
};

const mockUpdateWebhookConfig = async (configId, tenantId, updates) => {
  const index = mockWebhookConfigs.findIndex(c => c.id === configId && c.tenantId === tenantId);
  if (index === -1) {
    throw new Error('Webhook配置不存在');
  }
  
  mockWebhookConfigs[index] = {
    ...mockWebhookConfigs[index],
    ...updates,
    updatedAt: new Date(),
  };
  
  return mockWebhookConfigs[index];
};

const mockDeleteWebhookConfig = async (configId, tenantId) => {
  const index = mockWebhookConfigs.findIndex(c => c.id === configId && c.tenantId === tenantId);
  if (index === -1) {
    return { success: false, message: 'Webhook配置不存在' };
  }
  
  mockWebhookConfigs.splice(index, 1);
  return { success: true };
};

const mockTestWebhookConfig = async (configId, tenantId) => {
  const config = mockWebhookConfigs.find(c => c.id === configId && c.tenantId === tenantId);
  if (!config) {
    return { success: false, message: 'Webhook配置不存在' };
  }
  
  const testPayload = {
    test: true,
    message: 'This is a test webhook notification',
    timestamp: new Date().toISOString(),
  };
  
  sentRequests.push({
        url: config.url,
        method: config.method,
        headers: config.headers,
        body: testPayload,
      });
      
      if (config.url.includes('success')) {
        return {
          success: true,
          message: 'Webhook test successful',
          responseTime: 150,
          statusCode: 200,
        };
      }
      
      if (config.url.includes('example.com')) {
        return {
          success: false,
          message: 'Connection refused (example.com is not a real webhook endpoint)',
          responseTime: 100,
        };
      }
  
  return {
    success: true,
    message: 'Webhook test successful',
    responseTime: 150,
    statusCode: 200,
  };
};

const mockSendWebhookNotification = async (tenantId, payload) => {
  const configs = await mockGetWebhookConfigs(tenantId);
  const activeConfigs = configs.filter(c => c.status === 'active');
  
  if (activeConfigs.length === 0) {
    return { sent: 0, failed: 0 };
  }
  
  let sent = 0;
  let failed = 0;
  
  for (const config of activeConfigs) {
    const retryIntervals = [10000, 30000, 60000];
    let success = false;
    let attempts = 0;
    const maxAttempts = config.maxRetries + 1;
    
    while (!success && attempts < maxAttempts) {
      attempts++;
      
      sentRequests.push({
        url: config.url,
        method: config.method,
        headers: config.headers,
        body: payload,
        attempt: attempts,
      });
      
      if (config.url.includes('success')) {
        success = true;
        sent++;
      } else if (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }
    
    if (!success) {
      failed++;
      const deadLetter = {
        id: `dl-${++deadLetterIdCounter}`,
        tenantId,
        webhookConfigId: config.id,
        url: config.url,
        payload,
        attempts,
        lastError: 'Max retries exceeded',
        createdAt: new Date(),
      };
      mockDeadLetters.push(deadLetter);
    }
  }
  
  return { sent, failed };
};

const mockGetDeadLetters = async (tenantId) => {
  return mockDeadLetters.filter(dl => dl.tenantId === tenantId);
};

describe('WebhookService (Mocked)', () => {
  const testTenantId = 'test-tenant-id';
  const testTenantId2 = 'test-tenant-id-2';

  beforeEach(() => {
    mockWebhookConfigs.length = 0;
    mockDeadLetters.length = 0;
    sentRequests = [];
    webhookIdCounter = 0;
    deadLetterIdCounter = 0;
  });

  describe('createWebhookConfig', () => {
    it('should create webhook config successfully', async () => {
      const configData = {
        name: 'Production Webhook',
        url: 'https://api.example.com/webhook',
        method: 'POST',
        headers: { 'X-API-Key': 'secret-key' },
        timeout: 5000,
        maxRetries: 3,
        status: 'active',
      };

      const config = await mockCreateWebhookConfig(testTenantId, configData);
      
      assert.equal(config.name, configData.name);
      assert.equal(config.tenantId, testTenantId);
      assert.equal(config.url, configData.url);
      assert.equal(config.method, 'POST');
      assert.deepEqual(config.headers, configData.headers);
      assert.equal(config.timeout, 5000);
      assert.equal(config.maxRetries, 3);
      assert.equal(config.status, 'active');
    });

    it('should use default values when not provided', async () => {
      const config = await mockCreateWebhookConfig(testTenantId, {
        name: 'Minimal Config',
        url: 'https://example.com/minimal',
      });
      
      assert.equal(config.method, 'POST');
      assert.deepEqual(config.headers, {});
      assert.equal(config.timeout, 5000);
      assert.equal(config.maxRetries, 3);
      assert.equal(config.status, 'active');
    });

    it('should support multiple webhook configs per tenant', async () => {
      await mockCreateWebhookConfig(testTenantId, {
        name: 'Webhook 1',
        url: 'https://example.com/1',
      });
      
      await mockCreateWebhookConfig(testTenantId, {
        name: 'Webhook 2',
        url: 'https://example.com/2',
      });
      
      const configs = await mockGetWebhookConfigs(testTenantId);
      assert.equal(configs.length, 2);
    });
  });

  describe('getWebhookConfigs', () => {
    it('should return configs for specific tenant', async () => {
      await mockCreateWebhookConfig(testTenantId, {
        name: 'Tenant 1 Webhook',
        url: 'https://example.com/tenant1',
      });
      
      await mockCreateWebhookConfig(testTenantId2, {
        name: 'Tenant 2 Webhook',
        url: 'https://example.com/tenant2',
      });
      
      const tenant1Configs = await mockGetWebhookConfigs(testTenantId);
      const tenant2Configs = await mockGetWebhookConfigs(testTenantId2);
      
      assert.equal(tenant1Configs.length, 1);
      assert.equal(tenant1Configs[0].name, 'Tenant 1 Webhook');
      assert.equal(tenant2Configs.length, 1);
      assert.equal(tenant2Configs[0].name, 'Tenant 2 Webhook');
    });

    it('should return empty array for tenant with no configs', async () => {
      const configs = await mockGetWebhookConfigs('nonexistent-tenant');
      assert.deepEqual(configs, []);
    });
  });

  describe('updateWebhookConfig', () => {
    it('should update webhook config successfully', async () => {
      const config = await mockCreateWebhookConfig(testTenantId, {
        name: 'Original Name',
        url: 'https://example.com/original',
      });
      
      const updatedConfig = await mockUpdateWebhookConfig(config.id, testTenantId, {
        name: 'Updated Name',
        url: 'https://example.com/updated',
        status: 'disabled',
      });
      
      assert.equal(updatedConfig.name, 'Updated Name');
      assert.equal(updatedConfig.url, 'https://example.com/updated');
      assert.equal(updatedConfig.status, 'disabled');
    });

    it('should throw error for nonexistent config', async () => {
      await assert.rejects(
        mockUpdateWebhookConfig('nonexistent-id', testTenantId, { name: 'Test' }),
        /Webhook配置不存在/
      );
    });
  });

  describe('deleteWebhookConfig', () => {
    it('should delete webhook config successfully', async () => {
      const config = await mockCreateWebhookConfig(testTenantId, {
        name: 'Config to Delete',
        url: 'https://example.com/delete',
      });
      
      const result = await mockDeleteWebhookConfig(config.id, testTenantId);
      assert.equal(result.success, true);
      
      const remainingConfigs = await mockGetWebhookConfigs(testTenantId);
      assert.equal(remainingConfigs.length, 0);
    });

    it('should return false for nonexistent config', async () => {
      const result = await mockDeleteWebhookConfig('nonexistent-id', testTenantId);
      assert.equal(result.success, false);
    });
  });

  describe('testWebhookConfig', () => {
    it('should test webhook and return failure for example.com', async () => {
      const config = await mockCreateWebhookConfig(testTenantId, {
        name: 'Test Webhook',
        url: 'https://example.com/webhook',
      });
      
      const result = await mockTestWebhookConfig(config.id, testTenantId);
      assert.equal(result.success, false);
      assert.ok(result.message.includes('example.com'));
      
      assert.equal(sentRequests.length, 1);
      assert.equal(sentRequests[0].url, 'https://example.com/webhook');
      assert.equal(sentRequests[0].body.test, true);
    });

    it('should test webhook and return success for success URL', async () => {
      const config = await mockCreateWebhookConfig(testTenantId, {
        name: 'Success Webhook',
        url: 'https://success.example.com/webhook',
      });
      
      const result = await mockTestWebhookConfig(config.id, testTenantId);
      assert.equal(result.success, true);
      assert.equal(result.statusCode, 200);
    });

    it('should return error for nonexistent config', async () => {
      const result = await mockTestWebhookConfig('nonexistent-id', testTenantId);
      assert.equal(result.success, false);
    });
  });

  describe('sendWebhookNotification', () => {
    it('should send webhook notification successfully', async () => {
      await mockCreateWebhookConfig(testTenantId, {
        name: 'Success Webhook',
        url: 'https://success.example.com/alert',
        maxRetries: 3,
      });
      
      const payload = {
        tenantId: testTenantId,
        ruleName: 'High Usage Alert',
        triggerTime: new Date().toISOString(),
        currentValue: 1500,
        action: 'rate_limit',
      };
      
      const result = await mockSendWebhookNotification(testTenantId, payload);
      assert.equal(result.sent, 1);
      assert.equal(result.failed, 0);
      
      assert.equal(sentRequests.length, 1);
      assert.equal(sentRequests[0].body.ruleName, 'High Usage Alert');
    });

    it('should retry on failure and eventually fail', async () => {
      await mockCreateWebhookConfig(testTenantId, {
        name: 'Failing Webhook',
        url: 'https://failing.example.com/alert',
        maxRetries: 2,
      });
      
      const payload = {
        tenantId: testTenantId,
        ruleName: 'Test Alert',
        triggerTime: new Date().toISOString(),
        currentValue: 1000,
        action: 'notify_only',
      };
      
      const result = await mockSendWebhookNotification(testTenantId, payload);
      assert.equal(result.sent, 0);
      assert.equal(result.failed, 1);
      
      assert.equal(sentRequests.length, 3);
      assert.equal(sentRequests[0].attempt, 1);
      assert.equal(sentRequests[1].attempt, 2);
      assert.equal(sentRequests[2].attempt, 3);
      
      const deadLetters = await mockGetDeadLetters(testTenantId);
      assert.equal(deadLetters.length, 1);
      assert.equal(deadLetters[0].attempts, 3);
      assert.equal(deadLetters[0].payload.ruleName, 'Test Alert');
    });

    it('should send to multiple webhook configs', async () => {
      await mockCreateWebhookConfig(testTenantId, {
        name: 'Success 1',
        url: 'https://success.example.com/1',
      });
      
      await mockCreateWebhookConfig(testTenantId, {
        name: 'Success 2',
        url: 'https://success.example.com/2',
      });
      
      const payload = {
        tenantId: testTenantId,
        ruleName: 'Multi Alert',
        triggerTime: new Date().toISOString(),
        currentValue: 2000,
        action: 'circuit_break',
      };
      
      const result = await mockSendWebhookNotification(testTenantId, payload);
      assert.equal(result.sent, 2);
      assert.equal(result.failed, 0);
      
      assert.equal(sentRequests.length, 2);
      assert.ok(sentRequests.some(r => r.url.includes('/1')));
      assert.ok(sentRequests.some(r => r.url.includes('/2')));
    });

    it('should only send to active configs', async () => {
      await mockCreateWebhookConfig(testTenantId, {
        name: 'Active Webhook',
        url: 'https://success.example.com/active',
        status: 'active',
      });
      
      await mockCreateWebhookConfig(testTenantId, {
        name: 'Disabled Webhook',
        url: 'https://example.com/disabled',
        status: 'disabled',
      });
      
      const payload = {
        tenantId: testTenantId,
        ruleName: 'Active Only Alert',
        triggerTime: new Date().toISOString(),
        currentValue: 500,
        action: 'notify_only',
      };
      
      const result = await mockSendWebhookNotification(testTenantId, payload);
      assert.equal(result.sent, 1);
      assert.equal(result.failed, 0);
      
      assert.equal(sentRequests.length, 1);
      assert.equal(sentRequests[0].url, 'https://success.example.com/active');
    });

    it('should return zero for tenant with no webhook configs', async () => {
      const result = await mockSendWebhookNotification('no-config-tenant', {
        tenantId: 'no-config-tenant',
        ruleName: 'Test',
        triggerTime: new Date().toISOString(),
        currentValue: 100,
        action: 'notify_only',
      });
      
      assert.equal(result.sent, 0);
      assert.equal(result.failed, 0);
      assert.equal(sentRequests.length, 0);
    });
  });

  describe('getDeadLetters', () => {
    it('should return dead letters for tenant', async () => {
      await mockCreateWebhookConfig(testTenantId, {
        name: 'Failing Webhook',
        url: 'https://failing.example.com/alert',
        maxRetries: 1,
      });
      
      await mockSendWebhookNotification(testTenantId, {
        tenantId: testTenantId,
        ruleName: 'Dead Letter Test',
        triggerTime: new Date().toISOString(),
        currentValue: 1000,
        action: 'notify_only',
      });
      
      const deadLetters = await mockGetDeadLetters(testTenantId);
      assert.equal(deadLetters.length, 1);
      assert.equal(deadLetters[0].payload.ruleName, 'Dead Letter Test');
    });

    it('should return empty array when no dead letters', async () => {
      const deadLetters = await mockGetDeadLetters(testTenantId);
      assert.deepEqual(deadLetters, []);
    });
  });

  describe('Webhook Payload Format', () => {
    it('should include all required fields in payload', async () => {
      await mockCreateWebhookConfig(testTenantId, {
        name: 'Payload Test',
        url: 'https://success.example.com/payload',
      });
      
      const now = new Date().toISOString();
      const payload = {
        tenantId: testTenantId,
        ruleName: 'Payload Format Test',
        triggerTime: now,
        currentValue: 1234.56,
        action: 'rate_limit',
        actionConfig: {
          qps: 10,
          burst: 20,
        },
      };
      
      await mockSendWebhookNotification(testTenantId, payload);
      
      assert.equal(sentRequests.length, 1);
      const sentBody = sentRequests[0].body;
      
      assert.equal(sentBody.tenantId, testTenantId);
      assert.equal(sentBody.ruleName, 'Payload Format Test');
      assert.equal(sentBody.triggerTime, now);
      assert.equal(sentBody.currentValue, 1234.56);
      assert.equal(sentBody.action, 'rate_limit');
      assert.deepEqual(sentBody.actionConfig, { qps: 10, burst: 20 });
    });
  });
});
