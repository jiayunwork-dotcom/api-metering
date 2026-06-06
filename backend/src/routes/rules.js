import {
  listRules, createRule, updateRule, activateRule, archiveRule,
  getActiveRules, getRuleChangeHistory, validateTiers,
} from '../services/meteringRuleService.js';
import { ApiInterface } from '../models/index.js';

export default async function ruleRoutes(fastify) {
  fastify.get('/api/rules', { onRequest: [fastify.authenticate] }, async (request) => {
    const { page = 1, pageSize = 50, apiInterfaceId, dimension, status, effectiveMonth } = request.query;
    
    const result = await listRules({
      limit: pageSize,
      offset: (page - 1) * pageSize,
      apiInterfaceId,
      dimension,
      status,
      effectiveMonth,
    });

    return {
      success: true,
      data: result.rows,
      total: result.count,
      page: parseInt(page),
      pageSize: parseInt(pageSize),
    };
  });

  fastify.get('/api/rules/:id', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { MeteringRule } = await import('../models/index.js');
    const rule = await MeteringRule.findByPk(request.params.id, {
      include: [{ model: ApiInterface }],
    });
    
    if (!rule) {
      return reply.status(404).send({ success: false, message: '规则不存在' });
    }

    return { success: true, data: rule };
  });

  fastify.post('/api/rules', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    try {
      const rule = await createRule(request.body, request.user.username);
      return { success: true, data: rule };
    } catch (error) {
      return reply.status(400).send({ success: false, message: error.message });
    }
  });

  fastify.put('/api/rules/:id', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    try {
      const rule = await updateRule(request.params.id, request.body, request.user.username);
      return { success: true, data: rule };
    } catch (error) {
      return reply.status(400).send({ success: false, message: error.message });
    }
  });

  fastify.post('/api/rules/:id/activate', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    try {
      const rule = await activateRule(request.params.id, request.user.username);
      return { success: true, data: rule };
    } catch (error) {
      return reply.status(400).send({ success: false, message: error.message });
    }
  });

  fastify.post('/api/rules/:id/archive', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    try {
      const rule = await archiveRule(request.params.id, request.user.username);
      return { success: true, data: rule };
    } catch (error) {
      return reply.status(400).send({ success: false, message: error.message });
    }
  });

  fastify.get('/api/rules/:id/history', { onRequest: [fastify.authenticate] }, async (request) => {
    const history = await getRuleChangeHistory(request.params.id);
    return { success: true, data: history };
  });

  fastify.post('/api/rules/validate-tiers', { onRequest: [fastify.authenticate] }, async (request) => {
    const result = validateTiers(request.body.tiers);
    return { success: result.valid, ...result };
  });

  fastify.get('/api/api-interfaces', { onRequest: [fastify.authenticate] }, async () => {
    const interfaces = await ApiInterface.findAll({
      where: { status: 'active' },
      order: [['name', 'ASC']],
    });
    return { success: true, data: interfaces };
  });

  fastify.post('/api/api-interfaces', { onRequest: [fastify.authenticate] }, async (request) => {
    const apiInterface = await ApiInterface.create(request.body);
    return { success: true, data: apiInterface };
  });
}
