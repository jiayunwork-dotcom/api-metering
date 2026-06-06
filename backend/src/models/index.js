import sequelize from '../config/database.js';
import Tenant from './Tenant.js';
import ApiInterface from './ApiInterface.js';
import MeteringRule from './MeteringRule.js';
import MeteringEvent from './MeteringEvent.js';
import UsageAggregation from './UsageAggregation.js';
import Quota from './Quota.js';
import Bill from './Bill.js';
import BillItem from './BillItem.js';
import Invoice from './Invoice.js';
import Notification from './Notification.js';
import DeadLetterEvent from './DeadLetterEvent.js';
import RuleChangeHistory from './RuleChangeHistory.js';
import User from './User.js';

Tenant.hasMany(MeteringEvent, { foreignKey: 'tenantId' });
MeteringEvent.belongsTo(Tenant, { foreignKey: 'tenantId' });

Tenant.hasMany(UsageAggregation, { foreignKey: 'tenantId' });
UsageAggregation.belongsTo(Tenant, { foreignKey: 'tenantId' });

Tenant.hasMany(Quota, { foreignKey: 'tenantId' });
Quota.belongsTo(Tenant, { foreignKey: 'tenantId' });

Tenant.hasMany(Bill, { foreignKey: 'tenantId' });
Bill.belongsTo(Tenant, { foreignKey: 'tenantId' });

Tenant.hasMany(Invoice, { foreignKey: 'tenantId' });
Invoice.belongsTo(Tenant, { foreignKey: 'tenantId' });

Tenant.hasMany(Notification, { foreignKey: 'tenantId' });
Notification.belongsTo(Tenant, { foreignKey: 'tenantId' });

ApiInterface.hasMany(MeteringRule, { foreignKey: 'apiInterfaceId' });
MeteringRule.belongsTo(ApiInterface, { foreignKey: 'apiInterfaceId' });

ApiInterface.hasMany(MeteringEvent, { foreignKey: 'apiInterfaceId' });
MeteringEvent.belongsTo(ApiInterface, { foreignKey: 'apiInterfaceId' });

ApiInterface.hasMany(UsageAggregation, { foreignKey: 'apiInterfaceId' });
UsageAggregation.belongsTo(ApiInterface, { foreignKey: 'apiInterfaceId' });

ApiInterface.hasMany(BillItem, { foreignKey: 'apiInterfaceId' });
BillItem.belongsTo(ApiInterface, { foreignKey: 'apiInterfaceId' });

MeteringRule.hasMany(RuleChangeHistory, { foreignKey: 'ruleId' });
RuleChangeHistory.belongsTo(MeteringRule, { foreignKey: 'ruleId' });

Bill.hasMany(BillItem, { foreignKey: 'billId' });
BillItem.belongsTo(Bill, { foreignKey: 'billId' });

Bill.hasOne(Invoice, { foreignKey: 'billId' });
Invoice.belongsTo(Bill, { foreignKey: 'billId' });

export {
  sequelize,
  Tenant,
  ApiInterface,
  MeteringRule,
  MeteringEvent,
  UsageAggregation,
  Quota,
  Bill,
  BillItem,
  Invoice,
  Notification,
  DeadLetterEvent,
  RuleChangeHistory,
  User,
};
