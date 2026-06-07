import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const CircuitBreakerState = sequelize.define('CircuitBreakerState', {
  id: {
    type: DataTypes.UUID,
    primaryKey: true,
    defaultValue: DataTypes.UUIDV4,
  },
  tenantId: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  apiInterfaceId: {
    type: DataTypes.UUID,
    comment: '为空表示全局',
  },
  alertRuleId: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  state: {
    type: DataTypes.ENUM('closed', 'open', 'half_open'),
    defaultValue: 'closed',
    allowNull: false,
    comment: 'closed:正常, open:熔断中, half_open:半开',
  },
  openedAt: {
    type: DataTypes.DATE,
    comment: '熔断开启时间',
  },
  cooldownUntil: {
    type: DataTypes.DATE,
    comment: '冷却期结束时间',
  },
  halfOpenStartedAt: {
    type: DataTypes.DATE,
    comment: '半开状态开始时间',
  },
  halfOpenSuccessCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  halfOpenFailureCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  failureThreshold: {
    type: DataTypes.INTEGER,
    defaultValue: 5,
    comment: '半开状态失败阈值',
  },
  successThreshold: {
    type: DataTypes.INTEGER,
    defaultValue: 10,
    comment: '半开状态成功阈值',
  },
  manuallyClosed: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: '是否手动解除',
  },
  manuallyClosedBy: {
    type: DataTypes.UUID,
  },
  manuallyClosedAt: {
    type: DataTypes.DATE,
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {},
  },
}, {
  tableName: 'circuit_breaker_states',
  timestamps: true,
  indexes: [
    {
      name: 'idx_circuit_breaker_tenant_api',
      fields: ['tenant_id', 'api_interface_id'],
      unique: true,
    },
    {
      name: 'idx_circuit_breaker_state',
      fields: ['state'],
    },
    {
      name: 'idx_circuit_breaker_cooldown',
      fields: ['cooldown_until'],
    },
  ],
});

export default CircuitBreakerState;
