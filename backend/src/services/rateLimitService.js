import redis from '../config/redis.js';

const RATE_LIMIT_PREFIX = 'rate_limit';
const RATE_LIMIT_TTL = 86400;

export function getRateLimitKey(tenantId, apiInterfaceId) {
  const apiPart = apiInterfaceId || 'global';
  return `${RATE_LIMIT_PREFIX}:${tenantId}:${apiPart}`;
}

export async function acquireToken(tenantId, apiInterfaceId, rate, burst) {
  const key = getRateLimitKey(tenantId, apiInterfaceId);
  const now = Date.now();

  const luaScript = `
    local key = KEYS[1]
    local now = tonumber(ARGV[1])
    local rate = tonumber(ARGV[2])
    local burst = tonumber(ARGV[3])
    local ttl = tonumber(ARGV[4])

    local data = redis.call('HMGET', key, 'tokens', 'last_refill')
    local tokens = tonumber(data[1]) or burst
    local last_refill = tonumber(data[2]) or now

    local elapsed = now - last_refill
    local refill_amount = (elapsed / 1000) * rate
    tokens = math.min(tokens + refill_amount, burst)

    if tokens >= 1 then
      tokens = tokens - 1
      redis.call('HMSET', key, 'tokens', tokens, 'last_refill', now)
      redis.call('EXPIRE', key, ttl)
      return { allowed = 1, tokens = tokens, retry_after = 0 }
    else
      local needed = 1 - tokens
      local retry_after = math.ceil(needed / rate)
      return { allowed = 0, tokens = tokens, retry_after = retry_after }
    end
  `;

  try {
    const result = await redis.eval(
      luaScript,
      1,
      key,
      now.toString(),
      rate.toString(),
      burst.toString(),
      RATE_LIMIT_TTL.toString()
    );

    return {
      allowed: result[0] === 1,
      tokens: parseFloat(result[1]),
      retryAfter: parseInt(result[2]),
    };
  } catch (error) {
    console.error('Rate limit operation failed:', error);
    return { allowed: true, tokens: burst, retryAfter: 0 };
  }
}

export async function getRateLimitStatus(tenantId, apiInterfaceId) {
  const key = getRateLimitKey(tenantId, apiInterfaceId);

  try {
    const data = await redis.hmget(key, 'tokens', 'last_refill', 'rule_id');
    return {
      active: data[0] !== null,
      tokens: data[0] ? parseFloat(data[0]) : null,
      lastRefill: data[1] ? new Date(parseInt(data[1])) : null,
      ruleId: data[2],
    };
  } catch (error) {
    console.error('Get rate limit status failed:', error);
    return { active: false };
  }
}

export async function setRateLimitRule(tenantId, apiInterfaceId, ruleId, rate, burst) {
  const key = getRateLimitKey(tenantId, apiInterfaceId);

  try {
    await redis.hmset(key, 'rule_id', ruleId, 'tokens', burst, 'last_refill', Date.now());
    await redis.expire(key, RATE_LIMIT_TTL);
    return true;
  } catch (error) {
    console.error('Set rate limit rule failed:', error);
    return false;
  }
}

export async function clearRateLimit(tenantId, apiInterfaceId) {
  const key = getRateLimitKey(tenantId, apiInterfaceId);

  try {
    await redis.del(key);
    return true;
  } catch (error) {
    console.error('Clear rate limit failed:', error);
    return false;
  }
}

export async function checkRateLimit(tenantId, apiInterfaceId) {
  const key = getRateLimitKey(tenantId, apiInterfaceId);

  try {
    const data = await redis.hmget(key, 'rule_id', 'tokens', 'last_refill');
    if (!data[0]) {
      return { limited: false };
    }

    return {
      limited: true,
      ruleId: data[0],
      tokens: parseFloat(data[1]),
      lastRefill: new Date(parseInt(data[2])),
    };
  } catch (error) {
    console.error('Check rate limit failed:', error);
    return { limited: false };
  }
}

export default {
  acquireToken,
  getRateLimitStatus,
  setRateLimitRule,
  clearRateLimit,
  checkRateLimit,
  getRateLimitKey,
};
