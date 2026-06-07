import {
  ReconciliationApproval,
  ReconciliationDiff,
  ReconciliationTask,
  User,
  MeteringRule,
  Op,
  sequelize,
} from '../models/index.js';
import { resolveDiff } from './diffResolutionService.js';
import { createAuditLog } from './reconciliationService.js';
import { approvalQueue } from '../config/queue.js';
import dayjs from 'dayjs';

const AUTO_APPROVE_THRESHOLD = 100;
const LEVEL1_APPROVE_THRESHOLD = 1000;

export async function generateApprovalNo(date = new Date()) {
  const dateStr = dayjs(date).format('YYYYMMDD');
  const prefix = `APPR-${dateStr}-`;

  const lastApproval = await ReconciliationApproval.findOne({
    where: {
      submissionNo: {
        [Op.like]: `${prefix}%`,
      },
    },
    order: [['submissionNo', 'DESC']],
  });

  let sequence = 1;
  if (lastApproval) {
    const lastSeq = parseInt(lastApproval.submissionNo.split('-').pop(), 10);
    sequence = lastSeq + 1;
  }

  return `${prefix}${String(sequence).padStart(6, '0')}`;
}

export async function calculateDiffAmountMoney(diff) {
  const month = diff.month || dayjs(diff.dateKey).format('YYYY-MM');
  const dimension = diff.dimension;

  const rule = await MeteringRule.findOne({
    where: {
      apiInterfaceId: diff.apiInterfaceId,
      dimension,
      effectiveMonth: month,
      status: 'active',
    },
    order: [['createdAt', 'DESC']],
  });

  if (!rule) {
    return {
      amount: 0,
      unitPrice: 0,
    };
  }

  let unitPrice = Number(rule.unitPrice || 0);
  const diffAmount = Number(diff.diffAmount || 0);

  if (rule.pricingType === 'tiered' && rule.tiers && rule.tiers.length > 0) {
    for (const tier of rule.tiers) {
      if (diffAmount >= tier.start && (tier.end === null || diffAmount < tier.end)) {
        unitPrice = Number(tier.price || 0);
        break;
      }
    }
  }

  return {
    amount: diffAmount * unitPrice,
    unitPrice,
  };
}

export function determineApprovalLevel(diffAmountMoney) {
  const amount = Number(diffAmountMoney);
  if (amount < AUTO_APPROVE_THRESHOLD) {
    return 'auto';
  } else if (amount < LEVEL1_APPROVE_THRESHOLD) {
    return 'level1';
  } else {
    return 'level2';
  }
}

export async function submitApproval(diffId, strategy, operator, options = {}) {
  const diff = await ReconciliationDiff.findByPk(diffId);
  if (!diff) {
    throw new Error(`差异记录 ${diffId} 不存在`);
  }

  if (['resolved', 'ignored', 'processing'].includes(diff.status)) {
    throw new Error('该差异已处理或正在处理中');
  }

  const pendingApproval = await ReconciliationApproval.findOne({
    where: {
      diffId,
      status: {
        [Op.in]: ['pending', 'approving', 'approved'],
      },
    },
  });

  if (pendingApproval) {
    throw new Error('该差异已有审批申请在处理中');
  }

  const user = await User.findOne({
    where: { username: operator },
  });

  if (!user) {
    throw new Error(`用户 ${operator} 不存在`);
  }

  const { amount: diffAmountMoney, unitPrice } = await calculateDiffAmountMoney(diff);
  const approvalLevel = determineApprovalLevel(diffAmountMoney);
  const submissionNo = await generateApprovalNo();

  const approval = await ReconciliationApproval.create({
    diffId,
    submissionNo,
    submitter: operator,
    submitterId: user.id,
    submittedAt: new Date(),
    strategy,
    reason: options.reason,
    manualValue: options.manualValue,
    diffAmount: diff.diffAmount,
    diffAmountMoney,
    unitPrice,
    approvalLevel,
    status: approvalLevel === 'auto' ? 'approved' : 'pending',
  });

  if (approvalLevel === 'auto') {
    console.log(`Auto-approving approval ${submissionNo} for diff ${diffId}, amount: ${diffAmountMoney}`);
    await approval.update({
      status: 'approved',
    });
    await approvalQueue.add({
      approvalId: approval.id,
      operator: 'system',
    });
  } else {
    await approval.update({
      status: 'approving',
    });
  }

  await createAuditLog({
    operationType: 'diff_manual_fix',
    operator,
    taskId: diff.taskId,
    diffId: diff.id,
    reason: `提交修正审批申请: ${submissionNo}, 策略: ${strategy}, 原因: ${options.reason}`,
    metadata: {
      approvalId: approval.id,
      submissionNo,
      approvalLevel,
      diffAmountMoney,
    },
    status: 'success',
  });

  return approval;
}

