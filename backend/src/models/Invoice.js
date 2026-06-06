import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const Invoice = sequelize.define('Invoice', {
  id: {
    type: DataTypes.UUID,
    primaryKey: true,
    defaultValue: DataTypes.UUIDV4,
  },
  invoiceNo: {
    type: DataTypes.STRING(32),
    allowNull: false,
    unique: true,
    comment: '发票编号，格式：INV-YYYY-000001',
  },
  billId: {
    type: DataTypes.UUID,
    allowNull: false,
    unique: true,
    references: {
      model: 'bills',
      key: 'id',
    },
  },
  tenantId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'tenants',
      key: 'id',
    },
  },
  status: {
    type: DataTypes.ENUM('issued', 'void'),
    defaultValue: 'issued',
    allowNull: false,
  },
  year: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: '发票年份',
  },
  sequenceNo: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: '年度内序号',
  },
  companyName: {
    type: DataTypes.STRING(200),
    allowNull: false,
    comment: '开票抬头',
  },
  taxNumber: {
    type: DataTypes.STRING(50),
    comment: '税号',
  },
  address: {
    type: DataTypes.TEXT,
    comment: '地址',
  },
  totalAmount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    comment: '开票金额',
  },
  taxAmount: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0,
    comment: '税额',
  },
  invoiceDate: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: '开票日期',
  },
  details: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: '发票明细',
  },
  pdfPath: {
    type: DataTypes.STRING(500),
    comment: 'PDF文件路径',
  },
  issuedBy: {
    type: DataTypes.STRING(50),
  },
}, {
  tableName: 'invoices',
  timestamps: true,
  paranoid: true,
  indexes: [
    {
      name: 'idx_invoice_no',
      unique: true,
      fields: ['invoiceNo'],
    },
    {
      name: 'idx_invoice_bill',
      unique: true,
      fields: ['billId'],
    },
    {
      name: 'idx_invoice_tenant',
      fields: ['tenantId'],
    },
    {
      name: 'idx_invoice_year_sequence',
      unique: true,
      fields: ['year', 'sequenceNo'],
    },
  ],
});

export default Invoice;
