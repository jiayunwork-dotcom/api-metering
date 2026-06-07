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

export default {
  RESOURCES,
  ACTIONS,
  PRESET_ROLES,
};
