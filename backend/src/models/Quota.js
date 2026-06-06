import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const Quota = sequelize.define('Quota', {
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
  apiInterfaceId: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'api_interfaces',
      key: 'id',
    },
    comment: '为空表示全局配额',
  },
  type: {
    type: DataTypes.ENUM('free', 'package', 'hard_limit'),
    allowNull: false,
    comment: '配额类型：free-免费额度, package-套餐包含量, hard_limit-硬限制',
  },
  dimension: {
    type: DataTypes.ENUM('count', 'data_transfer', 'compute_time'),
    allowNull: false,
    comment: '计费维度',
  },
  limitAmount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    comment: '配额总量',
  },
  month: {
    type: DataTypes.STRING(7),
    allowNull: false,
    comment: '生效月份',
  },
  unit: {
    type: DataTypes.STRING(20),
    allowNull: false,
  },
  notifiedLevels: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: '已通知的阈值等级：80%, 90%, 95%, 100%',
  },
}, {
  tableName: 'quotas',
  timestamps: true,
  paranoid: true,
  indexes: [
    {
      name: 'idx_quota_tenant_api_type_dimension_month',
      unique: true,
      fields: ['tenantId', 'apiInterfaceId', 'type', 'dimension', 'month'],
    },
    {
      name: 'idx_quota_tenant_month',
      fields: ['tenantId', 'month'],
    },
  ],
});

export default Quota;
