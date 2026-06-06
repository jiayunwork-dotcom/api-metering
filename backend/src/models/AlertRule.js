import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const AlertRule = sequelize.define('AlertRule', {
  id: {
    type: DataTypes.UUID,
    primaryKey: true,
    defaultValue: DataTypes.UUIDV4,
  },
  tenantId: {
    type: DataTypes.UUID,
    allowNull: false,
    comment: '租户ID',
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: '规则名称',
  },
  description: {
    type: DataTypes.STRING(500),
    comment: '规则描述',
  },
  priority: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
    allowNull: false,
    comment: '优先级，数字越大优先级越高',
  },
  conditionType: {
    type: DataTypes.ENUM('daily_call_count', 'hourly_data_volume', 'monthly_cost', 'custom'),
    allowNull: false,
    comment: '触发条件类型',
  },
  conditionConfig: {
    type: DataTypes.JSONB,
    allowNull: false,
    comment: '条件配置，如 { threshold: 1000, unit: "次" }',
  },
  notificationMethods: {
    type: DataTypes.ARRAY(DataTypes.ENUM('internal', 'email', 'webhook')),
    allowNull: false,
    defaultValue: ['internal'],
    comment: '通知方式',
  },
  actionType: {
    type: DataTypes.ENUM('notify_only', 'rate_limit', 'circuit_break'),
    allowNull: false,
    defaultValue: 'notify_only',
    comment: '执行动作类型',
  },
  actionConfig: {
    type: DataTypes.JSONB,
    comment: '动作配置，如限速时的 { qps: 10, burst: 20 }',
  },
  apiInterfaceId: {
    type: DataTypes.UUID,
    comment: '适用的API接口ID，为空表示全局',
  },
  cooldownPeriod: {
    type: DataTypes.INTEGER,
    defaultValue: 30,
    comment: '熔断冷却期（分钟）',
  },
  status: {
    type: DataTypes.ENUM('active', 'disabled'),
    defaultValue: 'active',
    allowNull: false,
  },
  lastTriggeredAt: {
    type: DataTypes.DATE,
    comment: '最近触发时间',
  },
  lastTriggeredHour: {
    type: DataTypes.STRING(13),
    comment: '最近触发的小时（YYYY-MM-DD-HH），用于防抖动',
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {},
  },
}, {
  tableName: 'alert_rules',
  timestamps: true,
  paranoid: true,
  indexes: [
    {
      name: 'idx_alert_rule_tenant',
      fields: ['tenantId'],
    },
    {
      name: 'idx_alert_rule_tenant_priority',
      fields: ['tenantId', 'priority'],
    },
    {
      name: 'idx_alert_rule_status',
      fields: ['status'],
    },
  ],
});

export default AlertRule;
