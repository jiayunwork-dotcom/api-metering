import sequelize from '../config/database.js';
import { Op, fn, col, literal } from 'sequelize';
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
import AlertRule from './AlertRule.js';
import AlertTriggerHistory from './AlertTriggerHistory.js';
import CircuitBreakerState from './CircuitBreakerState.js';
import WebhookConfig from './WebhookConfig.js';
import ReconciliationTask from './ReconciliationTask.js';
import ReconciliationDiff from './ReconciliationDiff.js';
import ReconciliationAuditLog from './ReconciliationAuditLog.js';

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

Tenant.hasMany(AlertRule, { foreignKey: 'tenantId' });
AlertRule.belongsTo(Tenant, { foreignKey: 'tenantId' });
AlertRule.belongsTo(ApiInterface, { foreignKey: 'apiInterfaceId', as: 'apiInterface' });

Tenant.hasMany(AlertTriggerHistory, { foreignKey: 'tenantId' });
AlertTriggerHistory.belongsTo(Tenant, { foreignKey: 'tenantId' });
AlertTriggerHistory.belongsTo(AlertRule, { foreignKey: 'alertRuleId', as: 'alertRule' });
AlertTriggerHistory.belongsTo(ApiInterface, { foreignKey: 'apiInterfaceId', as: 'apiInterface' });

Tenant.hasMany(CircuitBreakerState, { foreignKey: 'tenantId' });
CircuitBreakerState.belongsTo(Tenant, { foreignKey: 'tenantId' });
CircuitBreakerState.belongsTo(AlertRule, { foreignKey: 'alertRuleId', as: 'alertRule' });
CircuitBreakerState.belongsTo(ApiInterface, { foreignKey: 'apiInterfaceId', as: 'apiInterface' });

Tenant.hasMany(WebhookConfig, { foreignKey: 'tenantId' });
WebhookConfig.belongsTo(Tenant, { foreignKey: 'tenantId' });

ReconciliationTask.hasMany(ReconciliationDiff, { foreignKey: 'taskId' });
ReconciliationDiff.belongsTo(ReconciliationTask, { foreignKey: 'taskId' });

ReconciliationDiff.belongsTo(Tenant, { foreignKey: 'tenantId' });
ReconciliationDiff.belongsTo(ApiInterface, { foreignKey: 'apiInterfaceId' });

ReconciliationAuditLog.belongsTo(ReconciliationTask, { foreignKey: 'taskId' });
ReconciliationAuditLog.belongsTo(ReconciliationDiff, { foreignKey: 'diffId' });

export {
  sequelize,
  Op,
  fn,
  col,
  literal,
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
  AlertRule,
  AlertTriggerHistory,
  CircuitBreakerState,
  WebhookConfig,
  ReconciliationTask,
  ReconciliationDiff,
  ReconciliationAuditLog,
};
