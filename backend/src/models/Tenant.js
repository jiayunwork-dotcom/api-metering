import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const Tenant = sequelize.define('Tenant', {
  id: {
    type: DataTypes.UUID,
    primaryKey: true,
    defaultValue: DataTypes.UUIDV4,
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  code: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
  },
  status: {
    type: DataTypes.ENUM('active', 'disabled'),
    defaultValue: 'active',
    allowNull: false,
  },
  contactEmail: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  contactPhone: {
    type: DataTypes.STRING(20),
  },
  contactName: {
    type: DataTypes.STRING(50),
  },
  companyName: {
    type: DataTypes.STRING(200),
  },
  taxNumber: {
    type: DataTypes.STRING(50),
  },
  address: {
    type: DataTypes.TEXT,
  },
  discountRate: {
    type: DataTypes.DECIMAL(5, 4),
    defaultValue: 0,
    comment: '折扣率，0-1之间',
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {},
  },
}, {
  tableName: 'tenants',
  timestamps: true,
  paranoid: true,
  indexes: [
    {
      name: 'idx_tenant_code',
      unique: true,
      fields: ['code'],
    },
    {
      name: 'idx_tenant_status',
      fields: ['status'],
    },
  ],
});

export default Tenant;
