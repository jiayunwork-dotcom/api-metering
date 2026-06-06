import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const mockAlertRules = [];
const mockTriggerHistory = [];
let ruleIdCounter = 0;
let historyIdCounter = 0;

const mockCreateAlertRule = async (tenantId, ruleData) => {
  const existingRules = mockAlertRules.filter(r => r.tenantId === tenantId);
  if (existingRules.length >= 5) {
    throw new Error('最多只能创建5条预警规则');
  }
  
  const maxPriority = existingRules.reduce((max, r) => Math.max(max, r.priority), 0);
  
  const rule = {
    id: `rule-${++ruleIdCounter}`,
    tenantId,
    name: ruleData.name,
    description: ruleData.description || '',
    priority: maxPriority + 1,
    conditionType: ruleData.conditionType,
    conditionConfig: ruleData.conditionConfig,
    notificationMethods: ruleData.notificationMethods || ['internal'],
    actionType: ruleData.actionType || 'notify_only',
    actionConfig: ruleData.actionConfig || null,
    apiInterfaceId: ruleData.apiInterfaceId || null,
    cooldownPeriod: ruleData.cooldownPeriod || 30,
    status: ruleData.status || 'active',
    lastTriggeredAt: null,
    lastTriggeredHour: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  
  mockAlertRules.push(rule);
  return rule;
};

const mockGetAlertRules = async (tenantId) => {
  return mockAlertRules
    .filter(r => r.tenantId === tenantId)
    .sort((a, b) => b.priority - a.priority);
};

const mockUpdateAlertRule = async (ruleId, tenantId, updates) => {
  const index = mockAlertRules.findIndex(r => r.id === ruleId && r.tenantId === tenantId);
  if (index === -1) {
    throw new Error('预警规则不存在');
  }
  
  mockAlertRules[index] = {
    ...mockAlertRules[index],
    ...updates,
    updatedAt: new Date(),
  };
  
  return mockAlertRules[index];
};

const mockDeleteAlertRule = async (ruleId, tenantId) => {
  const index = mockAlertRules.findIndex(r => r.id === ruleId && r.tenantId === tenantId);
  if (index === -1) {
    return { success: false, message: '预警规则不存在' };
  }
  
  mockAlertRules.splice(index, 1);
  return { success: true };
};

const mockUpdateRulePriorities = async (tenantId, orderedRuleIds) => {
  const rules = await mockGetAlertRules(tenantId);
  const validIds = new Set(rules.map(r => r.id));
  
  for (const id of orderedRuleIds) {
    if (!validIds.has(id)) {
      return { success: false, message: `规则ID ${id} 无效` };
    }
  }
  
  for (let i = 0; i < orderedRuleIds.length; i++) {
    const ruleIndex = mockAlertRules.findIndex(r => r.id === orderedRuleIds[i]);
    if (ruleIndex !== -1) {
      mockAlertRules[ruleIndex].priority = orderedRuleIds.length - i;
      mockAlertRules[ruleIndex].updatedAt = new Date();
    }
  }
  
  return { success: true };
};

const mockGetTriggerHistory = async (tenantId, limit = 20) => {
  return mockTriggerHistory
    .filter(h => h.tenantId === tenantId)
    .sort((a, b) => new Date(b.triggeredAt) - new Date(a.triggeredAt))
    .slice(0, limit);
};

const mockEvaluateRules = async (tenantId, apiInterfaceId, metrics = {}) => {
  const rules = await mockGetAlertRules(tenantId);
  const activeRules = rules.filter(r => r.status === 'active');
  
  let triggered = 0;
  const currentHour = new Date().toISOString().slice(0, 13);
  
  for (const rule of activeRules) {
    if (rule.lastTriggeredHour === currentHour) {
      continue;
    }
    
    let shouldTrigger = false;
    let currentValue = 0;
    
    switch (rule.conditionType) {
      case 'daily_call_count':
        currentValue = metrics.dailyCallCount || 1500;
        shouldTrigger = currentValue >= (rule.conditionConfig?.threshold || 1000);
        break;
      case 'hourly_data_volume':
        currentValue = metrics.hourlyDataVolume || 150;
        shouldTrigger = currentValue >= (rule.conditionConfig?.threshold || 100);
        break;
      case 'monthly_cost':
        currentValue = metrics.monthlyCost || 1500;
        shouldTrigger = currentValue >= (rule.conditionConfig?.threshold || 1000);
        break;
      default:
        shouldTrigger = false;
    }
    
    if (shouldTrigger) {
      const history = {
        id: `history-${++historyIdCounter}`,
        tenantId,
        alertRuleId: rule.id,
        ruleName: rule.name,
        conditionType: rule.conditionType,
        currentValue,
        thresholdValue: rule.conditionConfig?.threshold || 0,
        actionType: rule.actionType,
        triggeredAt: new Date(),
      };
      mockTriggerHistory.push(history);
      
      const ruleIndex = mockAlertRules.findIndex(r => r.id === rule.id);
      if (ruleIndex !== -1) {
        mockAlertRules[ruleIndex].lastTriggeredAt = new Date();
        mockAlertRules[ruleIndex].lastTriggeredHour = currentHour;
      }
      
      triggered++;
    }
  }
  
  return {
    evaluated: activeRules.length,
    triggered,
  };
};

const mockGetTenantAlertStatus = async (tenantId) => {
  const rules = await mockGetAlertRules(tenantId);
  const triggerHistory = await mockGetTriggerHistory(tenantId);
  
  return {
    rules,
    triggerHistory,
    circuitBreakers: [],
  };
};

describe('AlertRuleService (Mocked)', () => {
  const testTenantId = 'test-tenant-id';
  const testTenantId2 = 'test-tenant-id-2';

  beforeEach(() => {
    mockAlertRules.length = 0;
    mockTriggerHistory.length = 0;
    ruleIdCounter = 0;
    historyIdCounter = 0;
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

      const rule = await mockCreateAlertRule(testTenantId, ruleData);
      
      assert.equal(rule.name, ruleData.name);
      assert.equal(rule.tenantId, testTenantId);
      assert.equal(rule.priority, 1);
      assert.deepEqual(rule.conditionConfig, ruleData.conditionConfig);
    });

    it('should enforce max 5 rules per tenant', async () => {
      for (let i = 0; i < 5; i++) {
        await mockCreateAlertRule(testTenantId, {
          name: `Rule ${i}`,
          conditionType: 'daily_call_count',
          conditionConfig: { threshold: 100, unit: '次' },
          notificationMethods: ['internal'],
          actionType: 'notify_only',
        });
      }

      await assert.rejects(
        mockCreateAlertRule(testTenantId, {
          name: 'Rule 5',
          conditionType: 'daily_call_count',
          conditionConfig: { threshold: 100, unit: '次' },
          notificationMethods: ['internal'],
          actionType: 'notify_only',
        }),
        /最多只能创建5条预警规则/
      );
    });

    it('should assign correct priority for multiple rules', async () => {
      const rule1 = await mockCreateAlertRule(testTenantId, {
        name: 'Rule 1',
        conditionType: 'daily_call_count',
        conditionConfig: { threshold: 100, unit: '次' },
      });
      
      const rule2 = await mockCreateAlertRule(testTenantId, {
        name: 'Rule 2',
        conditionType: 'daily_call_count',
        conditionConfig: { threshold: 200, unit: '次' },
      });
      
      assert.equal(rule1.priority, 1);
      assert.equal(rule2.priority, 2);
    });

    it('should isolate rules between tenants', async () => {
      await mockCreateAlertRule(testTenantId, {
        name: 'Rule 1',
        conditionType: 'daily_call_count',
        conditionConfig: { threshold: 100, unit: '次' },
      });
      
      const tenant2Rule = await mockCreateAlertRule(testTenantId2, {
        name: 'Rule 2',
        conditionType: 'daily_call_count',
        conditionConfig: { threshold: 200, unit: '次' },
      });
      
      assert.equal(tenant2Rule.priority, 1);
      
      const tenant1Rules = await mockGetAlertRules(testTenantId);
      const tenant2Rules = await mockGetAlertRules(testTenantId2);
      
      assert.equal(tenant1Rules.length, 1);
      assert.equal(tenant2Rules.length, 1);
    });
  });

  describe('getAlertRules', () => {
    it('should return rules ordered by priority descending', async () => {
      await mockCreateAlertRule(testTenantId, {
        name: 'Low Priority',
        conditionType: 'daily_call_count',
        conditionConfig: { threshold: 100, unit: '次' },
      });
      await mockCreateAlertRule(testTenantId, {
        name: 'High Priority',
        conditionType: 'daily_call_count',
        conditionConfig: { threshold: 200, unit: '次' },
      });
      
      const rules = await mockGetAlertRules(testTenantId);
      assert.ok(Array.isArray(rules));
      assert.equal(rules.length, 2);
      assert.equal(rules[0].name, 'High Priority');
      assert.equal(rules[1].name, 'Low Priority');
      
      for (let i = 1; i < rules.length; i++) {
        assert.ok(rules[i - 1].priority >= rules[i].priority);
      }
    });

    it('should return empty array for tenant with no rules', async () => {
      const rules = await mockGetAlertRules('nonexistent-tenant');
      assert.deepEqual(rules, []);
    });
  });

  describe('updateAlertRule', () => {
    it('should update rule successfully', async () => {
      const rule = await mockCreateAlertRule(testTenantId, {
        name: 'Original Name',
        conditionType: 'daily_call_count',
        conditionConfig: { threshold: 100, unit: '次' },
      });
      
      const updatedRule = await mockUpdateAlertRule(rule.id, testTenantId, {
        name: 'Updated Name',
        status: 'disabled',
      });
      
      assert.equal(updatedRule.name, 'Updated Name');
      assert.equal(updatedRule.status, 'disabled');
    });

    it('should throw error for nonexistent rule', async () => {
      await assert.rejects(
        mockUpdateAlertRule('nonexistent-id', testTenantId, { name: 'Test' }),
        /预警规则不存在/
      );
    });
  });

  describe('updateRulePriorities', () => {
    it('should update rule priorities correctly', async () => {
      const rule1 = await mockCreateAlertRule(testTenantId, {
        name: 'Rule 1',
        conditionType: 'daily_call_count',
        conditionConfig: { threshold: 100, unit: '次' },
      });
      const rule2 = await mockCreateAlertRule(testTenantId, {
        name: 'Rule 2',
        conditionType: 'daily_call_count',
        conditionConfig: { threshold: 200, unit: '次' },
      });
      const rule3 = await mockCreateAlertRule(testTenantId, {
        name: 'Rule 3',
        conditionType: 'daily_call_count',
        conditionConfig: { threshold: 300, unit: '次' },
      });
      
      const orderedIds = [rule3.id, rule1.id, rule2.id];
      const result = await mockUpdateRulePriorities(testTenantId, orderedIds);
      assert.equal(result.success, true);
      
      const updatedRules = await mockGetAlertRules(testTenantId);
      assert.equal(updatedRules[0].id, rule3.id);
      assert.equal(updatedRules[1].id, rule1.id);
      assert.equal(updatedRules[2].id, rule2.id);
    });

    it('should fail for invalid rule IDs', async () => {
      const result = await mockUpdateRulePriorities(testTenantId, ['invalid-id']);
      assert.equal(result.success, false);
    });
  });

  describe('deleteAlertRule', () => {
    it('should delete rule successfully', async () => {
      const rule = await mockCreateAlertRule(testTenantId, {
        name: 'Rule to Delete',
        conditionType: 'daily_call_count',
        conditionConfig: { threshold: 100, unit: '次' },
      });
      
      const result = await mockDeleteAlertRule(rule.id, testTenantId);
      assert.equal(result.success, true);
      
      const remainingRules = await mockGetAlertRules(testTenantId);
      assert.equal(remainingRules.length, 0);
    });

    it('should return false for nonexistent rule', async () => {
      const result = await mockDeleteAlertRule('nonexistent-id', testTenantId);
      assert.equal(result.success, false);
    });
  });

  describe('evaluateRules', () => {
    it('should trigger rule when condition is met', async () => {
      await mockCreateAlertRule(testTenantId, {
        name: 'Test Rule',
        conditionType: 'daily_call_count',
        conditionConfig: { threshold: 1000, unit: '次' },
        notificationMethods: ['internal'],
        actionType: 'notify_only',
        status: 'active',
      });
      
      const result = await mockEvaluateRules(testTenantId, 'api-1', { dailyCallCount: 1500 });
      assert.equal(result.evaluated, 1);
      assert.equal(result.triggered, 1);
      
      const history = await mockGetTriggerHistory(testTenantId);
      assert.equal(history.length, 1);
      assert.equal(history[0].currentValue, 1500);
    });

    it('should not trigger same rule twice in same hour', async () => {
      await mockCreateAlertRule(testTenantId, {
        name: 'Test Rule',
        conditionType: 'daily_call_count',
        conditionConfig: { threshold: 1000, unit: '次' },
        notificationMethods: ['internal'],
        actionType: 'notify_only',
        status: 'active',
      });
      
      const result1 = await mockEvaluateRules(testTenantId, 'api-1', { dailyCallCount: 1500 });
      assert.equal(result1.triggered, 1);
      
      const result2 = await mockEvaluateRules(testTenantId, 'api-1', { dailyCallCount: 2000 });
      assert.equal(result2.triggered, 0);
      
      const history = await mockGetTriggerHistory(testTenantId);
      assert.equal(history.length, 1);
    });

    it('should evaluate multiple rules by priority', async () => {
      await mockCreateAlertRule(testTenantId, {
        name: 'Low Priority Rule',
        conditionType: 'daily_call_count',
        conditionConfig: { threshold: 500, unit: '次' },
        notificationMethods: ['internal'],
        actionType: 'notify_only',
        status: 'active',
      });
      
      await mockCreateAlertRule(testTenantId, {
        name: 'High Priority Rule',
        conditionType: 'monthly_cost',
        conditionConfig: { threshold: 500, unit: '元' },
        notificationMethods: ['email'],
        actionType: 'rate_limit',
        actionConfig: { qps: 10, burst: 20 },
        status: 'active',
      });
      
      const result = await mockEvaluateRules(testTenantId, 'api-1', {
        dailyCallCount: 1000,
        monthlyCost: 1000,
      });
      
      assert.equal(result.evaluated, 2);
      assert.equal(result.triggered, 2);
      
      const history = await mockGetTriggerHistory(testTenantId);
      assert.equal(history.length, 2);
    });

    it('should not evaluate disabled rules', async () => {
      await mockCreateAlertRule(testTenantId, {
        name: 'Disabled Rule',
        conditionType: 'daily_call_count',
        conditionConfig: { threshold: 1000, unit: '次' },
        notificationMethods: ['internal'],
        actionType: 'notify_only',
        status: 'disabled',
      });
      
      const result = await mockEvaluateRules(testTenantId, 'api-1', { dailyCallCount: 1500 });
      assert.equal(result.evaluated, 0);
      assert.equal(result.triggered, 0);
      
      const history = await mockGetTriggerHistory(testTenantId);
      assert.equal(history.length, 0);
    });
  });

  describe('getTenantAlertStatus', () => {
    it('should return complete tenant alert status', async () => {
      await mockCreateAlertRule(testTenantId, {
        name: 'Test Rule',
        conditionType: 'daily_call_count',
        conditionConfig: { threshold: 1000, unit: '次' },
        notificationMethods: ['internal'],
        actionType: 'notify_only',
        status: 'active',
      });
      
      await mockEvaluateRules(testTenantId, 'api-1', { dailyCallCount: 1500 });
      
      const status = await mockGetTenantAlertStatus(testTenantId);
      
      assert.ok(status.rules);
      assert.ok(status.triggerHistory);
      assert.ok(status.circuitBreakers);
      assert.equal(Array.isArray(status.rules), true);
      assert.equal(Array.isArray(status.triggerHistory), true);
      assert.equal(Array.isArray(status.circuitBreakers), true);
      assert.equal(status.rules.length, 1);
      assert.equal(status.triggerHistory.length, 1);
    });
  });

  describe('getTriggerHistory', () => {
    it('should return history sorted by trigger time descending', async () => {
      await mockCreateAlertRule(testTenantId, {
        name: 'Rule 1',
        conditionType: 'daily_call_count',
        conditionConfig: { threshold: 100, unit: '次' },
        notificationMethods: ['internal'],
        actionType: 'notify_only',
        status: 'active',
      });
      
      for (let i = 0; i < 5; i++) {
        const rule = await mockCreateAlertRule(`tenant-${i}`, {
          name: `Rule ${i}`,
          conditionType: 'daily_call_count',
          conditionConfig: { threshold: 100, unit: '次' },
          notificationMethods: ['internal'],
          actionType: 'notify_only',
          status: 'active',
        });
        
        const historyItem = {
          id: `history-${i}`,
          tenantId: testTenantId,
          alertRuleId: rule.id,
          ruleName: `Rule ${i}`,
          conditionType: 'daily_call_count',
          currentValue: 200 + i,
          thresholdValue: 100,
          actionType: 'notify_only',
          triggeredAt: new Date(Date.now() - i * 60000),
        };
        mockTriggerHistory.push(historyItem);
      }
      
      const history = await mockGetTriggerHistory(testTenantId);
      assert.ok(Array.isArray(history));
      
      for (let i = 1; i < history.length; i++) {
        const prevTime = new Date(history[i - 1].triggeredAt).getTime();
        const currTime = new Date(history[i].triggeredAt).getTime();
        assert.ok(prevTime >= currTime);
      }
    });

    it('should return empty history when no triggers', async () => {
      const history = await mockGetTriggerHistory(testTenantId);
      assert.deepEqual(history, []);
    });
  });
});
