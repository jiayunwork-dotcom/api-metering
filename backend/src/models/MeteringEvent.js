import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const MeteringEvent = sequelize.define('MeteringEvent', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  eventId: {
    type: DataTypes.STRING(64),
    allowNull: false,
    unique: true,
    comment: '事件唯一标识，用于去重：tenantId:apiInterfaceId:timestamp(ms)',
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
  timestamp: {
    type: DataTypes.DATE(3),
    allowNull: false,
    comment: '调用时间（毫秒级精度）',
  },
  month: {
    type: DataTypes.STRING(7),
    allowNull: false,
    comment: '事件归属月份，格式：YYYY-MM',
  },
  statusCode: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: '响应状态码',
  },
  requestSize: {
    type: DataTypes.BIGINT,
    defaultValue: 0,
    comment: '请求体大小（字节）',
  },
  responseSize: {
    type: DataTypes.BIGINT,
    defaultValue: 0,
    comment: '响应体大小（字节）',
  },
  duration: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: '服务端处理耗时（毫秒）',
  },
  isSuccess: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    comment: '是否成功调用（状态码2xx）',
  },
}, {
  tableName: 'metering_events',
  timestamps: false,
  indexes: [
    {
      name: 'idx_event_unique',
      unique: true,
      fields: ['eventId'],
    },
    {
      name: 'idx_event_tenant_api_month',
      fields: ['tenantId', 'apiInterfaceId', 'month'],
    },
    {
      name: 'idx_event_timestamp',
      fields: ['timestamp'],
    },
    {
      name: 'idx_event_tenant_month',
      fields: ['tenantId', 'month'],
    },
  ],
});

export default MeteringEvent;
