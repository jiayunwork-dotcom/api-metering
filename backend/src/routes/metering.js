import { collectEvents, reprocessDeadLetterEvents, flushEventBuffer } from '../services/meteringEventService.js';
import { checkAndConsumeQuota } from '../services/quotaService.js';
import { DeadLetterEvent } from '../models/index.js';
import { Op } from 'sequelize';
import { checkCircuitBreaker, recordHalfOpenRequest } from '../services/circuitBreakerService.js';
import { checkRateLimit, acquireToken } from '../services/rateLimitService.js';
import { AlertRule } from '../models/index.js';

export default async function meteringRoutes(fastify) {
  fastify.post('/api/metering/events', async (request, reply) => {
    const events = request.body;
    
    try {
      const result = await collectEvents(events);
      return { success: true, ...result };
    } catch (error) {
      return reply.status(400).send({ success: false, message: error.message });
    }
  });

  fastify.post('/api/metering/events/check-quota', async (request, reply) => {
    const { tenantCode, apiPath, method, callCount = 1, dataMB = 0, computeSeconds = 0 } = request.body;

    const { Tenant, ApiInterface } = await import('../models/index.js');
    
    const tenant = await Tenant.findOne({ where: { code: tenantCode, status: 'active' } });
    if (!tenant) {
      return reply.status(403).send({ allowed: false, reason: 'Tenant not found or disabled' });
    }

    if (tenant.status === 'disabled') {
      return reply.status(403).send({ allowed: false, reason: 'Tenant disabled' });
    }

    const apiInterface = await ApiInterface.findOne({ where: { path: apiPath, method: method || 'POST', status: 'active' } });
    if (!apiInterface) {
      return reply.status(404).send({ allowed: false, reason: 'API not found' });
    }

    const circuitResult = await checkCircuitBreaker(tenant.id, apiInterface.id);
    if (!circuitResult.allowed) {
      if (circuitResult.state === 'open') {
        reply.header('Retry-After', circuitResult.retryAfter);
        return reply.status(503).send({
          allowed: false,
          reason: 'Service temporarily unavailable',
          state: 'circuit_breaker_open',
          retryAfter: circuitResult.retryAfter,
        });
      } else if (circuitResult.state === 'half_open') {
        return reply.status(503).send({
          allowed: false,
          reason: 'Service in half-open state, please retry later',
          state: 'circuit_breaker_half_open',
          retryAfter: circuitResult.remainingTime,
        });
      }
    }

    const isHalfOpen = circuitResult.state === 'half_open';

    const rateLimitCheck = await checkRateLimit(tenant.id, apiInterface.id);
    if (rateLimitCheck.limited) {
      const rule = await AlertRule.findByPk(rateLimitCheck.ruleId);
      if (rule && rule.status === 'active') {
        const qps = rule.actionConfig?.qps || 10;
        const burst = rule.actionConfig?.burst || qps * 2;
        const tokenResult = await acquireToken(tenant.id, apiInterface.id, qps, burst);
        
        if (!tokenResult.allowed) {
          reply.header('Retry-After', tokenResult.retryAfter);
          return reply.status(429).send({
            allowed: false,
            reason: 'Rate limit exceeded',
            state: 'rate_limited',
            retryAfter: tokenResult.retryAfter,
          });
        }
      }
    }

    const results = await Promise.all([
      callCount > 0 ? checkAndConsumeQuota(tenant.id, apiInterface.id, 'count', callCount) : null,
      dataMB > 0 ? checkAndConsumeQuota(tenant.id, apiInterface.id, 'data_transfer', dataMB) : null,
      computeSeconds > 0 ? checkAndConsumeQuota(tenant.id, apiInterface.id, 'compute_time', computeSeconds) : null,
    ]);

    const denied = results.find(r => r && !r.allowed);
    if (denied) {
      if (isHalfOpen) {
        await recordHalfOpenRequest(tenant.id, apiInterface.id, false);
      }

      return reply.status(429).send({
        allowed: false,
        reason: denied.reason,
        hardLimit: denied.hardLimit,
      });
    }

    if (isHalfOpen) {
      await recordHalfOpenRequest(tenant.id, apiInterface.id, true);
    }

    return {
      allowed: true,
      consumed: results.filter(r => r).map(r => r.consumed),
    };
  });

  fastify.post('/api/metering/flush', { onRequest: [fastify.authenticate] }, async () => {
    const result = await flushEventBuffer();
    return { success: true, ...result };
  });

  fastify.get('/api/metering/dead-letters', { onRequest: [fastify.authenticate] }, async (request) => {
    const { page = 1, pageSize = 50, tenantId, month, status } = request.query;
    
    const where = {};
    if (tenantId) where.tenantId = tenantId;
    if (month) where.month = month;
    if (status) where.status = status;

    const { count, rows } = await DeadLetterEvent.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });

    return {
      success: true,
      data: rows,
      total: count,
      page: parseInt(page),
      pageSize: parseInt(pageSize),
    };
  });

  fastify.post('/api/metering/dead-letters/reprocess', { onRequest: [fastify.authenticate] }, async (request) => {
    const { ids } = request.body;
    const result = await reprocessDeadLetterEvents(ids);
    return { success: true, data: result };
  });
}
