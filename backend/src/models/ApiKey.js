import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const ApiKey = sequelize.define('ApiKey', {
  id: {
    type: DataTypes.UUID,
    primaryKey: true,
    defaultValue: DataTypes.UUIDV4,
  },
  tenantId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'tenants',
      key: 'id',
    },
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: '密钥名称/备注',
  },
  keyPrefix: {
    type: DataTypes.STRING(16),
    allowNull: false,
    comment: '密钥前缀，用于显示，如sk_live_xxxx前8位',
  },
  keyHash: {
    type: DataTypes.STRING(128),
    allowNull: false,
    unique: true,
    comment: '密钥哈希值，用于验证',
  },
  status: {
    type: DataTypes.ENUM('active', 'disabled', 'expired', 'deleted'),
    defaultValue: 'active',
    allowNull: false,
    comment: '状态：启用/禁用/已过期/已删除',
  },
  expiresAt: {
    type: DataTypes.DATE,
    comment: '过期时间，null表示永不过期',
  },
  lastUsedAt: {
    type: DataTypes.DATE,
    comment: '最后使用时间',
  },
  rotationGracePeriod: {
    type: DataTypes.INTEGER,
    comment: '轮换宽限期（小时），1-72',
  },
  rotationExpiresAt: {
    type: DataTypes.DATE,
    comment: '轮换宽限期结束时间',
  },
  replacedByKeyId: {
    type: DataTypes.UUID,
    comment: '替换此密钥的新密钥ID',
  },
  quotaLimit: {
    type: DataTypes.BIGINT,
    comment: '密钥独立配额，null表示共享租户配额',
  },
  quotaUsed: {
    type: DataTypes.BIGINT,
    defaultValue: 0,
    comment: '密钥已使用配额',
  },
  quotaUnit: {
    type: DataTypes.STRING(20),
    comment: '配额单位：calls/data_mb/compute_seconds',
  },
  ipWhitelistEnabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    comment: '是否启用IP白名单',
  },
  createdBy: {
    type: DataTypes.UUID,
    comment: '创建人用户ID',
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {},
  },
}, {
  tableName: 'api_keys',
  timestamps: true,
  paranoid: true,
  indexes: [
    {
      name: 'idx_api_key_tenant',
      fields: ['tenant_id'],
    },
    {
      name: 'idx_api_key_hash',
      unique: true,
      fields: ['key_hash'],
    },
    {
      name: 'idx_api_key_status',
      fields: ['status'],
    },
    {
      name: 'idx_api_key_expires',
      fields: ['expires_at'],
    },
    {
      name: 'idx_api_key_rotation_expires',
      fields: ['rotation_expires_at'],
    },
    {
      name: 'idx_api_key_tenant_status',
      fields: ['tenant_id', 'status'],
    },
  ],
});

export default ApiKey;
