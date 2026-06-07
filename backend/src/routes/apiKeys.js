import {
  createApiKey,
  listApiKeys,
  getApiKeyById,
  updateApiKey,
  toggleApiKeyStatus,
  deleteApiKey,
  rotateApiKey,
  listAccessLogs,
  getKeyUsageStats,
  MAX_KEYS_PER_TENANT,
} from '../services/apiKeyService.js';
import { ApiKeyPermission } from '../models/index.js';

export default async function apiKeyRoutes(fastify) {
  const authenticate = fastify.authenticate;

  fastify.get('/api/tenants/:tenantId/api-keys', { onRequest: [authenticate] }, async (request, reply) => {
    const { tenantId } = request.params;
    const { page = 1, pageSize = 50, status } = request.query;

    try {
      const result = await listApiKeys(tenantId, {
        status,
        limit: parseInt(pageSize),
        offset: (parseInt(page) - 1) * parseInt(pageSize),
      });

      return {
        success: true,
        data: result.data,
        total: result.total,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        maxKeysPerTenant: MAX_KEYS_PER_TENANT,
      };
    } catch (error) {
      return reply.status(400).send({ success: false, message: error.message });
    }
  });

  fastify.get('/api/tenants/:tenantId/api-keys/:id', { onRequest: [authenticate] }, async (request, reply) => {
    const { tenantId, id } = request.params;

    try {
      const apiKey = await getApiKeyById(id, tenantId);
      if (!apiKey) {
        return reply.status(404).send({ success: false, message: '密钥不存在' });
      }

      return { success: true, data: apiKey };
    } catch (error) {
      return reply.status(400).send({ success: false, message: error.message });
    }
  });

  fastify.post('/api/tenants/:tenantId/api-keys', { onRequest: [authenticate] }, async (request, reply) => {
    const { tenantId } = request.params;
    const data = request.body;

    try {
      const apiKey = await createApiKey(tenantId, data, request.user?.id);
      return { success: true, data: apiKey };
    } catch (error) {
      return reply.status(400).send({ success: false, message: error.message });
    }
  });

  fastify.put('/api/tenants/:tenantId/api-keys/:id', { onRequest: [authenticate] }, async (request, reply) => {
    const { tenantId, id } = request.params;
    const data = request.body;

    try {
      const apiKey = await updateApiKey(id, tenantId, data);
      return { success: true, data: apiKey };
    } catch (error) {
      return reply.status(400).send({ success: false, message: error.message });
    }
  });

  fastify.post('/api/tenants/:tenantId/api-keys/:id/toggle', { onRequest: [authenticate] }, async (request, reply) => {
    const { tenantId, id } = request.params;

    try {
      const result = await toggleApiKeyStatus(id, tenantId);
      return { success: true, ...result };
    } catch (error) {
      return reply.status(400).send({ success: false, message: error.message });
    }
  });

  fastify.delete('/api/tenants/:tenantId/api-keys/:id', { onRequest: [authenticate] }, async (request, reply) => {
    const { tenantId, id } = request.params;

    try {
      await deleteApiKey(id, tenantId);
      return { success: true, message: '密钥已删除' };
    } catch (error) {
      return reply.status(400).send({ success: false, message: error.message });
    }
  });

  fastify.post('/api/tenants/:tenantId/api-keys/:id/rotate', { onRequest: [authenticate] }, async (request, reply) => {
    const { tenantId, id } = request.params;
    const { gracePeriodHours = 24 } = request.body;

    try {
      const result = await rotateApiKey(id, tenantId, gracePeriodHours, request.user?.id);
      return { success: true, data: result };
    } catch (error) {
      return reply.status(400).send({ success: false, message: error.message });
    }
  });

  fastify.get('/api/tenants/:tenantId/api-keys/:id/access-logs', { onRequest: [authenticate] }, async (request, reply) => {
    const { tenantId, id } = request.params;
    const { page = 1, pageSize = 50, accessType, startTime, endTime } = request.query;

    try {
      const result = await listAccessLogs(tenantId, {
        apiKeyId: id,
        accessType,
        startTime,
        endTime,
        limit: parseInt(pageSize),
        offset: (parseInt(page) - 1) * parseInt(pageSize),
      });

      return {
        success: true,
        data: result.data,
        total: result.total,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
      };
    } catch (error) {
      return reply.status(400).send({ success: false, message: error.message });
    }
  });

  fastify.get('/api/tenants/:tenantId/api-keys/:id/usage-stats', { onRequest: [authenticate] }, async (request, reply) => {
    const { tenantId, id } = request.params;
    const { startDate, endDate } = request.query;

    try {
      const stats = await getKeyUsageStats(
        tenantId,
        id,
        startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        endDate || new Date()
      );

      return { success: true, data: stats };
    } catch (error) {
      return reply.status(400).send({ success: false, message: error.message });
    }
  });

  fastify.get('/api/tenants/:tenantId/api-keys/access-logs', { onRequest: [authenticate] }, async (request, reply) => {
    const { tenantId } = request.params;
    const { page = 1, pageSize = 50, apiKeyId, accessType, startTime, endTime } = request.query;

    try {
      const result = await listAccessLogs(tenantId, {
        apiKeyId,
        accessType,
        startTime,
        endTime,
        limit: parseInt(pageSize),
        offset: (parseInt(page) - 1) * parseInt(pageSize),
      });

      return {
        success: true,
        data: result.data,
        total: result.total,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
      };
    } catch (error) {
      return reply.status(400).send({ success: false, message: error.message });
    }
  });

  fastify.get('/api/api-key/permissions/options', { onRequest: [authenticate] }, async () => {
    return {
      success: true,
      data: {
        resources: ApiKeyPermission.RESOURCES,
        actions: ApiKeyPermission.ACTIONS,
        presetRoles: ApiKeyPermission.PRESET_ROLES,
        resourceLabels: {
          metering_event: '计量事件上报',
          usage_query: '用量查询',
          billing_view: '账单查看',
          rule_management: '规则管理',
          tenant_info: '租户信息',
          api_key_management: 'API密钥管理',
        },
        actionLabels: {
          read: '读',
          write: '写',
        },
      },
    };
  });
}
