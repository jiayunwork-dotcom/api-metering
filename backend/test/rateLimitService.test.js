import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import redis from '../src/config/redis.js';
import {
  getRateLimitKey,
  acquireToken,
  setRateLimitRule,
  clearRateLimit,
  checkRateLimit,
  getRateLimitStatus,
} from '../src/services/rateLimitService.js';

describe('RateLimitService', () => {
  const testTenantId = 'test-tenant-id';
  const testApiId = 'test-api-id';
  const testRuleId = 'test-rule-id';

  beforeEach(async () => {
    await clearRateLimit(testTenantId, testApiId);
    await clearRateLimit(testTenantId, null);
  });

  afterEach(async () => {
    await clearRateLimit(testTenantId, testApiId);
    await clearRateLimit(testTenantId, null);
  });

  describe('getRateLimitKey', () => {
    it('should generate correct key with apiInterfaceId', () => {
      const key = getRateLimitKey(testTenantId, testApiId);
      assert.equal(key, `rate_limit:${testTenantId}:${testApiId}`);
    });

    it('should generate correct key without apiInterfaceId (global)', () => {
      const key = getRateLimitKey(testTenantId, null);
      assert.equal(key, `rate_limit:${testTenantId}:global`);
    });
  });

  describe('setRateLimitRule', () => {
    it('should set rate limit rule successfully', async () => {
      const result = await setRateLimitRule(testTenantId, testApiId, testRuleId, 10, 20);
      assert.equal(result, true);

      const status = await getRateLimitStatus(testTenantId, testApiId);
      assert.equal(status.active, true);
      assert.equal(status.ruleId, testRuleId);
      assert.equal(status.tokens, 20);
    });
  });

  describe('acquireToken', () => {
    it('should allow request when tokens available', async () => {
      await setRateLimitRule(testTenantId, testApiId, testRuleId, 10, 20);
      
      const result = await acquireToken(testTenantId, testApiId, 10, 20);
      assert.equal(result.allowed, true);
      assert.equal(result.retryAfter, 0);
      assert.ok(result.tokens < 20);
    });

    it('should deny request when no tokens available', async () => {
      await setRateLimitRule(testTenantId, testApiId, testRuleId, 1, 1);
      
      await acquireToken(testTenantId, testApiId, 1, 1);
      const result = await acquireToken(testTenantId, testApiId, 1, 1);
      
      assert.equal(result.allowed, false);
      assert.ok(result.retryAfter > 0);
    });
  });

  describe('checkRateLimit', () => {
    it('should return limited: false when no rule set', async () => {
      const result = await checkRateLimit(testTenantId, testApiId);
      assert.equal(result.limited, false);
    });

    it('should return limited: true when rule exists', async () => {
      await setRateLimitRule(testTenantId, testApiId, testRuleId, 10, 20);
      const result = await checkRateLimit(testTenantId, testApiId);
      assert.equal(result.limited, true);
      assert.equal(result.ruleId, testRuleId);
    });
  });

  describe('clearRateLimit', () => {
    it('should clear rate limit successfully', async () => {
      await setRateLimitRule(testTenantId, testApiId, testRuleId, 10, 20);
      
      const beforeStatus = await getRateLimitStatus(testTenantId, testApiId);
      assert.equal(beforeStatus.active, true);

      await clearRateLimit(testTenantId, testApiId);
      
      const afterStatus = await getRateLimitStatus(testTenantId, testApiId);
      assert.equal(afterStatus.active, false);
    });
  });
});
