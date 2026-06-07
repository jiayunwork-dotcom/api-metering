import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const Notification = sequelize.define('Notification', {
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
  type: {
    type: DataTypes.ENUM('quota_80', 'quota_90', 'quota_95', 'quota_100', 'bill_ready', 'system'),
    allowNull: false,
  },
  title: {
    type: DataTypes.STRING(200),
    allowNull: false,
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  level: {
    type: DataTypes.ENUM('info', 'warning', 'error', 'critical'),
    defaultValue: 'info',
  },
  read: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  readAt: {
    type: DataTypes.DATE,
  },
  emailSent: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  emailSentAt: {
    type: DataTypes.DATE,
  },
  emailRetryCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  emailLastError: {
    type: DataTypes.TEXT,
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {},
  },
}, {
  tableName: 'notifications',
  timestamps: true,
  indexes: [
    {
      name: 'idx_notification_tenant',
      fields: ['tenant_id'],
    },
    {
      name: 'idx_notification_type',
      fields: ['type'],
    },
    {
      name: 'idx_notification_read',
      fields: ['read'],
    },
    {
      name: 'idx_notification_email_pending',
      fields: ['email_sent', 'email_retry_count'],
    },
  ],
});

export default Notification;
