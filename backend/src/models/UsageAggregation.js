import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const UsageAggregation = sequelize.define('UsageAggregation', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
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
    allowNull: false,
    references: {
      model: 'api_interfaces',
      key: 'id',
    },
  },
  granularity: {
    type: DataTypes.ENUM('minute', 'hour', 'day'),
    allowNull: false,
    comment: '聚合粒度：minute-分钟级, hour-小时级, day-日级',
  },
  periodStart: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: '时间段开始时间',
  },
  periodEnd: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: '时间段结束时间',
  },
  month: {
    type: DataTypes.STRING(7),
    allowNull: false,
    comment: '归属月份，格式：YYYY-MM',
  },
  callCount: {
    type: DataTypes.BIGINT,
    defaultValue: 0,
    comment: '调用次数',
  },
  successCount: {
    type: DataTypes.BIGINT,
    defaultValue: 0,
    comment: '成功调用次数',
  },
  totalRequestSize: {
    type: DataTypes.BIGINT,
    defaultValue: 0,
    comment: '总请求体大小（字节）',
  },
  totalResponseSize: {
    type: DataTypes.BIGINT,
    defaultValue: 0,
    comment: '总响应体大小（字节）',
  },
  totalDuration: {
    type: DataTypes.BIGINT,
    defaultValue: 0,
    comment: '总处理耗时（毫秒）',
  },
  dataTransferMB: {
    type: DataTypes.DECIMAL(15, 6),
    defaultValue: 0,
    comment: '数据传输量（MB）',
  },
  computeSeconds: {
    type: DataTypes.DECIMAL(15, 6),
    defaultValue: 0,
    comment: '计算时长（秒）',
  },
  version: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
    allowNull: false,
  },
}, {
  tableName: 'usage_aggregations',
  timestamps: true,
  indexes: [
    {
      name: 'idx_usage_tenant_api_granularity_period',
      unique: true,
      fields: ['tenant_id', 'api_interface_id', 'granularity', 'period_start'],
    },
    {
      name: 'idx_usage_tenant_month',
      fields: ['tenant_id', 'month'],
    },
    {
      name: 'idx_usage_granularity_period',
      fields: ['granularity', 'period_start'],
    },
  ],
});

export default UsageAggregation;
