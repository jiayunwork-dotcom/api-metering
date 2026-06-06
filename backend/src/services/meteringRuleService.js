import { MeteringRule, ApiInterface, RuleChangeHistory } from '../models/index.js';
import { getMonthKey } from '../utils/dateUtils.js';
import { Op, Transaction } from 'sequelize';
import sequelize from '../config/database.js';

export function validateTiers(tiers) {
  if (!Array.isArray(tiers) || tiers.length === 0) {
    return { valid: false, error: '阶梯定价必须包含至少一个阶梯' };
  }

  if (tiers.length > 10) {
    return { valid: false, error: '阶梯数最多10级' };
  }

  const sorted = [...tiers].sort((a, b) => a.start - b.start);

  if (sorted[0].start !== 0) {
    return { valid: false, error: '第一个阶梯必须从0开始' };
  }

  for (let i = 0; i < sorted.length; i++) {
    const tier = sorted[i];
    if (tier.start === undefined || tier.end === undefined || tier.price === undefined) {
      return { valid: false, error: '每个阶梯必须包含start、end、price字段' };
    }
    if (tier.start >= tier.end) {
      return { valid: false, error: `第${i + 1}阶梯：起始值必须小于结束值` };
    }
    if (tier.price < 0) {
      return { valid: false, error: `第${i + 1}阶梯：单价不能为负数` };
    }
    if (i > 0) {
      if (sorted[i - 1].end !== tier.start) {
        return { valid: false, error: `第${i}阶梯和第${i + 1}阶梯之间有空隙或重叠` };
      }
    }
  }

  return { valid: true, tiers: sorted };
}

export function calculateTieredPrice(usage, tiers) {
  const sorted = [...tiers].sort((a, b) => a.start - b.start);
  let remainingUsage = usage;
  let totalPrice = 0;
  const details = [];

  for (const tier of sorted) {
    const tierRange = tier.end - tier.start;
    const usageInTier = Math.min(remainingUsage, tierRange);
    
    if (usageInTier > 0) {
      const tierCost = usageInTier * tier.price;
      totalPrice += tierCost;
      details.push({
        start: tier.start,
        end: tier.end,
        usage: usageInTier,
        unitPrice: tier.price,
        subtotal: tierCost,
      });
    }
    
    remainingUsage -= usageInTier;
    if (remainingUsage <= 0) break;
  }

  if (remainingUsage > 0) {
    const lastTier = sorted[sorted.length - 1];
    const overageCost = remainingUsage * lastTier.price;
    totalPrice += overageCost;
    details.push({
      start: lastTier.end,
      end: null,
      usage: remainingUsage,
      unitPrice: lastTier.price,
      subtotal: overageCost,
    });
  }

  return { totalPrice, details };
}

export function calculateUsageCost(usage, rule) {
  if (rule.pricingType === 'fixed') {
    const totalPrice = usage * parseFloat(rule.unitPrice);
    return {
      totalPrice,
      details: [{
        usage,
        unitPrice: parseFloat(rule.unitPrice),
        subtotal: totalPrice,
      }],
    };
  } else if (rule.pricingType === 'tiered') {
    return calculateTieredPrice(usage, rule.tiers);
  }
  
  return { totalPrice: 0, details: [] };
}

