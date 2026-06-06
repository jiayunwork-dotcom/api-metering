import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

const mockRedis = new Map();

const mockGetRateLimitKey = (tenantId, apiInterfaceId) => {
  return `rate_limit:${tenantId}:${apiInterfaceId || 'global'}`;
};

const mockSetRateLimitRule = async (tenantId, apiInterfaceId, ruleId, rate, burst) => {
  const key = mockGetRateLimitKey(tenantId, apiInterfaceId);
  const now = Date.now();
  const data = {
    ruleId,
    tokens: burst,
    lastRefill: now,
    rate,
    burst,
    active: true,
    createdAt: now,
  };
  mockRedis.set(key, JSON.stringify(data));
  return true;
};

const mockAcquireToken = async (tenantId, apiInterfaceId, rate, burst) => {
  const key = mockGetRateLimitKey(tenantId, apiInterfaceId);
  const now = Date.now();
  
  let data;
  const raw = mockRedis.get(key);
  
  if (!raw) {
    return { allowed: true, tokens: burst, retryAfter: 0 };
  }
  
  data = JSON.parse(raw);
  
  if (!data.active) {
    return { allowed: true, tokens: burst, retryAfter: 0 };
  }
  
  const elapsed = (now - data.lastRefill) / 1000;
  const refillTokens = Math.floor(elapsed * rate);
  
  if (refillTokens > 0) {
    data.tokens = Math.min(data.burst, data.tokens + refillTokens);
    data.lastRefill = now;
  }
  
  if (data.tokens >= 1) {
    data.tokens -= 1;
    mockRedis.set(key, JSON.stringify(data));
    return { allowed: true, tokens: data.tokens, retryAfter: 0 };
  } else {
    const retryAfter = Math.ceil(1 / rate);
    return { allowed: false, tokens: 0, retryAfter };
  }
};

const mockClearRateLimit = async (tenantId, apiInterfaceId) => {
  const key = mockGetRateLimitKey(tenantId, apiInterfaceId);
  mockRedis.delete(key);
  return true;
};

const mockCheckRateLimit = async (tenantId, apiInterfaceId) => {
  const key = mockGetRateLimitKey(tenantId, apiInterfaceId);
  const raw = mockRedis.get(key);
  
  if (!raw) {
    return { limited: false };
  }
  
  const data = JSON.parse(raw);
  return {
    limited: data.active,
    ruleId: data.ruleId,
    tokens: data.tokens,
    burst: data.burst,
    rate: data.rate,
  };
};

describe('RateLimitService (Mocked)', () => {
  const testTenantId = 'test-tenant-id';
  const testApiId = 'test-api-id';
  const testRuleId = 'test-rule-id';

  beforeEach(() => {
    mockRedis.clear();
  });

  afterEach(() => {
    mockRedis.clear();
  });

  describe('getRateLimitKey', () => {
    it('should generate correct key with apiInterfaceId', () => {
      const key = mockGetRateLimitKey(testTenantId, testApiId);
      assert.equal(key, `rate_limit:${testTenantId}:${testApiId}`);
    });

    it('should generate correct key without apiInterfaceId (global)', () => {
      const key = mockGetRateLimitKey(testTenantId, null);
      assert.equal(key, `rate_limit:${testTenantId}:global`);
    });
  });

  describe('setRateLimitRule', () => {
    it('should set rate limit rule successfully', async () => {
      const result = await mockSetRateLimitRule(testTenantId, testApiId, testRuleId, 10, 20);
      assert.equal(result, true);

      const status = await mockCheckRateLimit(testTenantId, testApiId);
      assert.equal(status.limited, true);
      assert.equal(status.ruleId, testRuleId);
      assert.equal(status.tokens, 20);
    });
  });

  describe('acquireToken', () => {
    it('should allow request when tokens available', async () => {
      await mockSetRateLimitRule(testTenantId, testApiId, testRuleId, 10, 20);
      
      const result = await mockAcquireToken(testTenantId, testApiId, 10, 20);
      assert.equal(result.allowed, true);
      assert.equal(result.retryAfter, 0);
      assert.ok(result.tokens < 20);
    });

    it('should deny request when no tokens available', async () => {
      await mockSetRateLimitRule(testTenantId, testApiId, testRuleId, 1, 1);
      
      await mockAcquireToken(testTenantId, testApiId, 1, 1);
      const result = await mockAcquireToken(testTenantId, testApiId, 1, 1);
      
      assert.equal(result.allowed, false);
      assert.ok(result.retryAfter > 0);
    });

    it('should refill tokens over time', async () => {
      await mockSetRateLimitRule(testTenantId, testApiId, testRuleId, 10, 20);
      
      for (let i = 0; i < 20; i++) {
        await mockAcquireToken(testTenantId, testApiId, 10, 20);
      }
      
      const afterExhaust = await mockAcquireToken(testTenantId, testApiId, 10, 20);
      assert.equal(afterExhaust.allowed, false);
      
      const key = mockGetRateLimitKey(testTenantId, testApiId);
      const data = JSON.parse(mockRedis.get(key));
      data.lastRefill = Date.now() - 2000;
      mockRedis.set(key, JSON.stringify(data));
      
      const afterRefill = await mockAcquireToken(testTenantId, testApiId, 10, 20);
      assert.equal(afterRefill.allowed, true);
    });
  });

  describe('checkRateLimit', () => {
    it('should return limited: false when no rule set', async () => {
      const result = await mockCheckRateLimit(testTenantId, testApiId);
      assert.equal(result.limited, false);
    });

    it('should return limited: true when rule exists', async () => {
      await mockSetRateLimitRule(testTenantId, testApiId, testRuleId, 10, 20);
      const result = await mockCheckRateLimit(testTenantId, testApiId);
      assert.equal(result.limited, true);
      assert.equal(result.ruleId, testRuleId);
    });
  });

  describe('clearRateLimit', () => {
    it('should clear rate limit successfully', async () => {
      await mockSetRateLimitRule(testTenantId, testApiId, testRuleId, 10, 20);
      
      const beforeStatus = await mockCheckRateLimit(testTenantId, testApiId);
      assert.equal(beforeStatus.limited, true);

      await mockClearRateLimit(testTenantId, testApiId);
      
      const afterStatus = await mockCheckRateLimit(testTenantId, testApiId);
      assert.equal(afterStatus.limited, false);
    });
  });

  describe('Token Bucket Edge Cases', () => {
    it('should not exceed burst capacity when refilling', async () => {
      await mockSetRateLimitRule(testTenantId, testApiId, testRuleId, 100, 20);
      
      const key = mockGetRateLimitKey(testTenantId, testApiId);
      const data = JSON.parse(mockRedis.get(key));
      data.lastRefill = Date.now() - 10000;
      mockRedis.set(key, JSON.stringify(data));
      
      const result = await mockAcquireToken(testTenantId, testApiId, 100, 20);
      assert.equal(result.allowed, true);
      
      const afterData = JSON.parse(mockRedis.get(key));
      assert.equal(afterData.tokens, 19);
    });

    it('should work at exactly the rate limit', async () => {
      await mockSetRateLimitRule(testTenantId, testApiId, testRuleId, 5, 5);
      
      for (let i = 0; i < 5; i++) {
        const result = await mockAcquireToken(testTenantId, testApiId, 5, 5);
        assert.equal(result.allowed, true, `Request ${i} should be allowed`);
      }
      
      const sixthResult = await mockAcquireToken(testTenantId, testApiId, 5, 5);
      assert.equal(sixthResult.allowed, false, 'Sixth request should be denied');
    });
  });
});
