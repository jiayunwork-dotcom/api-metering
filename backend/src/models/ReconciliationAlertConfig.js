import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const ReconciliationAlertConfig = sequelize.define('ReconciliationAlertConfig', {
  id: {
    type: DataTypes.UUID,
    primaryKey: true,
    defaultValue: DataTypes.UUIDV4,
  },
  enabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    comment: '是否启用告警',
  },
  diffThreshold: {
    type: DataTypes.INTEGER,
    defaultValue: 5,
    allowNull: false,
    comment: '告警阈值，差异数量超过此值触发告警',
  },
  notificationMethods: {
    type: DataTypes.ARRAY(DataTypes.ENUM('internal', 'webhook')),
    allowNull: false,
    defaultValue: ['internal'],
    comment: '通知方式：internal-站内消息, webhook-WebHook回调',
  },
  webhookUrl: {
    type: DataTypes.STRING(500),
    comment: 'WebHook回调URL',
  },
  webhookHeaders: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'WebHook自定义请求头',
  },
  webhookTimeout: {
    type: DataTypes.INTEGER,
    defaultValue: 5000,
    comment: 'WebHook超时时间（毫秒）',
  },
  webhookMaxRetries: {
    type: DataTypes.INTEGER,
    defaultValue: 3,
    comment: 'WebHook最大重试次数',
  },
  webhookRetryDelays: {
    type: DataTypes.ARRAY(DataTypes.INTEGER),
    defaultValue: [30000, 60000, 120000],
    comment: 'WebHook重试间隔（毫秒）',
  },
  lastTestedAt: {
    type: DataTypes.DATE,
    comment: '最后测试时间',
  },
  lastTestResult: {
    type: DataTypes.JSONB,
    comment: '最后测试结果',
  },
}, {
  tableName: 'reconciliation_alert_configs',
  timestamps: true,
  paranoid: true,
});

export default ReconciliationAlertConfig;
