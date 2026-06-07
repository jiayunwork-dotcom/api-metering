import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const MeteringRule = sequelize.define('MeteringRule', {
  id: {
    type: DataTypes.UUID,
    primaryKey: true,
    defaultValue: DataTypes.UUIDV4,
  },
  apiInterfaceId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'api_interfaces',
      key: 'id',
    },
  },
  dimension: {
    type: DataTypes.ENUM('count', 'data_transfer', 'compute_time'),
    allowNull: false,
    comment: '计费维度：count-按调用次数, data_transfer-按数据传输量, compute_time-按计算时长',
  },
  unit: {
    type: DataTypes.STRING(20),
    allowNull: false,
    comment: '计量单位：次, MB, 秒',
  },
  pricingType: {
    type: DataTypes.ENUM('fixed', 'tiered'),
    defaultValue: 'fixed',
    allowNull: false,
    comment: '定价类型：fixed-固定单价, tiered-阶梯定价',
  },
  unitPrice: {
    type: DataTypes.DECIMAL(15, 6),
    comment: '固定单价（元）',
  },
  tiers: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: '阶梯定价配置，格式：[{start: 0, end: 10000, price: 0.01}, ...]',
  },
  effectiveMonth: {
    type: DataTypes.STRING(7),
    allowNull: false,
    comment: '生效月份，格式：YYYY-MM',
  },
  status: {
    type: DataTypes.ENUM('draft', 'active', 'archived'),
    defaultValue: 'draft',
    allowNull: false,
  },
  createdBy: {
    type: DataTypes.STRING(50),
  },
  version: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
    allowNull: false,
  },
}, {
  tableName: 'metering_rules',
  timestamps: true,
  paranoid: true,
  indexes: [
    {
      name: 'idx_rule_api_dimension_month',
      unique: true,
      fields: ['api_interface_id', 'dimension', 'effective_month'],
    },
    {
      name: 'idx_rule_status',
      fields: ['status'],
    },
    {
      name: 'idx_rule_effective_month',
      fields: ['effective_month'],
    },
  ],
});

export default MeteringRule;
