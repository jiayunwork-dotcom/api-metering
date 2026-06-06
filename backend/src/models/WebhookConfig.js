import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const WebhookConfig = sequelize.define('WebhookConfig', {
  id: {
    type: DataTypes.UUID,
    primaryKey: true,
    defaultValue: DataTypes.UUIDV4,
  },
  tenantId: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: 'Webhook名称',
  },
  url: {
    type: DataTypes.STRING(500),
    allowNull: false,
    comment: '回调URL',
  },
  method: {
    type: DataTypes.STRING(10),
    defaultValue: 'POST',
  },
  headers: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: '自定义请求头，如鉴权token',
  },
  timeout: {
    type: DataTypes.INTEGER,
    defaultValue: 5000,
    comment: '超时时间（毫秒）',
  },
  maxRetries: {
    type: DataTypes.INTEGER,
    defaultValue: 3,
    comment: '最大重试次数',
  },
  retryDelays: {
    type: DataTypes.ARRAY(DataTypes.INTEGER),
    defaultValue: [10000, 30000, 60000],
    comment: '重试间隔（毫秒）',
  },
  status: {
    type: DataTypes.ENUM('active', 'disabled'),
    defaultValue: 'active',
  },
  lastSuccessAt: {
    type: DataTypes.DATE,
  },
  lastFailureAt: {
    type: DataTypes.DATE,
  },
  lastError: {
    type: DataTypes.TEXT,
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {},
  },
}, {
  tableName: 'webhook_configs',
  timestamps: true,
  paranoid: true,
  indexes: [
    {
      name: 'idx_webhook_tenant',
      fields: ['tenantId'],
    },
    {
      name: 'idx_webhook_tenant_url',
      fields: ['tenantId', 'url'],
      unique: true,
    },
    {
      name: 'idx_webhook_status',
      fields: ['status'],
    },
  ],
});

export default WebhookConfig;
