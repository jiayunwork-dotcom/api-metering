import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const BillItem = sequelize.define('BillItem', {
  id: {
    type: DataTypes.UUID,
    primaryKey: true,
    defaultValue: DataTypes.UUIDV4,
  },
  billId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'bills',
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
  dimension: {
    type: DataTypes.ENUM('count', 'data_transfer', 'compute_time'),
    allowNull: false,
  },
  usageAmount: {
    type: DataTypes.DECIMAL(15, 6),
    allowNull: false,
    comment: '用量',
  },
  unit: {
    type: DataTypes.STRING(20),
    allowNull: false,
  },
  unitPrice: {
    type: DataTypes.DECIMAL(15, 6),
    allowNull: false,
    comment: '单价',
  },
  pricingType: {
    type: DataTypes.ENUM('fixed', 'tiered'),
    defaultValue: 'fixed',
  },
  tierDetails: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: '阶梯定价明细',
  },
  subtotal: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    comment: '小计金额',
  },
  freeDeduction: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0,
    comment: '免费额度抵扣',
  },
  packageDeduction: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0,
    comment: '套餐抵扣',
  },
  finalAmount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    comment: '最终金额',
  },
}, {
  tableName: 'bill_items',
  timestamps: true,
  indexes: [
    {
      name: 'idx_bill_item_bill',
      fields: ['bill_id'],
    },
    {
      name: 'idx_bill_item_api',
      fields: ['api_interface_id'],
    },
  ],
});

export default BillItem;