export async function createRule(data, operator) {
  const t = await sequelize.transaction();
  
  try {
    const apiInterface = await ApiInterface.findByPk(data.apiInterfaceId);
    if (!apiInterface) {
      throw new Error('API接口不存在');
    }

    const nextMonth = getMonthKey(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
    const effectiveMonth = data.effectiveMonth || nextMonth;

    const existingRule = await MeteringRule.findOne({
      where: {
        apiInterfaceId: data.apiInterfaceId,
        dimension: data.dimension,
        effectiveMonth,
        status: { [Op.in]: ['draft', 'active'] },
      },
      transaction: t,
    });

    if (existingRule) {
      throw new Error('该接口该维度在生效月份已存在规则');
    }

    if (data.pricingType === 'tiered') {
      const validation = validateTiers(data.tiers);
      if (!validation.valid) {
        throw new Error(validation.error);
      }
      data.tiers = validation.tiers;
    } else {
      if (!data.unitPrice || data.unitPrice < 0) {
        throw new Error('固定单价必须大于等于0');
      }
    }

    const unitMap = {
      count: '次',
      data_transfer: 'MB',
      compute_time: '秒',
    };

    const rule = await MeteringRule.create({
      ...data,
      effectiveMonth,
      unit: unitMap[data.dimension],
      status: 'draft',
      createdBy: operator,
      version: 1,
    }, { transaction: t });

    await RuleChangeHistory.create({
      ruleId: rule.id,
      apiInterfaceId: data.apiInterfaceId,
      dimension: data.dimension,
      changeType: 'create',
      newValue: rule.toJSON(),
      effectiveMonth,
      changedBy: operator,
    }, { transaction: t });

    await t.commit();
    return rule;
  } catch (error) {
    await t.rollback();
    throw error;
  }
}

export async function updateRule(ruleId, data, operator) {
  const t = await sequelize.transaction();
  
  try {
    const rule = await MeteringRule.findByPk(ruleId, { transaction: t });
    if (!rule) {
      throw new Error('规则不存在');
    }

    const currentMonth = getMonthKey();
    if (rule.status === 'active' && rule.effectiveMonth <= currentMonth) {
      throw new Error('已生效的当前周期规则不能修改');
    }

    const oldValue = { ...rule.toJSON() };

    if (data.pricingType === 'tiered') {
      const validation = validateTiers(data.tiers);
      if (!validation.valid) {
        throw new Error(validation.error);
      }
      data.tiers = validation.tiers;
    }

    await rule.update({
      ...data,
      version: rule.version + 1,
    }, { transaction: t });

    await RuleChangeHistory.create({
      ruleId: rule.id,
      apiInterfaceId: rule.apiInterfaceId,
      dimension: rule.dimension,
      changeType: 'update',
      oldValue,
      newValue: rule.toJSON(),
      effectiveMonth: rule.effectiveMonth,
      changedBy: operator,
    }, { transaction: t });

    await t.commit();
    return rule;
  } catch (error) {
    await t.rollback();
    throw error;
  }
}

export async function activateRule(ruleId, operator) {
  const t = await sequelize.transaction();
  
  try {
    const rule = await MeteringRule.findByPk(ruleId, { transaction: t });
    if (!rule) {
      throw new Error('规则不存在');
    }

    if (rule.status !== 'draft') {
      throw new Error('只有草稿状态的规则可以激活');
    }

    const currentMonth = getMonthKey();
    if (rule.effectiveMonth < currentMonth) {
      throw new Error('生效月份已过，无法激活');
    }

    const oldValue = { ...rule.toJSON() };
    await rule.update({ status: 'active' }, { transaction: t });

    await RuleChangeHistory.create({
      ruleId: rule.id,
      apiInterfaceId: rule.apiInterfaceId,
      dimension: rule.dimension,
      changeType: 'update',
      oldValue,
      newValue: rule.toJSON(),
      effectiveMonth: rule.effectiveMonth,
      changedBy: operator,
      remark: '激活规则',
    }, { transaction: t });

    await t.commit();
    return rule;
  } catch (error) {
    await t.rollback();
    throw error;
  }
}

export async function archiveRule(ruleId, operator) {
  const t = await sequelize.transaction();
  
  try {
    const rule = await MeteringRule.findByPk(ruleId, { transaction: t });
    if (!rule) {
      throw new Error('规则不存在');
    }

    const oldValue = { ...rule.toJSON() };
    await rule.update({ status: 'archived' }, { transaction: t });

    await RuleChangeHistory.create({
      ruleId: rule.id,
      apiInterfaceId: rule.apiInterfaceId,
      dimension: rule.dimension,
      changeType: 'archive',
      oldValue,
      newValue: rule.toJSON(),
      effectiveMonth: rule.effectiveMonth,
      changedBy: operator,
    }, { transaction: t });

    await t.commit();
    return rule;
  } catch (error) {
    await t.rollback();
    throw error;
  }
}

export async function getActiveRules(apiInterfaceId, month) {
  const effectiveMonth = month || getMonthKey();
  
  return await MeteringRule.findAll({
    where: {
      apiInterfaceId,
      effectiveMonth,
      status: 'active',
    },
    include: [
      {
        model: ApiInterface,
        attributes: ['id', 'name', 'path', 'method'],
      },
    ],
  });
}

export async function getRuleChangeHistory(ruleId) {
  return await RuleChangeHistory.findAll({
    where: { ruleId },
    order: [['createdAt', 'DESC']],
  });
}

export async function listRules(params = {}) {
  const where = {};
  
  if (params.apiInterfaceId) where.apiInterfaceId = params.apiInterfaceId;
  if (params.dimension) where.dimension = params.dimension;
  if (params.status) where.status = params.status;
  if (params.effectiveMonth) where.effectiveMonth = params.effectiveMonth;

  return await MeteringRule.findAndCountAll({
    where,
    include: [
      {
        model: ApiInterface,
        attributes: ['id', 'name', 'path', 'method'],
      },
    ],
    order: [['effectiveMonth', 'DESC'], ['dimension', 'ASC']],
    limit: params.limit || 50,
    offset: params.offset || 0,
  });
}

export default {
  validateTiers,
  calculateTieredPrice,
  calculateUsageCost,
  createRule,
  updateRule,
  activateRule,
  archiveRule,
  getActiveRules,
  getRuleChangeHistory,
  listRules,
};
