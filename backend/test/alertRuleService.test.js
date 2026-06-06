import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  createAlertRule,
  getAlertRules,
  updateAlertRule,
  deleteAlertRule,
  updateRulePriorities,
  getTriggerHistory,
} from '../src/services/alertRuleService.js';
import { AlertRule, AlertTriggerHistory, Tenant } from '../src/models/index.js';

describe('AlertRuleService', () => {
  let testTenantId;

  before(async () => {
    await AlertTriggerHistory.destroy({
      where: {},
      force: true,
    });
    await AlertRule.destroy({
      where: {},
      force: true,
    });
    await Tenant.destroy({
      where: { code: 'test-tenant-alert' },
      force: true,
    });

    const tenant = await Tenant.create({
      name: 'Test Tenant',
      code: 'test-tenant-alert',
      contactEmail: 'test@example.com',
      status: 'active',
    });
    testTenantId = tenant.id;
  });

  after(async () => {
    await AlertTriggerHistory.destroy({
      where: { tenantId: testTenantId },
      force: true,
    });
    await AlertRule.destroy({
      where: { tenantId: testTenantId },
      force: true,
    });
    await Tenant.destroy({
      where: { id: testTenantId },
      force: true,
    });
  });

  describe('createAlertRule', () => {
    it('should create alert rule successfully', async () => {
      const ruleData = {
        name: 'Test Rule',
        description: 'Test description',
        conditionType: 'daily_call_count',
        conditionConfig: { threshold: 1000, unit: '次' },
        notificationMethods: ['internal', 'email'],
        actionType: 'notify_only',
        status: 'active',
      };

      const rule = await createAlertRule(testTenantId, ruleData);
      
      assert.equal(rule.name, ruleData.name);
      assert.equal(rule.tenantId, testTenantId);
      assert.equal(rule.priority, 1);
      assert.deepEqual(rule.conditionConfig, ruleData.conditionConfig);
    });

    it('should enforce max 5 rules per tenant', async () => {
      for (let i = 0; i < 4; i++) {
        await createAlertRule(testTenantId, {
          name: `Rule ${i}`,
          conditionType: 'daily_call_count',
          conditionConfig: { threshold: 100, unit: '次' },
          notificationMethods: ['internal'],
          actionType: 'notify_only',
        });
      }

      await assert.rejects(
        createAlertRule(testTenantId, {
          name: 'Rule 5',
          conditionType: 'daily_call_count',
          conditionConfig: { threshold: 100, unit: '次' },
          notificationMethods: ['internal'],
          actionType: 'notify_only',
        }),
        /最多只能创建5条预警规则/
      );
    });
  });

  describe('getAlertRules', () => {
    it('should return rules ordered by priority', async () => {
      const rules = await getAlertRules(testTenantId);
      assert.ok(Array.isArray(rules));
      
      for (let i = 1; i < rules.length; i++) {
        assert.ok(rules[i - 1].priority >= rules[i].priority);
      }
    });
  });

  describe('updateAlertRule', () => {
    it('should update rule successfully', async () => {
      const rules = await getAlertRules(testTenantId);
      const rule = rules[0];
      
      const updatedRule = await updateAlertRule(rule.id, testTenantId, {
        name: 'Updated Rule',
        status: 'disabled',
      });
      
      assert.equal(updatedRule.name, 'Updated Rule');
      assert.equal(updatedRule.status, 'disabled');
    });
  });

  describe('updateRulePriorities', () => {
    it('should update rule priorities correctly', async () => {
      const rules = await getAlertRules(testTenantId);
      const orderedIds = rules.map(r => r.id).reverse();
      
      const result = await updateRulePriorities(testTenantId, orderedIds);
      assert.equal(result.success, true);
      
      const updatedRules = await getAlertRules(testTenantId);
      assert.equal(updatedRules[0].id, orderedIds[0]);
    });
  });

  describe('deleteAlertRule', () => {
    it('should delete rule successfully', async () => {
      const rules = await getAlertRules(testTenantId);
      const ruleToDelete = rules[0];
      
      const result = await deleteAlertRule(ruleToDelete.id, testTenantId);
      assert.equal(result.success, true);
      
      const remainingRules = await getAlertRules(testTenantId);
      assert.equal(remainingRules.length, rules.length - 1);
    });
  });

  describe('getTriggerHistory', () => {
    it('should return empty history when no triggers', async () => {
      const history = await getTriggerHistory(testTenantId);
      assert.ok(Array.isArray(history));
    });
  });
});
