import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const ApiKeyIpWhitelist = sequelize.define('ApiKeyIpWhitelist', {
  id: {
    type: DataTypes.UUID,
    primaryKey: true,
    defaultValue: DataTypes.UUIDV4,
  },
  apiKeyId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'api_keys',
      key: 'id',
    },
  },
  ipOrCidr: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: 'IP地址或CIDR段，如192.168.1.1或192.168.1.0/24',
  },
  ipType: {
    type: DataTypes.ENUM('ipv4', 'ipv6'),
    defaultValue: 'ipv4',
    allowNull: false,
  },
  comment: {
    type: DataTypes.STRING(200),
    comment: '备注',
  },
  createdBy: {
    type: DataTypes.UUID,
    comment: '创建人用户ID',
  },
}, {
  tableName: 'api_key_ip_whitelists',
  timestamps: true,
  indexes: [
    {
      name: 'idx_ip_whitelist_key',
      fields: ['api_key_id'],
    },
    {
      name: 'idx_ip_whitelist_unique',
      unique: true,
      fields: ['api_key_id', 'ip_or_cidr'],
    },
    {
      name: 'idx_ip_whitelist_ip',
      fields: ['ip_or_cidr'],
    },
  ],
});

export default ApiKeyIpWhitelist;
