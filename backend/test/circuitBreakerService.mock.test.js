import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

const mockStates = new Map();

const STATES = {
  CLOSED: 'closed',
  OPEN: 'open',
  HALF_OPEN: 'half_open',
};

const getCircuitKey = (tenantId, apiInterfaceId) => {
  return `${tenantId}:${apiInterfaceId || 'global'}`;
};

const mockOpenCircuit = async (tenantId, apiInterfaceId, ruleId, cooldownMinutes = 30) => {
  const key = getCircuitKey(tenantId, apiInterfaceId);
  const now = new Date();
  const cooldownUntil = new Date(now.getTime() + cooldownMinutes * 60 * 1000);
  
  const state = {
    tenantId,
    apiInterfaceId,
    alertRuleId: ruleId,
    state: STATES.OPEN,
    openedAt: now,
    cooldownUntil,
    cooldownPeriod: cooldownMinutes,
    halfOpenSuccessCount: 0,
    halfOpenFailureCount: 0,
    halfOpenStartedAt: null,
    manuallyClosed: false,
    updatedAt: now,
  };
  
  mockStates.set(key, state);
  return state;
};

const mockCheckCircuitBreaker = async (tenantId, apiInterfaceId) => {
  const key = getCircuitKey(tenantId, apiInterfaceId);
  const state = mockStates.get(key);
  
  if (!state || state.state === STATES.CLOSED) {
    return {
      allowed: true,
      state: STATES.CLOSED,
    };
  }
  
  const now = new Date();
  
  if (state.state === STATES.OPEN) {
    if (now >= new Date(state.cooldownUntil)) {
      state.state = STATES.HALF_OPEN;
      state.halfOpenStartedAt = now;
      state.halfOpenSuccessCount = 0;
      state.halfOpenFailureCount = 0;
      mockStates.set(key, state);
      
      return {
        allowed: true,
        state: STATES.HALF_OPEN,
        halfOpen: true,
        passProbability: 0.1,
      };
    }
    
    const retryAfter = Math.ceil((new Date(state.cooldownUntil) - now) / 1000);
    return {
      allowed: false,
      state: STATES.OPEN,
      retryAfter,
      cooldownUntil: state.cooldownUntil,
    };
  }
  
  if (state.state === STATES.HALF_OPEN) {
    return {
      allowed: true,
      state: STATES.HALF_OPEN,
      halfOpen: true,
      passProbability: 0.1,
    };
  }
  
  return {
    allowed: true,
    state: STATES.CLOSED,
  };
};

const mockCloseCircuit = async (tenantId, apiInterfaceId) => {
  const key = getCircuitKey(tenantId, apiInterfaceId);
  const state = mockStates.get(key);
  
  if (!state) {
    return null;
  }
  
  state.state = STATES.CLOSED;
  state.openedAt = null;
  state.cooldownUntil = null;
  state.halfOpenStartedAt = null;
  state.halfOpenSuccessCount = 0;
  state.halfOpenFailureCount = 0;
  state.updatedAt = new Date();
  
  mockStates.set(key, state);
  return state;
};

const mockTransitionToHalfOpen = async (tenantId, apiInterfaceId) => {
  const key = getCircuitKey(tenantId, apiInterfaceId);
  const state = mockStates.get(key);
  
  if (!state) {
    return null;
  }
  
  state.state = STATES.HALF_OPEN;
  state.halfOpenStartedAt = new Date();
  state.halfOpenSuccessCount = 0;
  state.halfOpenFailureCount = 0;
  state.updatedAt = new Date();
  
  mockStates.set(key, state);
  return state;
};

const mockManuallyCloseCircuit = async (tenantId, apiInterfaceId, operatorId) => {
  const key = getCircuitKey(tenantId, apiInterfaceId);
  const state = mockStates.get(key);
  
  if (!state || state.state === STATES.CLOSED) {
    return {
      success: false,
      message: 'Circuit breaker is already closed',
    };
  }
  
  state.state = STATES.CLOSED;
  state.openedAt = null;
  state.cooldownUntil = null;
  state.halfOpenStartedAt = null;
  state.halfOpenSuccessCount = 0;
  state.halfOpenFailureCount = 0;
  state.manuallyClosed = true;
  state.manuallyClosedBy = operatorId;
  state.manuallyClosedAt = new Date();
  state.updatedAt = new Date();
  
  mockStates.set(key, state);
  
  return {
    success: true,
    message: 'Circuit breaker manually closed',
    state,
  };
};

