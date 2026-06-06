import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  openCircuit,
  checkCircuitBreaker,
  transitionToHalfOpen,
  closeCircuit,
  recordHalfOpenRequest,
  manuallyCloseCircuit,
  getCircuitBreakerState,
} from '../src/services/circuitBreakerService.js';
import { CircuitBreakerState } from '../src/models/index.js';

describe('CircuitBreakerService', () => {
  const testTenantId = 'test-tenant-id';
  const testApiId = 'test-api-id';
  const testRuleId = 'test-rule-id';

  beforeEach(async () => {
    await CircuitBreakerState.destroy({
      where: { tenantId: testTenantId },
      force: true,
    });
  });

  afterEach(async () => {
    await CircuitBreakerState.destroy({
      where: { tenantId: testTenantId },
      force: true,
    });
  });

  describe('openCircuit', () => {
    it('should open circuit for the first time', async () => {
      const state = await openCircuit(testTenantId, testApiId, testRuleId, 30);
      
      assert.equal(state.tenantId, testTenantId);
      assert.equal(state.apiInterfaceId, testApiId);
      assert.equal(state.alertRuleId, testRuleId);
      assert.equal(state.state, 'open');
      assert.ok(state.openedAt);
      assert.ok(state.cooldownUntil);
    });

    it('should update existing circuit breaker state', async () => {
      await openCircuit(testTenantId, testApiId, testRuleId, 30);
      
      const newRuleId = 'new-rule-id';
      const updatedState = await openCircuit(testTenantId, testApiId, newRuleId, 60);
      
      assert.equal(updatedState.alertRuleId, newRuleId);
      assert.equal(updatedState.state, 'open');
    });
  });

  describe('checkCircuitBreaker', () => {
    it('should return allowed: true when no state exists', async () => {
      const result = await checkCircuitBreaker(testTenantId, testApiId);
      assert.equal(result.allowed, true);
      assert.equal(result.state, 'closed');
    });

    it('should return allowed: false when circuit is open', async () => {
      await openCircuit(testTenantId, testApiId, testRuleId, 30);
      
      const result = await checkCircuitBreaker(testTenantId, testApiId);
      assert.equal(result.allowed, false);
      assert.equal(result.state, 'open');
      assert.ok(result.retryAfter > 0);
    });

    it('should transition to half-open after cooldown', async () => {
      await openCircuit(testTenantId, testApiId, testRuleId, 0);
      
      const result = await checkCircuitBreaker(testTenantId, testApiId);
      assert.equal(result.state, 'half_open');
    });
  });

  describe('closeCircuit', () => {
    it('should close circuit successfully', async () => {
      await openCircuit(testTenantId, testApiId, testRuleId, 30);
      
      const closedState = await closeCircuit(testTenantId, testApiId);
      assert.equal(closedState.state, 'closed');
      assert.equal(closedState.openedAt, null);
      assert.equal(closedState.cooldownUntil, null);
    });
  });

  describe('manuallyCloseCircuit', () => {
    it('should manually close open circuit', async () => {
      await openCircuit(testTenantId, testApiId, testRuleId, 30);
      
      const result = await manuallyCloseCircuit(testTenantId, testApiId, 'user-id');
      assert.equal(result.success, true);
      
      const state = await getCircuitBreakerState(testTenantId, testApiId);
      assert.equal(state.state, 'closed');
      assert.equal(state.manuallyClosed, true);
    });

    it('should return error when circuit already closed', async () => {
      const result = await manuallyCloseCircuit(testTenantId, testApiId, 'user-id');
      assert.equal(result.success, false);
    });
  });

  describe('recordHalfOpenRequest', () => {
    it('should record successful request in half-open state', async () => {
      await openCircuit(testTenantId, testApiId, testRuleId, 0);
      await transitionToHalfOpen(testTenantId, testApiId);
      
      const state = await recordHalfOpenRequest(testTenantId, testApiId, true);
      assert.equal(state.halfOpenSuccessCount, 1);
    });

    it('should record failed request in half-open state', async () => {
      await openCircuit(testTenantId, testApiId, testRuleId, 0);
      await transitionToHalfOpen(testTenantId, testApiId);
      
      const state = await recordHalfOpenRequest(testTenantId, testApiId, false);
      assert.equal(state.halfOpenFailureCount, 1);
    });
  });
});
