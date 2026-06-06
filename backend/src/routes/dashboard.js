import {
  getDashboardStats, getCallTrend, getTopTenants,
  getRevenueTrend, getApiUsageRanking,
} from '../services/dashboardService.js';

export default async function dashboardRoutes(fastify) {
  fastify.get('/api/dashboard/stats', { onRequest: [fastify.authenticate] }, async () => {
    const stats = await getDashboardStats();
    return { success: true, data: stats };
  });

  fastify.get('/api/dashboard/call-trend', { onRequest: [fastify.authenticate] }, async (request) => {
    const { granularity, startDate, endDate } = request.query;
    const data = await getCallTrend(
      granularity,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined
    );
    return { success: true, data };
  });

  fastify.get('/api/dashboard/top-tenants', { onRequest: [fastify.authenticate] }, async (request) => {
    const { limit = 10 } = request.query;
    const data = await getTopTenants(parseInt(limit));
    return { success: true, data };
  });

  fastify.get('/api/dashboard/revenue-trend', { onRequest: [fastify.authenticate] }, async (request) => {
    const { months = 6 } = request.query;
    const data = await getRevenueTrend(parseInt(months));
    return { success: true, data };
  });

  fastify.get('/api/dashboard/api-ranking', { onRequest: [fastify.authenticate] }, async (request) => {
    const { limit = 10 } = request.query;
    const data = await getApiUsageRanking(parseInt(limit));
    return { success: true, data };
  });
}
