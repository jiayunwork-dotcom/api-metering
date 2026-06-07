import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const Bill = sequelize.define('Bill', {
  id: {
    type: DataTypes.UUID,
    primaryKey: true,
    defaultValue: DataTypes.UUIDV4,
  },
  billNo: {
    type: DataTypes.STRING(32),
    allowNull: false,
    unique: true,
    comment: '账单编号，格式：BILL-YYYYMM-000001',
  },
  tenantId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'tenants',
      key: 'id',
    },
  },
  month: {
    type: DataTypes.STRING(7),
    allowNull: false,
    comment: '账单月份，格式：YYYY-MM',
  },
  status: {
    type: DataTypes.ENUM('draft', 'pending_confirm', 'confirmed', 'paid', 'void'),
    defaultValue: 'draft',
    allowNull: false,
    comment: '账单状态：draft-草稿, pending_confirm-待确认, confirmed-已确认, paid-已支付, void-已作废',
  },
  isZeroBill: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: '是否零账单',
  },
  subtotalAmount: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0,
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
    comment: '套餐包含量抵扣',
  },
  discountAmount: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0,
    comment: '折扣金额',
  },
  taxableAmount: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0,
    comment: '应纳税额',
  },
  taxAmount: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0,
    comment: '税费',
  },
  totalAmount: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0,
    comment: '应付总计',
  },
  taxRate: {
    type: DataTypes.DECIMAL(5, 4),
    defaultValue: 0,
    comment: '税率',
  },
  discountRate: {
    type: DataTypes.DECIMAL(5, 4),
    defaultValue: 0,
    comment: '折扣率',
  },
  remark: {
    type: DataTypes.TEXT,
  },
  confirmedAt: {
    type: DataTypes.DATE,
  },
  confirmedBy: {
    type: DataTypes.STRING(50),
  },
  paidAt: {
    type: DataTypes.DATE,
  },
  emailSent: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: '账单邮件是否已发送',
  },
  emailSentAt: {
    type: DataTypes.DATE,
  },
  hasUnprocessedDeadLetters: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: '是否存在未处理的死信事件',
  },
  generationId: {
    type: DataTypes.STRING(64),
    allowNull: false,
    comment: '生成标识，用于幂等性控制',
  },
}, {
  tableName: 'bills',
  timestamps: true,
  paranoid: true,
  indexes: [
    {
      name: 'idx_bill_no',
      unique: true,
      fields: ['bill_no'],
    },
    {
      name: 'idx_bill_tenant_month',
      unique: true,
      fields: ['tenant_id', 'month'],
    },
    {
      name: 'idx_bill_status',
      fields: ['status'],
    },
    {
      name: 'idx_bill_generation',
      unique: true,
      fields: ['generation_id'],
    },
  ],
});

export default Bill;
