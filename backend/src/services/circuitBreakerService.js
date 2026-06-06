import { CircuitBreakerState, sequelize } from '../models/index.js';
import { Op } from 'sequelize';

const HALF_OPEN_DURATION = 10 * 60 * 1000;
const HALF_OPEN_TRAFFIC_RATIO = 0.1;

export async function getCircuitBreakerState(tenantId, apiInterfaceId) {
  const state = await CircuitBreakerState.findOne({
    where: { tenantId, apiInterfaceId: apiInterfaceId || null },
  });
  return state;
}

export async function openCircuit(tenantId, apiInterfaceId, alertRuleId, cooldownMinutes = 30) {
  const now = new Date();
  const cooldownUntil = new Date(now.getTime() + cooldownMinutes * 60 * 1000);

  const [state, created] = await CircuitBreakerState.findOrCreate({
    where: { tenantId, apiInterfaceId: apiInterfaceId || null },
    defaults: {
      alertRuleId,
      state: 'open',
      openedAt: now,
      cooldownUntil,
      halfOpenSuccessCount: 0,
      halfOpenFailureCount: 0,
      manuallyClosed: false,
    },
  });

  if (!created) {
    await state.update({
      alertRuleId,
      state: 'open',
      openedAt: now,
      cooldownUntil,
      halfOpenStartedAt: null,
      halfOpenSuccessCount: 0,
      halfOpenFailureCount: 0,
      manuallyClosed: false,
      manuallyClosedBy: null,
      manuallyClosedAt: null,
    });
  }

  return state;
}

export async function transitionToHalfOpen(tenantId, apiInterfaceId) {
  const state = await getCircuitBreakerState(tenantId, apiInterfaceId);
  if (!state || state.state !== 'open') return null;

  const now = new Date();
  if (now < state.cooldownUntil && !state.manuallyClosed) return null;

  await state.update({
    state: 'half_open',
    halfOpenStartedAt: now,
    halfOpenSuccessCount: 0,
    halfOpenFailureCount: 0,
  });

  return state;
}

export async function closeCircuit(tenantId, apiInterfaceId, manually = false, userId = null) {
  const state = await getCircuitBreakerState(tenantId, apiInterfaceId);
  if (!state) return null;

  const updateData = {
    state: 'closed',
    openedAt: null,
    cooldownUntil: null,
    halfOpenStartedAt: null,
    halfOpenSuccessCount: 0,
    halfOpenFailureCount: 0,
  };

  if (manually) {
    updateData.manuallyClosed = true;
    updateData.manuallyClosedBy = userId;
    updateData.manuallyClosedAt = new Date();
  }

  await state.update(updateData);
  return state;
}

export async function recordHalfOpenRequest(tenantId, apiInterfaceId, success) {
  const state = await getCircuitBreakerState(tenantId, apiInterfaceId);
  if (!state || state.state !== 'half_open') return null;

  const updateData = {};

  if (success) {
    updateData.halfOpenSuccessCount = state.halfOpenSuccessCount + 1;

    if (updateData.halfOpenSuccessCount >= state.successThreshold) {
      updateData.state = 'closed';
      updateData.openedAt = null;
      updateData.cooldownUntil = null;
      updateData.halfOpenStartedAt = null;
    }
  } else {
    updateData.halfOpenFailureCount = state.halfOpenFailureCount + 1;

    if (updateData.halfOpenFailureCount >= state.failureThreshold) {
      const rule = await state.getAlertRule();
      const cooldownMinutes = rule?.cooldownPeriod || 30;

      updateData.state = 'open';
      updateData.openedAt = new Date();
      updateData.cooldownUntil = new Date(Date.now() + cooldownMinutes * 60 * 1000);
      updateData.halfOpenStartedAt = null;
      updateData.halfOpenSuccessCount = 0;
      updateData.halfOpenFailureCount = 0;
    }
  }

  await state.update(updateData);
  return state;
}

export async function allowHalfOpenRequest(tenantId, apiInterfaceId) {
  const state = await getCircuitBreakerState(tenantId, apiInterfaceId);
  if (!state || state.state !== 'half_open') return false;

  if (state.halfOpenStartedAt) {
    const elapsed = Date.now() - new Date(state.halfOpenStartedAt).getTime();
    if (elapsed > HALF_OPEN_DURATION) {
      if (state.halfOpenSuccessCount > state.halfOpenFailureCount) {
        await closeCircuit(tenantId, apiInterfaceId);
      } else {
        const rule = await state.getAlertRule();
        const cooldownMinutes = rule?.cooldownPeriod || 30;
        await openCircuit(tenantId, apiInterfaceId, state.alertRuleId, cooldownMinutes);
      }
      return false;
    }
  }

  return Math.random() < HALF_OPEN_TRAFFIC_RATIO;
}

