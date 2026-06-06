import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const AlertTriggerHistory = sequelize.define('AlertTriggerHistory', {
  id: {
    type: DataTypes.UUID,
    primaryKey: true,
    defaultValue: DataTypes.UUIDV4,
  },
  tenantId: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  alertRuleId: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  apiInterfaceId: {
    type: DataTypes.UUID,
  },
  triggeredAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  triggerHour: {
    type: DataTypes.STRING(13),
    allowNull: false,
    comment: '触发小时（YYYY-MM-DD-HH）',
  },
  conditionType: {
    type: DataTypes.STRING(50),
    allowNull: false,
  },
  currentValue: {
    type: DataTypes.DECIMAL(20, 6),
    allowNull: false,
  },
  thresholdValue: {
    type: DataTypes.DECIMAL(20, 6),
    allowNull: false,
  },
  unit: {
    type: DataTypes.STRING(20),
  },
  actionType: {
    type: DataTypes.STRING(50),
    allowNull: false,
  },
  actionResult: {
    type: DataTypes.JSONB,
    comment: '动作执行结果',
  },
  notificationStatus: {
    type: DataTypes.JSONB,
    comment: '各通知方式的发送状态',
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {},
  },
}, {
  tableName: 'alert_trigger_histories',
  timestamps: true,
  indexes: [
    {
      name: 'idx_alert_trigger_tenant',
      fields: ['tenantId'],
    },
    {
      name: 'idx_alert_trigger_rule',
      fields: ['alertRuleId'],
    },
    {
      name: 'idx_alert_trigger_tenant_hour',
      fields: ['tenantId', 'alertRuleId', 'triggerHour'],
      unique: true,
    },
    {
      name: 'idx_alert_trigger_time',
      fields: ['triggeredAt'],
    },
  ],
});

export default AlertTriggerHistory;
