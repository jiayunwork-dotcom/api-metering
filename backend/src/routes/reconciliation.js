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
import {
  getAlertConfig,
  updateAlertConfig,
  testWebhook,
  getAlertRecords,
  markAlertRead,
  markAllAlertsRead,
  getUnreadAlertCount,
} from '../services/reconciliationAlertService.js';
import {
  submitApproval,
  processApproval,
  getPendingApprovals,
  getMyApprovals,
  getApprovalDetail,
  getApprovalList,
} from '../services/reconciliationApprovalService.js';

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

  fastify.get('/alert/config', async (request, reply) => {
    try {
      const config = await getAlertConfig();
      return {
        success: true,
        data: config,
      };
    } catch (error) {
      request.log.error('Get alert config failed:', error);
      return reply.status(500).send({
        success: false,
        message: '获取告警配置失败',
        error: error.message,
      });
    }
  });

  fastify.put('/alert/config', async (request, reply) => {
    try {
      const config = await updateAlertConfig(request.body);
      return {
        success: true,
        data: config,
        message: '告警配置已更新',
      };
    } catch (error) {
      request.log.error('Update alert config failed:', error);
      return reply.status(500).send({
        success: false,
        message: '更新告警配置失败',
        error: error.message,
      });
    }
  });

  fastify.post('/alert/webhook-test', async (request, reply) => {
    try {
      const { webhookUrl, headers, timeout } = request.body;
      if (!webhookUrl) {
        return reply.status(400).send({
          success: false,
          message: '请提供WebHook URL',
        });
      }
      const result = await testWebhook(webhookUrl, headers, timeout);
      return {
        success: true,
        data: result,
      };
    } catch (error) {
      request.log.error('Test webhook failed:', error);
      return reply.status(500).send({
        success: false,
        message: '测试WebHook失败',
        error: error.message,
      });
    }
  });

  fastify.get('/alert/records', async (request, reply) => {
    try {
      const { page = 1, pageSize = 20, channel, sendStatus, taskId, read } = request.query;
      const offset = (page - 1) * pageSize;
      
      const result = await getAlertRecords({
        channel,
        sendStatus,
        taskId,
        read: read !== undefined ? (read === 'true' || read === true) : undefined,
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
      request.log.error('Get alert records failed:', error);
      return reply.status(500).send({
        success: false,
        message: '获取告警记录失败',
        error: error.message,
      });
    }
  });

  fastify.get('/alert/unread-count', async (request, reply) => {
    try {
      const count = await getUnreadAlertCount();
      return {
        success: true,
        data: { count },
      };
    } catch (error) {
      request.log.error('Get unread alert count failed:', error);
      return reply.status(500).send({
        success: false,
        message: '获取未读告警数量失败',
        error: error.message,
      });
    }
  });

  fastify.post('/alert/records/:id/read', async (request, reply) => {
    try {
      const { id } = request.params;
      await markAlertRead(id);
      return {
        success: true,
        message: '标记已读成功',
      };
    } catch (error) {
      request.log.error('Mark alert read failed:', error);
      return reply.status(500).send({
        success: false,
        message: '标记已读失败',
        error: error.message,
      });
    }
  });

  fastify.post('/alert/records/read-all', async (request, reply) => {
    try {
      const result = await markAllAlertsRead();
      return {
        success: true,
        data: result,
        message: `已标记 ${result.updated} 条告警为已读`,
      };
    } catch (error) {
      request.log.error('Mark all alerts read failed:', error);
      return reply.status(500).send({
        success: false,
        message: '标记全部已读失败',
        error: error.message,
      });
    }
  });

  fastify.post('/approvals', async (request, reply) => {
    try {
      const { diffId, strategy, reason, manualValue } = request.body;
      const operator = request.user?.username || 'unknown';
      
      if (!diffId) {
        return reply.status(400).send({
          success: false,
          message: '请选择差异记录',
        });
      }
      
      if (!['auto', 'manual', 'ignore', 'migrate'].includes(strategy)) {
        return reply.status(400).send({
          success: false,
          message: '不支持的修正策略',
        });
      }
      
      if (!reason || !reason.trim()) {
        return reply.status(400).send({
          success: false,
          message: '请填写修正原因',
        });
      }
      
      if (strategy === 'manual' && (manualValue === undefined || manualValue === null)) {
        return reply.status(400).send({
          success: false,
          message: '手动修正必须提供修正值',
        });
      }
      
      const approval = await submitApproval(diffId, strategy, operator, {
        reason,
        manualValue,
      });
      
      return {
        success: true,
        data: approval,
        message: approval.approvalLevel === 'auto' 
          ? '金额低于100元，已自动审批通过并执行修正' 
          : '修正申请已提交，等待审批',
      };
    } catch (error) {
      request.log.error('Submit approval failed:', error);
      return reply.status(500).send({
        success: false,
        message: error.message || '提交审批失败',
        error: error.message,
      });
    }
  });

  fastify.post('/approvals/:id/approve', async (request, reply) => {
    try {
      const { id } = request.params;
      const { opinion } = request.body;
      const operator = request.user?.username || 'unknown';
      
      const result = await processApproval(id, operator, 'approve', opinion);
      
      return {
        success: true,
        ...result,
      };
    } catch (error) {
      request.log.error('Approve failed:', error);
      return reply.status(500).send({
        success: false,
        message: error.message || '审批失败',
        error: error.message,
      });
    }
  });

  fastify.post('/approvals/:id/reject', async (request, reply) => {
    try {
      const { id } = request.params;
      const { opinion } = request.body;
      const operator = request.user?.username || 'unknown';
      
      if (!opinion || !opinion.trim()) {
        return reply.status(400).send({
          success: false,
          message: '请填写拒绝原因',
        });
      }
      
      const result = await processApproval(id, operator, 'reject', opinion);
      
      return {
        success: true,
        ...result,
      };
    } catch (error) {
      request.log.error('Reject failed:', error);
      return reply.status(500).send({
        success: false,
        message: error.message || '拒绝失败',
        error: error.message,
      });
    }
  });

  fastify.get('/approvals/pending', async (request, reply) => {
    try {
      const { page = 1, pageSize = 20 } = request.query;
      const offset = (page - 1) * pageSize;
      const userId = request.user?.id;
      
      const result = await getPendingApprovals(userId, {
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
      request.log.error('Get pending approvals failed:', error);
      return reply.status(500).send({
        success: false,
        message: '获取待审批列表失败',
        error: error.message,
      });
    }
  });

  fastify.get('/approvals/my', async (request, reply) => {
    try {
      const { page = 1, pageSize = 20 } = request.query;
      const offset = (page - 1) * pageSize;
      const userId = request.user?.id;
      
      if (!userId) {
        return reply.status(401).send({
          success: false,
          message: '未授权访问',
        });
      }
      
      const result = await getMyApprovals(userId, {
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
      request.log.error('Get my approvals failed:', error);
      return reply.status(500).send({
        success: false,
        message: '获取我的申请列表失败',
        error: error.message,
      });
    }
  });

  fastify.get('/approvals/:id', async (request, reply) => {
    try {
      const { id } = request.params;
      const approval = await getApprovalDetail(id);
      
      if (!approval) {
        return reply.status(404).send({
          success: false,
          message: '审批记录不存在',
        });
      }
      
      return {
        success: true,
        data: approval,
      };
    } catch (error) {
      request.log.error('Get approval detail failed:', error);
      return reply.status(500).send({
        success: false,
        message: '获取审批详情失败',
        error: error.message,
      });
    }
  });

  fastify.get('/approvals', async (request, reply) => {
    try {
      const { page = 1, pageSize = 20, status, approvalLevel, diffId } = request.query;
      const offset = (page - 1) * pageSize;
      
      const result = await getApprovalList({
        status,
        approvalLevel,
        diffId,
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
      request.log.error('Get approval list failed:', error);
      return reply.status(500).send({
        success: false,
        message: '获取审批列表失败',
        error: error.message,
      });
    }
  });
}