export async function checkCircuitBreaker(tenantId, apiInterfaceId) {
  let state = await getCircuitBreakerState(tenantId, apiInterfaceId);

  if (!state || state.state === 'closed') {
    return { allowed: true, state: 'closed' };
  }

  if (state.state === 'open') {
    if (new Date() >= state.cooldownUntil || state.manuallyClosed) {
      state = await transitionToHalfOpen(tenantId, apiInterfaceId);
      if (!state) return { allowed: true, state: 'closed' };
    } else {
      const cooldownRemaining = Math.ceil((state.cooldownUntil - Date.now()) / 1000);
      return {
        allowed: false,
        state: 'open',
        retryAfter: cooldownRemaining,
        openedAt: state.openedAt,
        cooldownUntil: state.cooldownUntil,
      };
    }
  }

  if (state.state === 'half_open') {
    const allowed = await allowHalfOpenRequest(tenantId, apiInterfaceId);
    const elapsed = state.halfOpenStartedAt
      ? HALF_OPEN_DURATION - (Date.now() - new Date(state.halfOpenStartedAt).getTime())
      : HALF_OPEN_DURATION;

    return {
      allowed,
      state: 'half_open',
      halfOpenStartedAt: state.halfOpenStartedAt,
      remainingTime: Math.ceil(elapsed / 1000),
      successCount: state.halfOpenSuccessCount,
      failureCount: state.halfOpenFailureCount,
    };
  }

  return { allowed: true, state: 'closed' };
}

export async function getCircuitBreakerStatus(tenantId) {
  const states = await CircuitBreakerState.findAll({
    where: { tenantId, state: { [Op.ne]: 'closed' } },
    include: ['alertRule', 'apiInterface'],
  });

  return states.map(state => {
    let remainingTime = null;
    if (state.state === 'open' && state.cooldownUntil) {
      remainingTime = Math.max(0, Math.ceil((state.cooldownUntil - Date.now()) / 1000));
    } else if (state.state === 'half_open' && state.halfOpenStartedAt) {
      remainingTime = Math.max(0, Math.ceil((HALF_OPEN_DURATION - (Date.now() - new Date(state.halfOpenStartedAt).getTime())) / 1000));
    }

    return {
      id: state.id,
      apiInterfaceId: state.apiInterfaceId,
      apiInterfaceName: state.apiInterface?.name || '全局',
      state: state.state,
      openedAt: state.openedAt,
      cooldownUntil: state.cooldownUntil,
      remainingTime,
      halfOpenStartedAt: state.halfOpenStartedAt,
      halfOpenSuccessCount: state.halfOpenSuccessCount,
      halfOpenFailureCount: state.halfOpenFailureCount,
      ruleName: state.alertRule?.name,
      manuallyClosed: state.manuallyClosed,
    };
  });
}

export async function manuallyCloseCircuit(tenantId, apiInterfaceId, userId) {
  const state = await getCircuitBreakerState(tenantId, apiInterfaceId);
  if (!state) {
    return { success: false, message: '熔断状态不存在' };
  }

  if (state.state === 'closed') {
    return { success: false, message: '熔断器已经是关闭状态' };
  }

  await closeCircuit(tenantId, apiInterfaceId, true, userId);
  return { success: true, message: '已手动解除熔断' };
}

export async function checkExpiredCircuits() {
  const now = new Date();

  const expiredOpenStates = await CircuitBreakerState.findAll({
    where: {
      state: 'open',
      cooldownUntil: { [Op.lte]: now },
      manuallyClosed: false,
    },
  });

  for (const state of expiredOpenStates) {
    await transitionToHalfOpen(state.tenantId, state.apiInterfaceId);
  }

  return { transitioned: expiredOpenStates.length };
}

export default {
  getCircuitBreakerState,
  openCircuit,
  transitionToHalfOpen,
  closeCircuit,
  recordHalfOpenRequest,
  allowHalfOpenRequest,
  checkCircuitBreaker,
  getCircuitBreakerStatus,
  manuallyCloseCircuit,
  checkExpiredCircuits,
};
