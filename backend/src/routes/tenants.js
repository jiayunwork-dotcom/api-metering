import { Tenant, Quota, Bill } from '../models/index.js';
import { Op } from 'sequelize';
import { getQuotaUsage } from '../services/quotaService.js';
import { getTenantCurrentUsage } from '../services/usageAggregationService.js';

export default async function tenantRoutes(fastify) {
  fastify.get('/api/tenants', {
    onRequest: fastify.authenticateWithPermission('tenant_info', 'read'),
  }, async (request) => {
    const { page = 1, pageSize = 50, keyword, status } = request.query;
    
    const where = {};
    if (keyword) {
      where[Op.or] = [
        { name: { [Op.like]: `%${keyword}%` } },
        { code: { [Op.like]: `%${keyword}%` } },
      ];
    }
    if (status) where.status = status;

    const { count, rows } = await Tenant.findAndCountAll({
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

  fastify.get('/api/tenants/:id', {
    onRequest: fastify.authenticateWithPermission('tenant_info', 'read'),
  }, async (request, reply) => {
    const tenant = await Tenant.findByPk(request.params.id);
    if (!tenant) {
      return reply.status(404).send({ success: false, message: '租户不存在' });
    }

    const [quotas, bills, currentUsage] = await Promise.all([
      getQuotaUsage(tenant.id),
      Bill.findAll({
        where: { tenantId: tenant.id },
        order: [['month', 'DESC']],
        limit: 12,
      }),
      getTenantCurrentUsage(tenant.id),
    ]);

    return {
      success: true,
      tenant,
      quotas,
      bills,
      currentUsage,
    };
  });

  fastify.post('/api/tenants', {
    onRequest: fastify.authenticateWithPermission('tenant_info', 'write'),
  }, async (request) => {
    const tenant = await Tenant.create(request.body);
    return { success: true, data: tenant };
  });

  fastify.put('/api/tenants/:id', {
    onRequest: fastify.authenticateWithPermission('tenant_info', 'write'),
  }, async (request, reply) => {
    const tenant = await Tenant.findByPk(request.params.id);
    if (!tenant) {
      return reply.status(404).send({ success: false, message: '租户不存在' });
    }

    await tenant.update(request.body);
    return { success: true, data: tenant };
  });

  fastify.post('/api/tenants/:id/toggle-status', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const tenant = await Tenant.findByPk(request.params.id);
    if (!tenant) {
      return reply.status(404).send({ success: false, message: '租户不存在' });
    }

    tenant.status = tenant.status === 'active' ? 'disabled' : 'active';
    await tenant.save();

    return { success: true, data: tenant };
  });

  fastify.get('/api/tenants/:id/quotas', {
    onRequest: fastify.authenticateWithPermission('tenant_info', 'read'),
  }, async (request) => {
    const quotas = await getQuotaUsage(request.params.id, request.query.month);
    return { success: true, data: quotas };
  });

  fastify.post('/api/tenants/:id/quotas', {
    onRequest: fastify.authenticateWithPermission('tenant_info', 'write'),
  }, async (request) => {
    const quota = await Quota.create({
      ...request.body,
      tenantId: request.params.id,
    });
    return { success: true, data: quota };
  });

  fastify.put('/api/tenants/:id/quotas/:quotaId', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const quota = await Quota.findByPk(request.params.quotaId);
    if (!quota) {
      return reply.status(404).send({ success: false, message: '配额不存在' });
    }

    await quota.update(request.body);
    return { success: true, data: quota };
  });
}
