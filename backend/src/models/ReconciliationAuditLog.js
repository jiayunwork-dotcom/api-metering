import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const ReconciliationAuditLog = sequelize.define('ReconciliationAuditLog', {
  id: {
    type: DataTypes.UUID,
    primaryKey: true,
    defaultValue: DataTypes.UUIDV4,
  },
  operationType: {
    type: DataTypes.ENUM(
      'reconciliation_trigger',
      'diff_auto_fix',
      'diff_manual_fix',
      'diff_ignore',
      'diff_migrate',
      'event_replay',
      'event_replay_dryrun'
    ),
    allowNull: false,
    comment: '操作类型',
  },
  operator: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: '操作人',
  },
  operatedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: '操作时间',
  },
  taskId: {
    type: DataTypes.UUID,
    comment: '关联的对账任务ID',
  },
  diffId: {
    type: DataTypes.UUID,
    comment: '关联的差异记录ID',
  },
  beforeValues: {
    type: DataTypes.JSONB,
    comment: '操作前的数据快照',
  },
  afterValues: {
    type: DataTypes.JSONB,
    comment: '操作后的数据快照',
  },
  reason: {
    type: DataTypes.TEXT,
    comment: '操作原因',
  },
  metadata: {
    type: DataTypes.JSONB,
    comment: '其他元数据',
  },
  affectedCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: '受影响的记录数量',
  },
  status: {
    type: DataTypes.ENUM('success', 'failed', 'partial'),
    defaultValue: 'success',
    allowNull: false,
    comment: '操作状态',
  },
  errorMessage: {
    type: DataTypes.TEXT,
    comment: '错误信息',
  },
}, {
  tableName: 'reconciliation_audit_logs',
  timestamps: true,
  indexes: [
    {
      name: 'idx_audit_operation_type',
      fields: ['operationType'],
    },
    {
      name: 'idx_audit_operator',
      fields: ['operator'],
    },
    {
      name: 'idx_audit_operated_at',
      fields: ['operatedAt'],
    },
    {
      name: 'idx_audit_task',
      fields: ['taskId'],
    },
    {
      name: 'idx_audit_diff',
      fields: ['diffId'],
    },
  ],
});

export default ReconciliationAuditLog;
