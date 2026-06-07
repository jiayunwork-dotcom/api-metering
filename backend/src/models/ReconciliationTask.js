import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const ReconciliationTask = sequelize.define('ReconciliationTask', {
  id: {
    type: DataTypes.UUID,
    primaryKey: true,
    defaultValue: DataTypes.UUIDV4,
  },
  taskNo: {
    type: DataTypes.STRING(32),
    allowNull: false,
    unique: true,
    comment: '任务编号，格式：RECON-YYYYMMDD-000001',
  },
  taskType: {
    type: DataTypes.ENUM('auto', 'manual', 'partial'),
    allowNull: false,
    comment: '任务类型：auto-自动全量, manual-手动全量, partial-局部对账',
  },
  status: {
    type: DataTypes.ENUM('pending', 'running', 'completed', 'failed'),
    defaultValue: 'pending',
    allowNull: false,
    comment: '任务状态',
  },
  startDate: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: '对账开始日期',
  },
  endDate: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: '对账结束日期',
  },
  tenantIds: {
    type: DataTypes.ARRAY(DataTypes.UUID),
    comment: '指定租户ID列表，为空表示全部租户',
  },
  triggeredBy: {
    type: DataTypes.STRING(50),
    comment: '触发人',
  },
  triggeredAt: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: '触发时间',
  },
  startedAt: {
    type: DataTypes.DATE,
    comment: '开始执行时间',
  },
  completedAt: {
    type: DataTypes.DATE,
    comment: '完成时间',
  },
  durationMs: {
    type: DataTypes.BIGINT,
    comment: '执行耗时（毫秒）',
  },
  totalChecked: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: '检查的维度总数',
  },
  diffCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: '发现的差异数量',
  },
  quotaDiffCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: '配额偏差数量',
  },
  aggregationDiffCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: '聚合偏差数量',
  },
  eventMissingCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: '事件缺失数量',
  },
  errorMessage: {
    type: DataTypes.TEXT,
    comment: '错误信息',
  },
  progress: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: '执行进度百分比 0-100',
  },
  consistencyStats: {
    type: DataTypes.JSONB,
    comment: '各维度一致性统计数据',
  },
}, {
  tableName: 'reconciliation_tasks',
  timestamps: true,
  indexes: [
    {
      name: 'idx_recon_task_no',
      unique: true,
      fields: ['task_no'],
    },
    {
      name: 'idx_recon_status',
      fields: ['status'],
    },
    {
      name: 'idx_recon_triggered_at',
      fields: ['triggered_at'],
    },
    {
      name: 'idx_recon_date_range',
      fields: ['start_date', 'end_date'],
    },
  ],
});

export default ReconciliationTask;
