import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  AlertRule,
  AlertTriggerHistory,
  CircuitBreakerState,
  WebhookConfig,
  Tenant,
  ApiInterface,
} from '../src/models/index.js';
import {
  createAlertRule,
  evaluateRules,
  getTenantAlertStatus,
} from '../src/services/alertRuleService.js';
import {
  openCircuit,
  checkCircuitBreaker,
  manuallyCloseCircuit,
} from '../src/services/circuitBreakerService.js';
import {
  setRateLimitRule,
  acquireToken,
  checkRateLimit,
  clearRateLimit,
} from '../src/services/rateLimitService.js';
import {
  createWebhookConfig,
  getWebhookConfigs,
  testWebhookConfig,
  deleteWebhookConfig,
} from '../src/services/webhookService.js';

describe('Integration Tests', () => {
  let testTenantId;
  let testApiId;
  let testRuleId;

  before(async () => {
    await AlertTriggerHistory.destroy({ where: {}, force: true });
    await AlertRule.destroy({ where: {}, force: true });
    await CircuitBreakerState.destroy({ where: {}, force: true });
    await WebhookConfig.destroy({ where: {}, force: true });
    await ApiInterface.destroy({ where: { path: '/test/api' }, force: true });
    await Tenant.destroy({ where: { code: 'test-integration-tenant' }, force: true });

    const tenant = await Tenant.create({
      name: 'Integration Test Tenant',
      code: 'test-integration-tenant',
      contactEmail: 'integration@example.com',
      status: 'active',
    });
    testTenantId = tenant.id;

    const api = await ApiInterface.create({
      name: 'Test API',
      path: '/test/api',
      method: 'POST',
      unitPrice: 0.01,
      status: 'active',
    });
    testApiId = api.id;
  });

  after(async () => {
    await AlertTriggerHistory.destroy({ where: { tenantId: testTenantId }, force: true });
    await AlertRule.destroy({ where: { tenantId: testTenantId }, force: true });
    await CircuitBreakerState.destroy({ where: { tenantId: testTenantId }, force: true });
    await WebhookConfig.destroy({ where: { tenantId: testTenantId }, force: true });
    await ApiInterface.destroy({ where: { id: testApiId }, force: true });
    await Tenant.destroy({ where: { id: testTenantId }, force: true });
  });

  describe('Full Alert Rule Flow', () => {
    it('should create and evaluate rate limit rule', async () => {
      const rule = await createAlertRule(testTenantId, {
        name: 'Rate Limit Test Rule',
        conditionType: 'daily_call_count',
        conditionConfig: { threshold: 0, unit: '次' },
        notificationMethods: ['internal'],
        actionType: 'rate_limit',
        actionConfig: { qps: 10, burst: 20 },
        apiInterfaceId: testApiId,
        status: 'active',
      });
      testRuleId = rule.id;

      await setRateLimitRule(testTenantId, testApiId, testRuleId, 10, 20);

      const rateLimitStatus = await checkRateLimit(testTenantId, testApiId);
      assert.equal(rateLimitStatus.limited, true);
      assert.equal(rateLimitStatus.ruleId, testRuleId);

      const tokenResult = await acquireToken(testTenantId, testApiId, 10, 20);
      assert.equal(tokenResult.allowed, true);

      await clearRateLimit(testTenantId, testApiId);
    });

    it('should create and evaluate circuit breaker rule', async () => {
      await openCircuit(testTenantId, testApiId, testRuleId, 30);

      const circuitResult = await checkCircuitBreaker(testTenantId, testApiId);
      assert.equal(circuitResult.allowed, false);
      assert.equal(circuitResult.state, 'open');

      const closeResult = await manuallyCloseCircuit(testTenantId, testApiId, 'test-user');
      assert.equal(closeResult.success, true);

      const afterCloseResult = await checkCircuitBreaker(testTenantId, testApiId);
      assert.equal(afterCloseResult.allowed, true);
    });
  });

  describe('Webhook Flow', () => {
    it('should create and manage webhook config', async () => {
      const webhook = await createWebhookConfig(testTenantId, {
        name: 'Test Webhook',
        url: 'https://example.com/webhook',
        method: 'POST',
        headers: { 'X-Test': 'test' },
        timeout: 5000,
        maxRetries: 3,
        status: 'active',
      });

      assert.equal(webhook.name, 'Test Webhook');
      assert.equal(webhook.tenantId, testTenantId);

      const webhooks = await getWebhookConfigs(testTenantId);
      assert.equal(webhooks.length, 1);

      const testResult = await testWebhookConfig(webhook.id, testTenantId);
      assert.equal(testResult.success, false);

      await deleteWebhookConfig(webhook.id, testTenantId);
      const afterDelete = await getWebhookConfigs(testTenantId);
      assert.equal(afterDelete.length, 0);
    });
  });

  describe('Alert Status', () => {
    it('should return complete tenant alert status', async () => {
      const status = await getTenantAlertStatus(testTenantId);
      
      assert.ok(status.rules);
      assert.ok(status.triggerHistory);
      assert.ok(status.circuitBreakers);
      assert.ok(Array.isArray(status.rules));
      assert.ok(Array.isArray(status.triggerHistory));
      assert.ok(Array.isArray(status.circuitBreakers));
    });
  });

  describe('Rule Evaluation', () => {
    it('should evaluate rules without errors', async () => {
      const result = await evaluateRules(testTenantId, testApiId);
      
      assert.ok(result);
      assert.equal(typeof result.evaluated, 'number');
      assert.equal(typeof result.triggered, 'number');
    });
  });
});
