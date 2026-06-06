import {
  getAlertRules,
  getAlertRuleById,
  createAlertRule,
  updateAlertRule,
  deleteAlertRule,
  updateRulePriorities,
  getTriggerHistory,
  getTenantAlertStatus,
  evaluateRules,
} from '../services/alertRuleService.js';
import {
  getRateLimitStatus,
  clearRateLimit,
} from '../services/rateLimitService.js';
import {
  getCircuitBreakerStatus,
  manuallyCloseCircuit,
  checkCircuitBreaker,
} from '../services/circuitBreakerService.js';
import {
  getWebhookConfigs,
  createWebhookConfig,
  updateWebhookConfig,
  deleteWebhookConfig,
  testWebhookConfig,
} from '../services/webhookService.js';

export default async function alertRoutes(fastify) {
  fastify.get('/api/tenants/:tenantId/alerts/rules', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    try {
      const rules = await getAlertRules(request.params.tenantId);
      return { success: true, data: rules };
    } catch (error) {
      return reply.status(400).send({ success: false, message: error.message });
    }
  });

  fastify.get('/api/tenants/:tenantId/alerts/rules/:id', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    try {
      const rule = await getAlertRuleById(request.params.id, request.params.tenantId);
      if (!rule) {
        return reply.status(404).send({ success: false, message: '预警规则不存在' });
      }
      return { success: true, data: rule };
    } catch (error) {
      return reply.status(400).send({ success: false, message: error.message });
    }
  });

  fastify.post('/api/tenants/:tenantId/alerts/rules', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    try {
      const rule = await createAlertRule(request.params.tenantId, request.body);
      return { success: true, data: rule };
    } catch (error) {
      return reply.status(400).send({ success: false, message: error.message });
    }
  });

  fastify.put('/api/tenants/:tenantId/alerts/rules/:id', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    try {
      const rule = await updateAlertRule(request.params.id, request.params.tenantId, request.body);
      return { success: true, data: rule };
    } catch (error) {
      return reply.status(400).send({ success: false, message: error.message });
    }
  });

  fastify.delete('/api/tenants/:tenantId/alerts/rules/:id', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    try {
      await deleteAlertRule(request.params.id, request.params.tenantId);
      return { success: true, message: '删除成功' };
    } catch (error) {
      return reply.status(400).send({ success: false, message: error.message });
    }
  });

  fastify.post('/api/tenants/:tenantId/alerts/rules/reorder', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    try {
      const { orderedRuleIds } = request.body;
      if (!Array.isArray(orderedRuleIds)) {
        return reply.status(400).send({ success: false, message: 'orderedRuleIds 必须是数组' });
      }
      await updateRulePriorities(request.params.tenantId, orderedRuleIds);
      return { success: true, message: '优先级已更新' };
    } catch (error) {
      return reply.status(400).send({ success: false, message: error.message });
    }
  });

  fastify.get('/api/tenants/:tenantId/alerts/history', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    try {
      const { ruleId, limit = 20 } = request.query;
      const history = await getTriggerHistory(request.params.tenantId, ruleId, parseInt(limit));
      return { success: true, data: history };
    } catch (error) {
      return reply.status(400).send({ success: false, message: error.message });
    }
  });

  fastify.get('/api/tenants/:tenantId/alerts/status', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    try {
      const status = await getTenantAlertStatus(request.params.tenantId);
      return { success: true, data: status };
    } catch (error) {
      return reply.status(400).send({ success: false, message: error.message });
    }
  });

  fastify.get('/api/tenants/:tenantId/alerts/rate-limit-status', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    try {
      const { apiInterfaceId } = request.query;
      const status = await getRateLimitStatus(request.params.tenantId, apiInterfaceId);
      return { success: true, data: status };
    } catch (error) {
      return reply.status(400).send({ success: false, message: error.message });
    }
  });

  fastify.post('/api/tenants/:tenantId/alerts/rate-limit/clear', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    try {
      const { apiInterfaceId } = request.body;
      await clearRateLimit(request.params.tenantId, apiInterfaceId);
      return { success: true, message: '限流已解除' };
    } catch (error) {
      return reply.status(400).send({ success: false, message: error.message });
    }
  });

  fastify.get('/api/tenants/:tenantId/alerts/circuit-breaker-status', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    try {
      const status = await getCircuitBreakerStatus(request.params.tenantId);
      return { success: true, data: status };
    } catch (error) {
      return reply.status(400).send({ success: false, message: error.message });
    }
  });

  fastify.post('/api/tenants/:tenantId/alerts/circuit-breaker/close', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    try {
      const { apiInterfaceId } = request.body;
      const userId = request.user?.id;
      const result = await manuallyCloseCircuit(request.params.tenantId, apiInterfaceId, userId);
      return { success: result.success, message: result.message };
    } catch (error) {
      return reply.status(400).send({ success: false, message: error.message });
    }
  });

  fastify.get('/api/tenants/:tenantId/alerts/check-circuit', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    try {
      const { apiInterfaceId } = request.query;
      const result = await checkCircuitBreaker(request.params.tenantId, apiInterfaceId);
      return { success: true, data: result };
    } catch (error) {
      return reply.status(400).send({ success: false, message: error.message });
    }
  });

  fastify.post('/api/tenants/:tenantId/alerts/evaluate', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    try {
      const { apiInterfaceId } = request.body;
      const result = await evaluateRules(request.params.tenantId, apiInterfaceId);
      return { success: true, data: result };
    } catch (error) {
      return reply.status(400).send({ success: false, message: error.message });
    }
  });

  fastify.get('/api/tenants/:tenantId/webhooks', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    try {
      const webhooks = await getWebhookConfigs(request.params.tenantId);
      return { success: true, data: webhooks };
    } catch (error) {
      return reply.status(400).send({ success: false, message: error.message });
    }
  });

  fastify.post('/api/tenants/:tenantId/webhooks', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    try {
      const webhook = await createWebhookConfig(request.params.tenantId, request.body);
      return { success: true, data: webhook };
    } catch (error) {
      return reply.status(400).send({ success: false, message: error.message });
    }
  });

  fastify.put('/api/tenants/:tenantId/webhooks/:id', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    try {
      const webhook = await updateWebhookConfig(request.params.id, request.params.tenantId, request.body);
      return { success: true, data: webhook };
    } catch (error) {
      return reply.status(400).send({ success: false, message: error.message });
    }
  });

  fastify.delete('/api/tenants/:tenantId/webhooks/:id', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    try {
      await deleteWebhookConfig(request.params.id, request.params.tenantId);
      return { success: true, message: '删除成功' };
    } catch (error) {
      return reply.status(400).send({ success: false, message: error.message });
    }
  });

  fastify.post('/api/tenants/:tenantId/webhooks/:id/test', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    try {
      const result = await testWebhookConfig(request.params.id, request.params.tenantId);
      return { success: result.success, data: result };
    } catch (error) {
      return reply.status(400).send({ success: false, message: error.message });
    }
  });
}
