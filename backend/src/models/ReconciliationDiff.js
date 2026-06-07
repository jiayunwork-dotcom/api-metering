import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const ReconciliationDiff = sequelize.define('ReconciliationDiff', {
  id: {
    type: DataTypes.UUID,
    primaryKey: true,
    defaultValue: DataTypes.UUIDV4,
  },
  taskId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'reconciliation_tasks',
      key: 'id',
    },
  },
  diffType: {
    type: DataTypes.ENUM('quota_deviation', 'aggregation_deviation', 'event_missing', 'cross_month_misplacement'),
    allowNull: false,
    comment: '差异类型：quota_deviation-配额偏差, aggregation_deviation-聚合偏差, event_missing-事件缺失, cross_month_misplacement-跨月归属错误',
  },
  severity: {
    type: DataTypes.ENUM('critical', 'warning', 'minor'),
    allowNull: false,
    comment: '严重程度：critical-红色, warning-黄色, minor-绿色',
  },
  tenantId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'tenants',
      key: 'id',
    },
  },
  apiInterfaceId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'api_interfaces',
      key: 'id',
    },
  },
  dateKey: {
    type: DataTypes.STRING(10),
    allowNull: false,
    comment: '对账日期，格式：YYYY-MM-DD',
  },
  month: {
    type: DataTypes.STRING(7),
    allowNull: false,
    comment: '归属月份',
  },
  redisQuotaValue: {
    type: DataTypes.DECIMAL(20, 6),
    comment: 'Redis中的配额计数值',
  },
  dbAggregationValue: {
    type: DataTypes.DECIMAL(20, 6),
    comment: 'PostgreSQL聚合表中的值',
  },
  eventSumValue: {
    type: DataTypes.DECIMAL(20, 6),
    comment: '原始事件表sum统计值',
  },
  diffAmount: {
    type: DataTypes.DECIMAL(20, 6),
    allowNull: false,
    comment: '差异量',
  },
  diffPercent: {
    type: DataTypes.DECIMAL(10, 4),
    comment: '差异百分比',
  },
  dimension: {
    type: DataTypes.ENUM('count', 'data_transfer', 'compute_time'),
    allowNull: false,
    comment: '计量维度',
  },
  expectedValue: {
    type: DataTypes.DECIMAL(20, 6),
    comment: '期望值（以原始事件为准）',
  },
  actualValue: {
    type: DataTypes.DECIMAL(20, 6),
    comment: '实际值（聚合/配额中的值）',
  },
  affectedEventCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: '受影响的事件数量',
  },
  eventIds: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    comment: '涉及的事件ID列表（跨月迁移时使用）',
  },
  sourceMonth: {
    type: DataTypes.STRING(7),
    comment: '原归属月份（跨月迁移时使用）',
  },
  targetMonth: {
    type: DataTypes.STRING(7),
    comment: '正确归属月份（跨月迁移时使用）',
  },
  status: {
    type: DataTypes.ENUM('pending', 'processing', 'resolved', 'ignored', 'failed'),
    defaultValue: 'pending',
    allowNull: false,
    comment: '处理状态：pending-待处理, processing-处理中, resolved-已修正, ignored-已忽略, failed-修正失败',
  },
  resolutionStrategy: {
    type: DataTypes.ENUM('auto', 'manual', 'ignore', 'migrate'),
    comment: '修正策略：auto-自动修正, manual-手动确认, ignore-忽略, migrate-跨月迁移',
  },
  resolvedAt: {
    type: DataTypes.DATE,
    comment: '处理时间',
  },
  resolvedBy: {
    type: DataTypes.STRING(50),
    comment: '处理人',
  },
  resolutionReason: {
    type: DataTypes.TEXT,
    comment: '修正原因',
  },
  manualCorrectionValue: {
    type: DataTypes.DECIMAL(20, 6),
    comment: '手动输入的修正值',
  },
  beforeValues: {
    type: DataTypes.JSONB,
    comment: '修正前各数据源值快照',
  },
  afterValues: {
    type: DataTypes.JSONB,
    comment: '修正后各数据源值快照',
  },
  retryCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: '重试次数',
  },
  lastError: {
    type: DataTypes.TEXT,
    comment: '最后一次错误信息',
  },
}, {
  tableName: 'reconciliation_diffs',
  timestamps: true,
  indexes: [
    {
      name: 'idx_recon_diff_task',
      fields: ['taskId'],
    },
    {
      name: 'idx_recon_diff_status',
      fields: ['status'],
    },
    {
      name: 'idx_recon_diff_severity',
      fields: ['severity'],
    },
    {
      name: 'idx_recon_diff_tenant_api_date',
      fields: ['tenantId', 'apiInterfaceId', 'dateKey'],
    },
    {
      name: 'idx_recon_diff_type',
      fields: ['diffType'],
    },
    {
      name: 'idx_recon_diff_month',
      fields: ['month'],
    },
  ],
});

export default ReconciliationDiff;
