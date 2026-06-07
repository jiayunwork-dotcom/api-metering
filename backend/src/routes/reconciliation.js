import {
  getTaskList,
  getTaskDetail,
  getDiffList,
  getDiffDetail,
  getAuditLogs,
  createReconciliationTask,
} from '../services/reconciliationService.js';
import { resolveDiff, batchResolveDiffs } from '../services/diffResolutionService.js';
import { getDeadLetterEvents, replayEvents, getReplayProgress } from '../services/eventReplayService.js';

export default async function reconciliationRoutes(fastify, options) {
  fastify.addHook('preHandler', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.status(401).send({ success: false, message: '未授权访问' });
    }
  });

  fastify.get('/tasks', async (request, reply) => {
    try {
      const { page = 1, pageSize = 20, status, taskType } = request.query;
      const offset = (page - 1) * pageSize;
      
      const result = await getTaskList({
        status,
        taskType,
        limit: pageSize,
        offset,
      });
      
      return {
        success: true,
        data: result.rows,
        total: result.count,
        page,
        pageSize,
      };
    } catch (error) {
      request.log.error('Get task list failed:', error);
      return reply.status(500).send({
        success: false,
        message: '获取任务列表失败',
        error: error.message,
      });
    }
  });

  fastify.get('/tasks/:id', async (request, reply) => {
    try {
      const { id } = request.params;
      const task = await getTaskDetail(id);
      
      if (!task) {
        return reply.status(404).send({
          success: false,
          message: '任务不存在',
        });
      }
      
      return {
        success: true,
        data: task,
      };
    } catch (error) {
      request.log.error('Get task detail failed:', error);
      return reply.status(500).send({
        success: false,
        message: '获取任务详情失败',
        error: error.message,
      });
    }
  });

  fastify.post('/tasks', async (request, reply) => {
    try {
      const { startDate, endDate, tenantIds, taskType = 'manual' } = request.body;
      const operator = request.user?.username || 'unknown';
      
      if (!startDate || !endDate) {
        return reply.status(400).send({
          success: false,
          message: '请选择对账日期范围',
        });
      }
      
      const task = await createReconciliationTask({
        taskType,
        startDate,
        endDate,
        tenantIds,
        triggeredBy: operator,
      });
      
      return {
        success: true,
        data: task,
        message: '对账任务已提交，正在执行中',
      };
    } catch (error) {
      request.log.error('Create reconciliation task failed:', error);
      return reply.status(500).send({
        success: false,
        message: '创建对账任务失败',
        error: error.message,
      });
    }
  });

  fastify.get('/diffs', async (request, reply) => {
    try {
      const {
        page = 1,
        pageSize = 20,
        status,
        severity,
        diffType,
        tenantId,
        taskId,
      } = request.query;
      
      const offset = (page - 1) * pageSize;
      
      const result = await getDiffList({
        status,
        severity,
        diffType,
        tenantId,
        taskId,
        limit: pageSize,
        offset,
      });
      
      return {
        success: true,
        data: result.rows,
        total: result.count,
        page,
        pageSize,
      };
    } catch (error) {
      request.log.error('Get diff list failed:', error);
      return reply.status(500).send({
        success: false,
        message: '获取差异列表失败',
        error: error.message,
      });
    }
  });

  fastify.get('/diffs/:id', async (request, reply) => {
    try {
      const { id } = request.params;
      const diff = await getDiffDetail(id);
      
      if (!diff) {
        return reply.status(404).send({
          success: false,
          message: '差异记录不存在',
        });
      }
      
      return {
        success: true,
        data: diff,
      };
    } catch (error) {
      request.log.error('Get diff detail failed:', error);
      return reply.status(500).send({
        success: false,
        message: '获取差异详情失败',
        error: error.message,
      });
    }
  });

  fastify.post('/diffs/:id/resolve', async (request, reply) => {
    try {
      const { id } = request.params;
      const { strategy, reason, manualValue } = request.body;
      const operator = request.user?.username || 'unknown';
      
      if (!['auto', 'manual', 'ignore', 'migrate'].includes(strategy)) {
        return reply.status(400).send({
          success: false,
          message: '不支持的修正策略',
        });
      }
      
      if (strategy === 'manual' && (manualValue === undefined || manualValue === null)) {
        return reply.status(400).send({
          success: false,
          message: '手动修正必须提供修正值',
        });
      }
      
      const result = await resolveDiff(id, strategy, operator, {
        reason,
        manualValue,
      });
      
      return {
        success: true,
        data: result,
        message: result.message || '操作成功',
      };
    } catch (error) {
      request.log.error('Resolve diff failed:', error);
      return reply.status(500).send({
        success: false,
        message: '修正差异失败',
        error: error.message,
      });
    }
  });

  fastify.post('/diffs/batch-resolve', async (request, reply) => {
    try {
      const { diffIds, strategy, reason, manualValue } = request.body;
      const operator = request.user?.username || 'unknown';
      
      if (!diffIds || !Array.isArray(diffIds) || diffIds.length === 0) {
        return reply.status(400).send({
          success: false,
          message: '请选择要处理的差异记录',
        });
      }
      
      if (!['auto', 'manual', 'ignore', 'migrate'].includes(strategy)) {
        return reply.status(400).send({
          success: false,
          message: '不支持的修正策略',
        });
      }
      
      if (strategy === 'manual' && (manualValue === undefined || manualValue === null)) {
        return reply.status(400).send({
          success: false,
          message: '手动修正必须提供修正值',
        });
      }
      
      const result = await batchResolveDiffs(diffIds, strategy, operator, {
        reason,
        manualValue,
      });
      
      return {
        success: true,
        data: result,
        message: `批量处理完成：成功 ${result.successCount} 条，失败 ${result.failedCount} 条`,
      };
    } catch (error) {
      request.log.error('Batch resolve diffs failed:', error);
      return reply.status(500).send({
        success: false,
        message: '批量修正差异失败',
        error: error.message,
      });
    }
  });

  fastify.get('/dead-letters', async (request, reply) => {
    try {
      const {
        page = 1,
        pageSize = 50,
        status,
        tenantId,
        month,
      } = request.query;
      
      const offset = (page - 1) * pageSize;
      
      const result = await getDeadLetterEvents({
        status,
        tenantId,
        month,
        limit: pageSize,
        offset,
      });
      
      return {
        success: true,
        data: result.rows,
        total: result.count,
        page,
        pageSize,
      };
    } catch (error) {
      request.log.error('Get dead letter events failed:', error);
      return reply.status(500).send({
        success: false,
        message: '获取死信事件列表失败',
        error: error.message,
      });
    }
  });

  fastify.post('/dead-letters/replay', async (request, reply) => {
    try {
      const { deadLetterIds, dryRun = false, triggerReconciliation = true } = request.body;
      const operator = request.user?.username || 'unknown';
      
      if (!deadLetterIds || !Array.isArray(deadLetterIds) || deadLetterIds.length === 0) {
        return reply.status(400).send({
          success: false,
          message: '请选择要重放的事件',
        });
      }
      
      const result = await replayEvents(deadLetterIds, operator, {
        dryRun,
        triggerReconciliation,
      });
      
      return {
        success: true,
        data: result,
        message: result.message || (dryRun ? 'Dry-run执行完成' : '重放任务已提交'),
      };
    } catch (error) {
      request.log.error('Replay events failed:', error);
      return reply.status(500).send({
        success: false,
        message: '重放事件失败',
        error: error.message,
      });
    }
  });

  fastify.get('/replay/progress/:jobId', async (request, reply) => {
    try {
      const { jobId } = request.params;
      const progress = getReplayProgress(jobId);
      
      if (!progress) {
        return reply.status(404).send({
          success: false,
          message: '重放任务不存在或已完成',
        });
      }
      
      return {
        success: true,
        data: progress,
      };
    } catch (error) {
      request.log.error('Get replay progress failed:', error);
      return reply.status(500).send({
        success: false,
        message: '获取重放进度失败',
        error: error.message,
      });
    }
  });

  fastify.get('/audit-logs', async (request, reply) => {
    try {
      const {
        page = 1,
        pageSize = 50,
        operator,
        operationType,
        startDate,
        endDate,
      } = request.query;
      
      const offset = (page - 1) * pageSize;
      
      const result = await getAuditLogs({
        operator,
        operationType,
        startDate,
        endDate,
        limit: pageSize,
        offset,
      });
      
      return {
        success: true,
        data: result.rows,
        total: result.count,
        page,
        pageSize,
      };
    } catch (error) {
      request.log.error('Get audit logs failed:', error);
      return reply.status(500).send({
        success: false,
        message: '获取审计日志失败',
        error: error.message,
      });
    }
  });
}
