import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const RESOURCES = [
  'metering_event',
  'usage_query',
  'billing_view',
  'rule_management',
  'tenant_info',
  'api_key_management',
];

const ACTIONS = ['read', 'write'];

const PRESET_ROLES = {
  full_access: {
    name: '全权限',
    permissions: RESOURCES.flatMap(r => ACTIONS.map(a => `${r}:${a}`)),
  },
  read_only: {
    name: '只读',
    permissions: RESOURCES.map(r => `${r}:read`),
  },
  report_only: {
    name: '仅上报',
    permissions: ['metering_event:write', 'usage_query:read'],
  },
};

const ApiKeyPermission = sequelize.define('ApiKeyPermission', {
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
  resource: {
    type: DataTypes.ENUM(...RESOURCES),
    allowNull: false,
    comment: '资源：metering_event/usage_query/billing_view/rule_management/tenant_info/api_key_management',
  },
  action: {
    type: DataTypes.ENUM(...ACTIONS),
    allowNull: false,
    comment: '动作：read/write',
  },
  createdBy: {
    type: DataTypes.UUID,
    comment: '创建人用户ID',
  },
}, {
  tableName: 'api_key_permissions',
  timestamps: true,
  indexes: [
    {
      name: 'idx_api_key_permission_key',
      fields: ['api_key_id'],
    },
    {
      name: 'idx_api_key_permission_unique',
      unique: true,
      fields: ['api_key_id', 'resource', 'action'],
    },
    {
      name: 'idx_api_key_permission_resource_action',
      fields: ['resource', 'action'],
    },
  ],
});

ApiKeyPermission.RESOURCES = RESOURCES;
ApiKeyPermission.ACTIONS = ACTIONS;
ApiKeyPermission.PRESET_ROLES = PRESET_ROLES;

export default ApiKeyPermission;
