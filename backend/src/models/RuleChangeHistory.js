import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const RuleChangeHistory = sequelize.define('RuleChangeHistory', {
  id: {
    type: DataTypes.UUID,
    primaryKey: true,
    defaultValue: DataTypes.UUIDV4,
  },
  ruleId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'metering_rules',
      key: 'id',
    },
  },
  apiInterfaceId: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  dimension: {
    type: DataTypes.ENUM('count', 'data_transfer', 'compute_time'),
    allowNull: false,
  },
  changeType: {
    type: DataTypes.ENUM('create', 'update', 'archive'),
    allowNull: false,
  },
  oldValue: {
    type: DataTypes.JSONB,
    defaultValue: {},
  },
  newValue: {
    type: DataTypes.JSONB,
    defaultValue: {},
  },
  effectiveMonth: {
    type: DataTypes.STRING(7),
    allowNull: false,
  },
  changedBy: {
    type: DataTypes.STRING(50),
  },
  remark: {
    type: DataTypes.TEXT,
  },
}, {
  tableName: 'rule_change_histories',
  timestamps: true,
  indexes: [
    {
      name: 'idx_rule_history_rule',
      fields: ['ruleId'],
    },
    {
      name: 'idx_rule_history_api',
      fields: ['apiInterfaceId'],
    },
    {
      name: 'idx_rule_history_effective_month',
      fields: ['effectiveMonth'],
    },
  ],
});

export default RuleChangeHistory;
