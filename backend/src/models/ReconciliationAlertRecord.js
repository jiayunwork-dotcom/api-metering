import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const ReconciliationAlertRecord = sequelize.define('ReconciliationAlertRecord', {
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
  diffCount: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: '差异数量',
  },
  alertTime: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    comment: '告警时间',
  },
  channel: {
    type: DataTypes.ENUM('internal', 'webhook'),
    allowNull: false,
    comment: '告警渠道：internal-站内消息, webhook-WebHook回调',
  },
  sendStatus: {
    type: DataTypes.ENUM('success', 'failed', 'retrying'),
    allowNull: false,
    comment: '发送状态：success-成功, failed-失败, retrying-重试中',
  },
  retryCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: '重试次数',
  },
  failedReason: {
    type: DataTypes.TEXT,
    comment: '失败原因',
  },
  lastHttpStatus: {
    type: DataTypes.INTEGER,
    comment: '最后一次HTTP响应码',
  },
  lastHttpResponse: {
    type: DataTypes.TEXT,
    comment: '最后一次HTTP响应体',
  },
  alertContent: {
    type: DataTypes.JSONB,
    comment: '告警内容摘要',
  },
  read: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: '站内消息是否已读',
  },
  readAt: {
    type: DataTypes.DATE,
    comment: '已读时间',
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {},
  },
}, {
  tableName: 'reconciliation_alert_records',
  timestamps: true,
  indexes: [
    {
      name: 'idx_alert_task',
      fields: ['task_id'],
    },
    {
      name: 'idx_alert_channel',
      fields: ['channel'],
    },
    {
      name: 'idx_alert_status',
      fields: ['send_status'],
    },
    {
      name: 'idx_alert_time',
      fields: ['alert_time'],
    },
    {
      name: 'idx_alert_read',
      fields: ['read'],
    },
  ],
});

export default ReconciliationAlertRecord;