export async function processApproval(approvalId, operator, action, opinion = '') {
  const approval = await ReconciliationApproval.findByPk(approvalId, {
    include: [
      { model: ReconciliationDiff, include: [ReconciliationTask] },
    ],
  });

  if (!approval) {
    throw new Error('审批记录不存在');
  }

  if (approval.status === 'rejected' || approval.status === 'executed' || approval.status === 'failed') {
    throw new Error('该审批已处理完成，无法重复操作');
  }

  const user = await User.findOne({
    where: { username: operator },
  });

  if (!user) {
    throw new Error(`用户 ${operator} 不存在`);
  }

  if (user.role !== 'admin') {
    throw new Error('只有管理员可以执行审批操作');
  }

  if (user.id === approval.submitterId) {
    throw new Error('审批人不能与提交人是同一个人');
  }

  if (action === 'reject') {
    if (!opinion || !opinion.trim()) {
      throw new Error('拒绝审批必须填写拒绝原因');
    }

    await approval.update({
      status: 'rejected',
      approver1Id: approval.approver1Id || user.id,
      approver1: approval.approver1 || operator,
      approver1Opinion: opinion,
      approver1At: new Date(),
      approver1Status: 'rejected',
    });

    await createAuditLog({
      operationType: 'diff_manual_fix',
      operator,
      taskId: approval.ReconciliationDiff?.taskId,
      diffId: approval.diffId,
      reason: `审批拒绝: ${approval.submissionNo}, 原因: ${opinion}`,
      metadata: {
        approvalId: approval.id,
        submissionNo: approval.submissionNo,
      },
      status: 'success',
    });

    return {
      success: true,
      status: 'rejected',
      message: '已拒绝该审批申请',
    };
  }

  if (action === 'approve') {
    if (approval.approvalLevel === 'level1') {
      if (approval.approver1Id) {
        throw new Error('该审批已完成审批，无法重复操作');
      }

      await approval.update({
        status: 'approved',
        approver1Id: user.id,
        approver1: operator,
        approver1Opinion: opinion || '同意',
        approver1At: new Date(),
        approver1Status: 'approved',
      });

      await approvalQueue.add({
        approvalId: approval.id,
        operator,
      });

      await createAuditLog({
        operationType: 'diff_manual_fix',
        operator,
        taskId: approval.ReconciliationDiff?.taskId,
        diffId: approval.diffId,
        reason: `审批通过: ${approval.submissionNo}, 意见: ${opinion || '同意'}`,
        metadata: {
          approvalId: approval.id,
          submissionNo: approval.submissionNo,
        },
        status: 'success',
      });

      return {
        success: true,
        status: 'approved',
        message: '审批通过，将自动执行修正',
      };
    }

    if (approval.approvalLevel === 'level2') {
      if (!approval.approver1Id) {
        await approval.update({
          approver1Id: user.id,
          approver1: operator,
          approver1Opinion: opinion || '同意',
          approver1At: new Date(),
          approver1Status: 'approved',
        });

        await createAuditLog({
          operationType: 'diff_manual_fix',
          operator,
          taskId: approval.ReconciliationDiff?.taskId,
          diffId: approval.diffId,
          reason: `一级审批通过: ${approval.submissionNo}, 意见: ${opinion || '同意'}`,
          metadata: {
            approvalId: approval.id,
            submissionNo: approval.submissionNo,
          },
          status: 'success',
        });

        return {
          success: true,
          status: 'approving',
          message: '一级审批通过，等待二级审批',
        };
      } else if (approval.approver1Id === user.id) {
        throw new Error('您已完成一级审批，请等待其他管理员进行二级审批');
      } else if (!approval.approver2Id) {
        await approval.update({
          status: 'approved',
          approver2Id: user.id,
          approver2: operator,
          approver2Opinion: opinion || '同意',
          approver2At: new Date(),
          approver2Status: 'approved',
        });

        await approvalQueue.add({
          approvalId: approval.id,
          operator,
        });

        await createAuditLog({
          operationType: 'diff_manual_fix',
          operator,
          taskId: approval.ReconciliationDiff?.taskId,
          diffId: approval.diffId,
          reason: `二级审批通过: ${approval.submissionNo}, 意见: ${opinion || '同意'}`,
          metadata: {
            approvalId: approval.id,
            submissionNo: approval.submissionNo,
          },
          status: 'success',
        });

        return {
          success: true,
          status: 'approved',
          message: '二级审批通过，将自动执行修正',
        };
      } else {
        throw new Error('该审批已完成所有审批步骤');
      }
    }
  }

  throw new Error('无效的审批操作');
}

