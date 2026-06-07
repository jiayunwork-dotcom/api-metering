import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const ApiKeyAccessLog = sequelize.define('ApiKeyAccessLog', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  apiKeyId: {
    type: DataTypes.UUID,
    comment: '使用的密钥ID，可能为空（如密钥不存在时）',
  },
  tenantId: {
    type: DataTypes.UUID,
    comment: '租户ID',
  },
  keyPrefix: {
    type: DataTypes.STRING(16),
    comment: '密钥前缀',
  },
  accessType: {
    type: DataTypes.ENUM('success', 'denied_invalid_key', 'denied_expired', 'denied_ip', 'denied_permission', 'denied_quota', 'denied_disabled'),
    allowNull: false,
    comment: '访问类型：成功/拒绝原因',
  },
  resource: {
    type: DataTypes.STRING(50),
    comment: '访问的资源',
  },
  action: {
    type: DataTypes.STRING(20),
    comment: '执行的动作',
  },
  ipAddress: {
    type: DataTypes.STRING(45),
    comment: '请求IP地址',
  },
  userAgent: {
    type: DataTypes.STRING(500),
    comment: 'User-Agent',
  },
  requestPath: {
    type: DataTypes.STRING(500),
    comment: '请求路径',
  },
  requestMethod: {
    type: DataTypes.STRING(10),
    comment: '请求方法',
  },
  deniedReason: {
    type: DataTypes.STRING(500),
    comment: '拒绝原因详情',
  },
  timestamp: {
    type: DataTypes.DATE(3),
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {},
  },
}, {
  tableName: 'api_key_access_logs',
  timestamps: false,
  indexes: [
    {
      name: 'idx_access_log_key',
      fields: ['apiKeyId'],
    },
    {
      name: 'idx_access_log_tenant',
      fields: ['tenantId'],
    },
    {
      name: 'idx_access_log_type',
      fields: ['accessType'],
    },
    {
      name: 'idx_access_log_timestamp',
      fields: ['timestamp'],
    },
    {
      name: 'idx_access_log_tenant_timestamp',
      fields: ['tenantId', 'timestamp'],
    },
    {
      name: 'idx_access_log_key_timestamp',
      fields: ['apiKeyId', 'timestamp'],
    },
  ],
});

export default ApiKeyAccessLog;