const mockRecordHalfOpenRequest = async (tenantId, apiInterfaceId, success) => {
  const key = getCircuitKey(tenantId, apiInterfaceId);
  const state = mockStates.get(key);
  
  if (!state || state.state !== STATES.HALF_OPEN) {
    return null;
  }
  
  if (success) {
    state.halfOpenSuccessCount += 1;
    
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    if (state.halfOpenStartedAt <= tenMinutesAgo && state.halfOpenFailureCount === 0) {
      return mockCloseCircuit(tenantId, apiInterfaceId);
    }
  } else {
    state.halfOpenFailureCount += 1;
    return mockOpenCircuit(tenantId, apiInterfaceId, state.alertRuleId, state.cooldownPeriod);
  }
  
  state.updatedAt = new Date();
  mockStates.set(key, state);
  return state;
};

const mockGetCircuitBreakerState = async (tenantId, apiInterfaceId) => {
  const key = getCircuitKey(tenantId, apiInterfaceId);
  return mockStates.get(key) || null;
};

describe('CircuitBreakerService (Mocked)', () => {
  const testTenantId = 'test-tenant-id';
  const testApiId = 'test-api-id';
  const testRuleId = 'test-rule-id';

  beforeEach(() => {
    mockStates.clear();
  });

  afterEach(() => {
    mockStates.clear();
  });

  describe('openCircuit', () => {
    it('should open circuit for the first time', async () => {
      const state = await mockOpenCircuit(testTenantId, testApiId, testRuleId, 30);
      
      assert.equal(state.tenantId, testTenantId);
      assert.equal(state.apiInterfaceId, testApiId);
      assert.equal(state.alertRuleId, testRuleId);
      assert.equal(state.state, STATES.OPEN);
      assert.ok(state.openedAt);
      assert.ok(state.cooldownUntil);
    });

    it('should update existing circuit breaker state', async () => {
      await mockOpenCircuit(testTenantId, testApiId, testRuleId, 30);
      
      const newRuleId = 'new-rule-id';
      const updatedState = await mockOpenCircuit(testTenantId, testApiId, newRuleId, 60);
      
      assert.equal(updatedState.alertRuleId, newRuleId);
      assert.equal(updatedState.state, STATES.OPEN);
      assert.equal(updatedState.cooldownPeriod, 60);
    });
  });

  describe('checkCircuitBreaker', () => {
    it('should return allowed: true when no state exists', async () => {
      const result = await mockCheckCircuitBreaker(testTenantId, testApiId);
      assert.equal(result.allowed, true);
      assert.equal(result.state, STATES.CLOSED);
    });

    it('should return allowed: false when circuit is open', async () => {
      await mockOpenCircuit(testTenantId, testApiId, testRuleId, 30);
      
      const result = await mockCheckCircuitBreaker(testTenantId, testApiId);
      assert.equal(result.allowed, false);
      assert.equal(result.state, STATES.OPEN);
      assert.ok(result.retryAfter > 0);
    });

    it('should transition to half-open after cooldown', async () => {
      await mockOpenCircuit(testTenantId, testApiId, testRuleId, 0);
      
      const result = await mockCheckCircuitBreaker(testTenantId, testApiId);
      assert.equal(result.state, STATES.HALF_OPEN);
      assert.equal(result.allowed, true);
      assert.equal(result.passProbability, 0.1);
    });
  });

  describe('closeCircuit', () => {
    it('should close circuit successfully', async () => {
      await mockOpenCircuit(testTenantId, testApiId, testRuleId, 30);
      
      const closedState = await mockCloseCircuit(testTenantId, testApiId);
      assert.equal(closedState.state, STATES.CLOSED);
      assert.equal(closedState.openedAt, null);
      assert.equal(closedState.cooldownUntil, null);
    });
  });

  describe('manuallyCloseCircuit', () => {
    it('should manually close open circuit', async () => {
      await mockOpenCircuit(testTenantId, testApiId, testRuleId, 30);
      
      const result = await mockManuallyCloseCircuit(testTenantId, testApiId, 'user-id');
      assert.equal(result.success, true);
      
      const state = await mockGetCircuitBreakerState(testTenantId, testApiId);
      assert.equal(state.state, STATES.CLOSED);
      assert.equal(state.manuallyClosed, true);
      assert.equal(state.manuallyClosedBy, 'user-id');
    });

    it('should return error when circuit already closed', async () => {
      const result = await mockManuallyCloseCircuit(testTenantId, testApiId, 'user-id');
      assert.equal(result.success, false);
    });
  });

  describe('recordHalfOpenRequest', () => {
    it('should record successful request in half-open state', async () => {
      await mockOpenCircuit(testTenantId, testApiId, testRuleId, 0);
      await mockTransitionToHalfOpen(testTenantId, testApiId);
      
      const state = await mockRecordHalfOpenRequest(testTenantId, testApiId, true);
      assert.equal(state.halfOpenSuccessCount, 1);
    });

    it('should record failed request in half-open state and re-open circuit', async () => {
      await mockOpenCircuit(testTenantId, testApiId, testRuleId, 0);
      await mockTransitionToHalfOpen(testTenantId, testApiId);
      
      const state = await mockRecordHalfOpenRequest(testTenantId, testApiId, false);
      assert.equal(state.state, STATES.OPEN);
    });

    it('should auto-close after 10 minutes of success in half-open', async () => {
      await mockOpenCircuit(testTenantId, testApiId, testRuleId, 0);
      await mockTransitionToHalfOpen(testTenantId, testApiId);
      
      const key = getCircuitKey(testTenantId, testApiId);
      const state = mockStates.get(key);
      state.halfOpenStartedAt = new Date(Date.now() - 11 * 60 * 1000);
      mockStates.set(key, state);
      
      const result = await mockRecordHalfOpenRequest(testTenantId, testApiId, true);
      assert.equal(result.state, STATES.CLOSED);
    });
  });

  describe('State Transitions', () => {
    it('should transition closed -> open -> half_open -> closed', async () => {
      const result1 = await mockCheckCircuitBreaker(testTenantId, testApiId);
      assert.equal(result1.state, STATES.CLOSED);
      
      await mockOpenCircuit(testTenantId, testApiId, testRuleId, 0);
      const result2 = await mockCheckCircuitBreaker(testTenantId, testApiId);
      assert.equal(result2.state, STATES.HALF_OPEN);
      
      const key = getCircuitKey(testTenantId, testApiId);
      const state = mockStates.get(key);
      state.halfOpenStartedAt = new Date(Date.now() - 11 * 60 * 1000);
      mockStates.set(key, state);
      
      await mockRecordHalfOpenRequest(testTenantId, testApiId, true);
      const result3 = await mockCheckCircuitBreaker(testTenantId, testApiId);
      assert.equal(result3.state, STATES.CLOSED);
    });

    it('should re-open circuit on failure during half-open', async () => {
      await mockOpenCircuit(testTenantId, testApiId, testRuleId, 0);
      await mockCheckCircuitBreaker(testTenantId, testApiId);
      
      const reopenedState = await mockRecordHalfOpenRequest(testTenantId, testApiId, false);
      assert.equal(reopenedState.state, STATES.OPEN);
      
      const key = getCircuitKey(testTenantId, testApiId);
      const state = mockStates.get(key);
      state.cooldownPeriod = 30;
      state.cooldownUntil = new Date(Date.now() + 30 * 60 * 1000);
      mockStates.set(key, state);
      
      const result = await mockCheckCircuitBreaker(testTenantId, testApiId);
      assert.equal(result.state, STATES.OPEN);
      assert.equal(result.allowed, false);
    });
  });
});