export async function executeApproval(job) {
  const { approvalId, operator } = job.data;

  const approval = await ReconciliationApproval.findByPk(approvalId, {
    include: [
      { model: ReconciliationDiff },
    ],
  });

  if (!approval) {
    throw new Error(`Approval ${approvalId} not found`);
  }

  if (approval.status !== 'approved') {
    console.log(`Approval ${approvalId} is not approved, status: ${approval.status}`);
    return { success: false, reason: 'Approval not approved' };
  }

  try {
    console.log(`Executing approval ${approval.submissionNo} for diff ${approval.diffId}`);

    const result = await resolveDiff(
      approval.diffId,
      approval.strategy,
      operator || 'system',
      {
        reason: approval.reason,
        manualValue: approval.manualValue,
      }
    );

    await approval.update({
      status: result.success ? 'executed' : 'failed',
      executedAt: new Date(),
      executionResult: result,
      errorMessage: result.success ? null : result.message,
    });

    console.log(`Approval ${approval.submissionNo} executed successfully`);
    return { success: true, result };
  } catch (error) {
    console.error(`Failed to execute approval ${approvalId}:`, error);
    await approval.update({
      status: 'failed',
      executedAt: new Date(),
      errorMessage: error.message,
    });
    throw error;
  }
}

export async function getPendingApprovals(userId, params = {}) {
  const where = {
    status: 'approving',
  };

  if (userId) {
    where[Op.or] = [
      {
        approvalLevel: 'level1',
        approver1Id: null,
      },
      {
        approvalLevel: 'level2',
        [Op.or]: [
          { approver1Id: null },
          {
            approver1Id: { [Op.ne]: userId },
            approver2Id: null,
          },
        ],
      },
    ];
  }

  return await ReconciliationApproval.findAndCountAll({
    where,
    include: [
      {
        model: ReconciliationDiff,
        include: [
          { model: ReconciliationTask, attributes: ['id', 'taskNo'] },
        ],
      },
      { model: User, as: 'submitterUser', attributes: ['id', 'name', 'username'] },
    ],
    order: [['submittedAt', 'DESC']],
    limit: params.limit || 20,
    offset: params.offset || 0,
  });
}

export async function getMyApprovals(userId, params = {}) {
  return await ReconciliationApproval.findAndCountAll({
    where: {
      submitterId: userId,
    },
    include: [
      {
        model: ReconciliationDiff,
        include: [
          { model: ReconciliationTask, attributes: ['id', 'taskNo'] },
        ],
      },
      { model: User, as: 'submitterUser', attributes: ['id', 'name', 'username'] },
      { model: User, as: 'approver1User', attributes: ['id', 'name', 'username'] },
      { model: User, as: 'approver2User', attributes: ['id', 'name', 'username'] },
    ],
    order: [['submittedAt', 'DESC']],
    limit: params.limit || 20,
    offset: params.offset || 0,
  });
}

export async function getApprovalDetail(approvalId) {
  return await ReconciliationApproval.findByPk(approvalId, {
    include: [
      {
        model: ReconciliationDiff,
        include: [
          { model: ReconciliationTask, attributes: ['id', 'taskNo', 'taskType', 'triggeredAt'] },
        ],
      },
      { model: User, as: 'submitterUser', attributes: ['id', 'name', 'username', 'role'] },
      { model: User, as: 'approver1User', attributes: ['id', 'name', 'username', 'role'] },
      { model: User, as: 'approver2User', attributes: ['id', 'name', 'username', 'role'] },
    ],
  });
}

export async function getApprovalList(params = {}) {
  const where = {};
  if (params.status) where.status = params.status;
  if (params.approvalLevel) where.approvalLevel = params.approvalLevel;
  if (params.diffId) where.diffId = params.diffId;
  if (params.submitterId) where.submitterId = params.submitterId;

  return await ReconciliationApproval.findAndCountAll({
    where,
    include: [
      {
        model: ReconciliationDiff,
        include: [
          { model: ReconciliationTask, attributes: ['id', 'taskNo'] },
        ],
      },
      { model: User, as: 'submitterUser', attributes: ['id', 'name', 'username'] },
    ],
    order: [['submittedAt', 'DESC']],
    limit: params.limit || 20,
    offset: params.offset || 0,
  });
}

approvalQueue.process(executeApproval);

export default {
  generateApprovalNo,
  calculateDiffAmountMoney,
  determineApprovalLevel,
  submitApproval,
  processApproval,
  executeApproval,
  getPendingApprovals,
  getMyApprovals,
  getApprovalDetail,
  getApprovalList,
};
