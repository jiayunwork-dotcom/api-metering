import { getUsageData, getTenantCurrentUsage } from '../services/usageAggregationService.js';
import { getEventStats } from '../services/meteringEventService.js';
import { Parser } from 'json2csv';
import { getNotifications, markNotificationRead } from '../services/quotaService.js';

export default async function usageRoutes(fastify) {
  fastify.get('/api/usage/query', { onRequest: [fastify.authenticate] }, async (request) => {
    const { tenantId, apiInterfaceId, granularity = 'day', startDate, endDate, view = 'chart' } = request.query;
    
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    const data = await getUsageData(tenantId, apiInterfaceId, granularity, start, end);

    if (view === 'table') {
      const page = parseInt(request.query.page || 1);
      const pageSize = parseInt(request.query.pageSize || 50);
      const total = data.length;
      const paginatedData = data.slice((page - 1) * pageSize, page * pageSize);

      return {
        success: true,
        data: paginatedData,
        total,
        page,
        pageSize,
      };
    }

    return {
      success: true,
      data,
    };
  });

  fastify.get('/api/usage/export', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { tenantId, apiInterfaceId, granularity = 'day', startDate, endDate } = request.query;
    
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    const data = await getUsageData(tenantId, apiInterfaceId, granularity, start, end);

    const csvData = data.map(item => ({
      '租户ID': item.tenantId,
      '接口ID': item.apiInterfaceId,
      '时间段开始': item.periodStart,
      '时间段结束': item.periodEnd,
      '调用次数': item.callCount,
      '成功次数': item.successCount,
      '请求总大小(字节)': item.totalRequestSize,
      '响应总大小(字节)': item.totalResponseSize,
      '数据传输量(MB)': item.dataTransferMB?.toFixed(6),
      '计算时长(秒)': item.computeSeconds?.toFixed(6),
      '总处理耗时(毫秒)': item.totalDuration,
    }));

    const parser = new Parser();
    const csv = parser.parse(csvData);

    reply.header('Content-Type', 'text/csv; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="usage_${Date.now()}.csv"`);
    
    return '\uFEFF' + csv;
  });

  fastify.get('/api/usage/tenant/:tenantId/current', { onRequest: [fastify.authenticate] }, async (request) => {
    const usage = await getTenantCurrentUsage(request.params.tenantId, request.query.month);
    return { success: true, data: usage };
  });

  fastify.get('/api/notifications', { onRequest: [fastify.authenticate] }, async (request) => {
    const { page = 1, pageSize = 50, type, read, tenantId } = request.query;
    
    const result = await getNotifications(tenantId || null, {
      limit: pageSize,
      offset: (page - 1) * pageSize,
      type,
      read: read !== undefined ? read === 'true' : undefined,
    });

    return {
      success: true,
      data: result.rows,
      total: result.count,
      page: parseInt(page),
      pageSize: parseInt(pageSize),
    };
  });

  fastify.post('/api/notifications/:id/read', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    try {
      const notification = await markNotificationRead(request.params.id);
      return { success: true, data: notification };
    } catch (error) {
      return reply.status(404).send({ success: false, message: error.message });
    }
  });

  fastify.post('/api/notifications/read-all', { onRequest: [fastify.authenticate] }, async (request) => {
    const { Notification } = await import('../models/index.js');
    const { tenantId } = request.body;
    
    const where = { read: false };
    if (tenantId) where.tenantId = tenantId;

    await Notification.update(
      { read: true, readAt: new Date() },
      { where }
    );

    return { success: true, message: '已全部标记为已读' };
  });
}
