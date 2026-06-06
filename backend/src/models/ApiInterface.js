import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const ApiInterface = sequelize.define('ApiInterface', {
  id: {
    type: DataTypes.UUID,
    primaryKey: true,
    defaultValue: DataTypes.UUIDV4,
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  path: {
    type: DataTypes.STRING(200),
    allowNull: false,
  },
  method: {
    type: DataTypes.STRING(10),
    allowNull: false,
    defaultValue: 'POST',
  },
  description: {
    type: DataTypes.TEXT,
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive'),
    defaultValue: 'active',
    allowNull: false,
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {},
  },
}, {
  tableName: 'api_interfaces',
  timestamps: true,
  paranoid: true,
  indexes: [
    {
      name: 'idx_api_path_method',
      unique: true,
      fields: ['path', 'method'],
    },
    {
      name: 'idx_api_status',
      fields: ['status'],
    },
  ],
});

export default ApiInterface;
