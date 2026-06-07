import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const ReconciliationApproval = sequelize.define('ReconciliationApproval', {
  id: {
    type: DataTypes.UUID,
    primaryKey: true,
    defaultValue: DataTypes.UUIDV4,
  },
  diffId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'reconciliation_diffs',
      key: 'id',
    },
  },
  submissionNo: {
    type: DataTypes.STRING(32),
    allowNull: false,
    unique: true,
    comment: '审批申请编号，格式：APPR-YYYYMMDD-000001',
  },
  submitter: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: '提交人',
  },
  submitterId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id',
    },
  },
  submittedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: '提交时间',
  },
  strategy: {
    type: DataTypes.ENUM('auto', 'manual', 'ignore', 'migrate'),
    allowNull: false,
    comment: '修正策略',
  },
  reason: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: '修正原因',
  },
  manualValue: {
    type: DataTypes.DECIMAL(20, 6),
    comment: '手动输入的修正值',
  },
  diffAmount: {
    type: DataTypes.DECIMAL(20, 6),
    allowNull: false,
    comment: '差异量',
  },
  diffAmountMoney: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    comment: '差异金额（按单价换算）',
  },
  unitPrice: {
    type: DataTypes.DECIMAL(15, 6),
    comment: '单价（元）',
  },
  approvalLevel: {
    type: DataTypes.ENUM('auto', 'level1', 'level2'),
    allowNull: false,
    comment: '审批级别：auto-自动审批, level1-一级审批, level2-二级审批',
  },
  status: {
    type: DataTypes.ENUM('pending', 'approving', 'approved', 'rejected', 'executed', 'failed'),
    defaultValue: 'pending',
    allowNull: false,
    comment: '审批状态：pending-待审批, approving-审批中, approved-已通过, rejected-已拒绝, executed-已执行, failed-执行失败',
  },
  approver1Id: {
    type: DataTypes.UUID,
    references: {
      model: 'users',
      key: 'id',
    },
    comment: '第一位审批人ID',
  },
  approver1: {
    type: DataTypes.STRING(50),
    comment: '第一位审批人',
  },
  approver1Opinion: {
    type: DataTypes.TEXT,
    comment: '第一位审批人意见',
  },
  approver1At: {
    type: DataTypes.DATE,
    comment: '第一位审批时间',
  },
  approver1Status: {
    type: DataTypes.ENUM('approved', 'rejected'),
    comment: '第一位审批结果',
  },
  approver2Id: {
    type: DataTypes.UUID,
    references: {
      model: 'users',
      key: 'id',
    },
    comment: '第二位审批人ID',
  },
  approver2: {
    type: DataTypes.STRING(50),
    comment: '第二位审批人',
  },
  approver2Opinion: {
    type: DataTypes.TEXT,
    comment: '第二位审批人意见',
  },
  approver2At: {
    type: DataTypes.DATE,
    comment: '第二位审批时间',
  },
  approver2Status: {
    type: DataTypes.ENUM('approved', 'rejected'),
    comment: '第二位审批结果',
  },
  executedAt: {
    type: DataTypes.DATE,
    comment: '执行时间',
  },
  executionResult: {
    type: DataTypes.JSONB,
    comment: '执行结果',
  },
  errorMessage: {
    type: DataTypes.TEXT,
    comment: '错误信息',
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {},
  },
}, {
  tableName: 'reconciliation_approvals',
  timestamps: true,
  indexes: [
    {
      name: 'idx_approval_no',
      unique: true,
      fields: ['submission_no'],
    },
    {
      name: 'idx_approval_diff',
      fields: ['diff_id'],
    },
    {
      name: 'idx_approval_submitter',
      fields: ['submitter_id'],
    },
    {
      name: 'idx_approval_status',
      fields: ['status'],
    },
    {
      name: 'idx_approval_level',
      fields: ['approval_level'],
    },
    {
      name: 'idx_approval_submitted',
      fields: ['submitted_at'],
    },
    {
      name: 'idx_approval_approver1',
      fields: ['approver1_id'],
    },
    {
      name: 'idx_approval_approver2',
      fields: ['approver2_id'],
    },
  ],
});

export default ReconciliationApproval;
