import { collectEvents, reprocessDeadLetterEvents, flushEventBuffer } from '../services/meteringEventService.js';
import { checkAndConsumeQuota } from '../services/quotaService.js';
import { DeadLetterEvent } from '../models/index.js';
import { Op } from 'sequelize';

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

    const results = await Promise.all([
      callCount > 0 ? checkAndConsumeQuota(tenant.id, apiInterface.id, 'count', callCount) : null,
      dataMB > 0 ? checkAndConsumeQuota(tenant.id, apiInterface.id, 'data_transfer', dataMB) : null,
      computeSeconds > 0 ? checkAndConsumeQuota(tenant.id, apiInterface.id, 'compute_time', computeSeconds) : null,
    ]);

    const denied = results.find(r => r && !r.allowed);
    if (denied) {
      return reply.status(429).send({
        allowed: false,
        reason: denied.reason,
        hardLimit: denied.hardLimit,
      });
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
