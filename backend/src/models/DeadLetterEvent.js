import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const DeadLetterEvent = sequelize.define('DeadLetterEvent', {
  id: {
    type: DataTypes.UUID,
    primaryKey: true,
    defaultValue: DataTypes.UUIDV4,
  },
  eventData: {
    type: DataTypes.JSONB,
    allowNull: false,
    comment: '原始事件数据',
  },
  errorMessage: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: '错误信息',
  },
  errorStack: {
    type: DataTypes.TEXT,
  },
  retryCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  status: {
    type: DataTypes.ENUM('pending', 'processing', 'reprocessed', 'failed', 'ignored'),
    defaultValue: 'pending',
  },
  processedAt: {
    type: DataTypes.DATE,
  },
  processedBy: {
    type: DataTypes.STRING(50),
  },
  tenantId: {
    type: DataTypes.UUID,
    comment: '租户ID，用于筛选',
  },
  month: {
    type: DataTypes.STRING(7),
    comment: '归属月份',
  },
}, {
  tableName: 'dead_letter_events',
  timestamps: true,
  indexes: [
    {
      name: 'idx_dead_letter_status',
      fields: ['status'],
    },
    {
      name: 'idx_dead_letter_tenant_month',
      fields: ['tenantId', 'month'],
    },
    {
      name: 'idx_dead_letter_created',
      fields: ['createdAt'],
    },
  ],
});

export default DeadLetterEvent;
