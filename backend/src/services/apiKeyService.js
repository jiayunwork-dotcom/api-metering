import crypto from 'crypto';
import { Op } from 'sequelize';
import { ApiKey, ApiKeyPermission, ApiKeyIpWhitelist, ApiKeyAccessLog, sequelize } from '../models/index.js';
import redis from '../config/redis.js';

const MAX_KEYS_PER_TENANT = 10;
const KEY_PREFIX = 'sk_live_';
const KEY_LENGTH = 32;
const CACHE_TTL = 3600;

function generateApiKey() {
  const randomPart = crypto.randomBytes(KEY_LENGTH).toString('hex');
  return `${KEY_PREFIX}${randomPart}`;
}

function hashApiKey(apiKey) {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

function getKeyPrefix(apiKey) {
  return apiKey.substring(0, 16);
}

function ipToNumber(ip) {
  if (ip.includes(':')) {
    return null;
  }
  return ip.split('.').reduce((int, oct) => (int << 8) + parseInt(oct, 10), 0) >>> 0;
}

function cidrToRange(cidr) {
  const [ip, prefix] = cidr.split('/');
  const prefixLength = parseInt(prefix, 10);
  const ipNum = ipToNumber(ip);
  const mask = prefixLength === 0 ? 0 : (~0 << (32 - prefixLength)) >>> 0;
  const networkAddress = (ipNum & mask) >>> 0;
  const broadcastAddress = (networkAddress | (~mask >>> 0)) >>> 0;
  return { start: networkAddress, end: broadcastAddress };
}

function isIpInRange(ip, cidr) {
  if (cidr.includes('/')) {
    const range = cidrToRange(cidr);
    const ipNum = ipToNumber(ip);
    return ipNum >= range.start && ipNum <= range.end;
  }
  return ip === cidr;
}

function isIpInWhitelist(ip, whitelist) {
  if (!whitelist || whitelist.length === 0) {
    return true;
  }
  return whitelist.some(entry => isIpInRange(ip, entry.ipOrCidr));
}

function parsePermissionString(permStr) {
  const [resource, action] = permStr.split(':');
  return { resource, action };
}

export async function createApiKey(tenantId, data, createdBy = null) {
  const existingCount = await ApiKey.count({
    where: {
      tenantId,
      status: { [Op.ne]: 'deleted' },
    },
  });

  if (existingCount >= MAX_KEYS_PER_TENANT) {
    throw new Error(`每个租户最多创建${MAX_KEYS_PER_TENANT}把密钥`);
  }

  const transaction = await sequelize.transaction();

  try {
    const fullKey = generateApiKey();
    const keyHash = hashApiKey(fullKey);
    const keyPrefix = getKeyPrefix(fullKey);

    let permissions = [];
    if (data.presetRole && ApiKeyPermission.PRESET_ROLES[data.presetRole]) {
      permissions = ApiKeyPermission.PRESET_ROLES[data.presetRole].permissions;
    } else if (data.permissions && Array.isArray(data.permissions)) {
      permissions = data.permissions;
    }

    if (permissions.length === 0) {
      throw new Error('请选择权限');
    }

    let expiresAt = null;
    if (data.expiresAt) {
      expiresAt = new Date(data.expiresAt);
      if (expiresAt <= new Date()) {
        throw new Error('过期时间必须大于当前时间');
      }
    }

    const apiKey = await ApiKey.create({
      tenantId,
      name: data.name,
      keyPrefix,
      keyHash,
      expiresAt,
      quotaLimit: data.quotaLimit || null,
      quotaUnit: data.quotaLimit ? data.quotaUnit || 'calls' : null,
      ipWhitelistEnabled: data.ipWhitelistEnabled !== false,
      createdBy,
    }, { transaction });

    const permissionRecords = permissions.map(p => {
      const { resource, action } = parsePermissionString(p);
      return {
        apiKeyId: apiKey.id,
        resource,
        action,
        createdBy,
      };
    });

    await ApiKeyPermission.bulkCreate(permissionRecords, { transaction });

    if (data.ipWhitelist && Array.isArray(data.ipWhitelist) && data.ipWhitelist.length > 0) {
      if (data.ipWhitelist.length > 20) {
        throw new Error('IP白名单最多20个条目');
      }
      const ipRecords = data.ipWhitelist.map(ip => ({
        apiKeyId: apiKey.id,
        ipOrCidr: ip.trim(),
        ipType: ip.includes(':') ? 'ipv6' : 'ipv4',
        createdBy,
      }));
      await ApiKeyIpWhitelist.bulkCreate(ipRecords, { transaction });
    }

    await transaction.commit();

    const apiKeyData = apiKey.toJSON();
    delete apiKeyData.keyHash;
    apiKeyData.fullKey = fullKey;

    await clearApiKeyCache(apiKey.id);

    return apiKeyData;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function getApiKeyById(id, tenantId = null) {
  const cacheKey = `api_key:${id}`;
  
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (!tenantId || parsed.tenantId === tenantId) {
        return parsed;
      }
    }
  } catch {}

  const where = { id, status: { [Op.ne]: 'deleted' } };
  if (tenantId) {
    where.tenantId = tenantId;
  }

  const apiKey = await ApiKey.findOne({
    where,
    include: [
      { model: ApiKeyPermission, as: 'permissions', attributes: ['resource', 'action'] },
      { model: ApiKeyIpWhitelist, as: 'ipWhitelists', attributes: ['ipOrCidr', 'ipType', 'comment'] },
    ],
  });

  if (!apiKey) {
    return null;
  }

  const result = apiKey.toJSON();
  delete result.keyHash;

  try {
    await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(result));
  } catch {}

  return result;
}

export async function getApiKeyByHash(keyHash) {
  const cacheKey = `api_key_hash:${keyHash}`;
  
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch {}

  const apiKey = await ApiKey.findOne({
    where: { keyHash, status: { [Op.ne]: 'deleted' } },
    include: [
      { model: ApiKeyPermission, as: 'permissions', attributes: ['resource', 'action'] },
      { model: ApiKeyIpWhitelist, as: 'ipWhitelists', attributes: ['ipOrCidr', 'ipType'] },
    ],
  });

  if (!apiKey) {
    return null;
  }

  const result = apiKey.toJSON();
  delete result.keyHash;

  try {
    await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(result));
  } catch {}

  return result;
}

export async function listApiKeys(tenantId, options = {}) {
  const where = {
    tenantId,
    status: { [Op.ne]: 'deleted' },
  };

  if (options.status) {
    where.status = options.status;
  }

  const { count, rows } = await ApiKey.findAndCountAll({
    where,
    include: [
      { model: ApiKeyPermission, as: 'permissions', attributes: ['resource', 'action'] },
      { model: ApiKeyIpWhitelist, as: 'ipWhitelists', attributes: ['ipOrCidr'] },
    ],
    order: [['createdAt', 'DESC']],
    limit: options.limit,
    offset: options.offset,
  });

  const keys = rows.map(row => {
    const data = row.toJSON();
    delete data.keyHash;
    return data;
  });

  return { total: count, data: keys };
}

export async function updateApiKey(id, tenantId, data) {
  const apiKey = await ApiKey.findOne({
    where: { id, tenantId, status: { [Op.ne]: 'deleted' } },
  });

  if (!apiKey) {
    throw new Error('密钥不存在');
  }

  const transaction = await sequelize.transaction();

  try {
    if (data.name !== undefined) {
      apiKey.name = data.name;
    }
    if (data.expiresAt !== undefined) {
      if (data.expiresAt === null) {
        apiKey.expiresAt = null;
      } else {
        const expiresAt = new Date(data.expiresAt);
        if (expiresAt <= new Date()) {
          throw new Error('过期时间必须大于当前时间');
        }
        apiKey.expiresAt = expiresAt;
      }
    }
    if (data.ipWhitelistEnabled !== undefined) {
      apiKey.ipWhitelistEnabled = data.ipWhitelistEnabled;
    }
    if (data.quotaLimit !== undefined) {
      apiKey.quotaLimit = data.quotaLimit;
      apiKey.quotaUnit = data.quotaLimit ? data.quotaUnit || apiKey.quotaUnit || 'calls' : null;
    }

    await apiKey.save({ transaction });

    if (data.permissions && Array.isArray(data.permissions)) {
      await ApiKeyPermission.destroy({
        where: { apiKeyId: id },
        transaction,
      });

      const permissionRecords = data.permissions.map(p => {
        const { resource, action } = parsePermissionString(p);
        return { apiKeyId: id, resource, action };
      });

      await ApiKeyPermission.bulkCreate(permissionRecords, { transaction });
    }

    if (data.ipWhitelist !== undefined && Array.isArray(data.ipWhitelist)) {
      if (data.ipWhitelist.length > 20) {
        throw new Error('IP白名单最多20个条目');
      }

      await ApiKeyIpWhitelist.destroy({
        where: { apiKeyId: id },
        transaction,
      });

      if (data.ipWhitelist.length > 0) {
        const ipRecords = data.ipWhitelist.map(ip => ({
          apiKeyId: id,
          ipOrCidr: ip.trim(),
          ipType: ip.includes(':') ? 'ipv6' : 'ipv4',
        }));
        await ApiKeyIpWhitelist.bulkCreate(ipRecords, { transaction });
      }
    }

    await transaction.commit();

    await clearApiKeyCache(id);

    return getApiKeyById(id, tenantId);
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function toggleApiKeyStatus(id, tenantId) {
  const apiKey = await ApiKey.findOne({
    where: { id, tenantId, status: { [Op.in]: ['active', 'disabled'] } },
  });

  if (!apiKey) {
    throw new Error('密钥不存在或状态不可切换');
  }

  apiKey.status = apiKey.status === 'active' ? 'disabled' : 'active';
  await apiKey.save();

  await clearApiKeyCache(id);

  return { id, status: apiKey.status };
}

export async function deleteApiKey(id, tenantId) {
  const apiKey = await ApiKey.findOne({
    where: { id, tenantId, status: { [Op.ne]: 'deleted' } },
  });

  if (!apiKey) {
    throw new Error('密钥不存在');
  }

  apiKey.status = 'deleted';
  await apiKey.destroy();

  await clearApiKeyCache(id);

  return { success: true };
}

export async function rotateApiKey(id, tenantId, gracePeriodHours = 24, createdBy = null) {
  if (gracePeriodHours < 1 || gracePeriodHours > 72) {
    throw new Error('宽限期必须在1-72小时之间');
  }

  const oldKey = await ApiKey.findOne({
    where: { id, tenantId, status: { [Op.in]: ['active', 'disabled'] } },
    include: [
      { model: ApiKeyPermission, as: 'permissions', attributes: ['resource', 'action'] },
      { model: ApiKeyIpWhitelist, as: 'ipWhitelists', attributes: ['ipOrCidr'] },
    ],
  });

  if (!oldKey) {
    throw new Error('密钥不存在');
  }

  const transaction = await sequelize.transaction();

  try {
    const permissions = oldKey.permissions.map(p => `${p.resource}:${p.action}`);
    const ipWhitelist = oldKey.ipWhitelists.map(ip => ip.ipOrCidr);

    const newKeyData = await createApiKey(tenantId, {
      name: oldKey.name + ' (轮换)',
      permissions,
      ipWhitelist,
      expiresAt: oldKey.expiresAt,
      quotaLimit: oldKey.quotaLimit,
      quotaUnit: oldKey.quotaUnit,
      ipWhitelistEnabled: oldKey.ipWhitelistEnabled,
    }, createdBy);

    oldKey.replacedByKeyId = newKeyData.id;
    oldKey.rotationGracePeriod = gracePeriodHours;
    oldKey.rotationExpiresAt = new Date(Date.now() + gracePeriodHours * 60 * 60 * 1000);
    await oldKey.save({ transaction });

    await transaction.commit();

    await clearApiKeyCache(id);

    return {
      oldKeyId: id,
      newKey: newKeyData,
      gracePeriodHours,
      rotationExpiresAt: oldKey.rotationExpiresAt,
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function checkApiKeyStatus(apiKey) {
  const now = new Date();

  if (apiKey.status === 'disabled') {
    return { valid: false, reason: 'disabled', message: '密钥已禁用' };
  }

  if (apiKey.status === 'deleted') {
    return { valid: false, reason: 'deleted', message: '密钥已删除' };
  }

  if (apiKey.expiresAt && new Date(apiKey.expiresAt) <= now) {
    await ApiKey.update({ status: 'expired' }, { where: { id: apiKey.id } });
    return { valid: false, reason: 'expired', message: '密钥已过期' };
  }

  if (apiKey.replacedByKeyId && apiKey.rotationExpiresAt && new Date(apiKey.rotationExpiresAt) <= now) {
    await ApiKey.update({ status: 'expired' }, { where: { id: apiKey.id } });
    return { valid: false, reason: 'rotation_expired', message: '密钥轮换宽限期已过' };
  }

  return { valid: true };
}

export async function verifyApiKey(keyValue, ipAddress, resource = null, action = null) {
  const keyHash = hashApiKey(keyValue);
  const apiKey = await getApiKeyByHash(keyHash);

  if (!apiKey) {
    await logAccess(null, null, getKeyPrefix(keyValue), 'denied_invalid_key', ipAddress, resource, action, '无效的API密钥');
    return { valid: false, reason: 'invalid_key', message: '无效的API密钥' };
  }

  const statusCheck = await checkApiKeyStatus(apiKey);
  if (!statusCheck.valid) {
    await logAccess(apiKey.id, apiKey.tenantId, apiKey.keyPrefix, `denied_${statusCheck.reason}`, ipAddress, resource, action, statusCheck.message);
    return { valid: false, reason: statusCheck.reason, message: statusCheck.message, apiKey };
  }

  if (apiKey.ipWhitelistEnabled && !isIpInWhitelist(ipAddress, apiKey.ipWhitelists)) {
    await logAccess(apiKey.id, apiKey.tenantId, apiKey.keyPrefix, 'denied_ip', ipAddress, resource, action, `IP ${ipAddress} 不在白名单中`);
    return { valid: false, reason: 'ip_denied', message: 'IP地址不在白名单中', apiKey };
  }

  if (resource && action) {
    const hasPermission = apiKey.permissions.some(
      p => p.resource === resource && p.action === action
    );
    if (!hasPermission) {
      await logAccess(apiKey.id, apiKey.tenantId, apiKey.keyPrefix, 'denied_permission', ipAddress, resource, action, `缺少权限: ${resource}:${action}`);
      return { valid: false, reason: 'permission_denied', message: '权限不足', apiKey };
    }
  }

  if (apiKey.quotaLimit !== null && apiKey.quotaLimit > 0) {
    if ((apiKey.quotaUsed || 0) >= apiKey.quotaLimit) {
      await logAccess(apiKey.id, apiKey.tenantId, apiKey.keyPrefix, 'denied_quota', ipAddress, resource, action, '密钥配额已用完');
      return { valid: false, reason: 'quota_exceeded', message: '密钥配额已用完', apiKey };
    }
  }

  return { valid: true, apiKey };
}

export async function updateLastUsedTime(apiKeyId) {
  try {
    await ApiKey.update(
      { lastUsedAt: new Date() },
      { where: { id: apiKeyId } }
    );
    await clearApiKeyCache(apiKeyId);
  } catch (error) {
    console.error('更新最后使用时间失败:', error);
  }
}

export async function incrementQuotaUsage(apiKeyId, amount = 1) {
  try {
    await ApiKey.increment(
      { quotaUsed: amount },
      { where: { id: apiKeyId } }
    );
    await clearApiKeyCache(apiKeyId);
  } catch (error) {
    console.error('增加配额使用量失败:', error);
  }
}

export async function logAccess(apiKeyId, tenantId, keyPrefix, accessType, ipAddress, resource = null, action = null, deniedReason = null, metadata = {}) {
  try {
    await ApiKeyAccessLog.create({
      apiKeyId,
      tenantId,
      keyPrefix,
      accessType,
      resource,
      action,
      ipAddress,
      userAgent: metadata.userAgent,
      requestPath: metadata.requestPath,
      requestMethod: metadata.requestMethod,
      deniedReason,
      timestamp: new Date(),
      metadata,
    });
  } catch (error) {
    console.error('记录访问日志失败:', error);
  }
}

export async function listAccessLogs(tenantId, options = {}) {
  const where = { tenantId };
  if (options.apiKeyId) {
    where.apiKeyId = options.apiKeyId;
  }
  if (options.accessType) {
    where.accessType = options.accessType;
  }
  if (options.startTime) {
    where.timestamp = { [Op.gte]: new Date(options.startTime) };
  }
  if (options.endTime) {
    where.timestamp = where.timestamp || {};
    where.timestamp[Op.lte] = new Date(options.endTime);
  }

  const { count, rows } = await ApiKeyAccessLog.findAndCountAll({
    where,
    order: [['timestamp', 'DESC']],
    limit: options.limit || 50,
    offset: options.offset || 0,
  });

  return { total: count, data: rows };
}

export async function getKeyUsageStats(tenantId, apiKeyId, startDate, endDate) {
  const where = {
    tenantId,
    apiKeyId,
    timestamp: {
      [Op.between]: [new Date(startDate), new Date(endDate)],
    },
  };

  const totalCalls = await ApiKeyAccessLog.count({
    where: { ...where, accessType: 'success' },
  });

  const deniedCalls = await ApiKeyAccessLog.count({
    where: { ...where, accessType: { [Op.ne]: 'success' } },
  });

  const deniedByType = await ApiKeyAccessLog.findAll({
    where: { ...where, accessType: { [Op.ne]: 'success' } },
    attributes: ['accessType', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
    group: ['accessType'],
    raw: true,
  });

  return {
    totalCalls,
    deniedCalls,
    successRate: totalCalls + deniedCalls > 0 ? (totalCalls / (totalCalls + deniedCalls) * 100).toFixed(2) : 0,
    deniedByType: deniedByType.reduce((acc, item) => {
      acc[item.accessType] = parseInt(item.count);
      return acc;
    }, {}),
  };
}

async function clearApiKeyCache(id) {
  try {
    await redis.del(`api_key:${id}`);
    const apiKey = await ApiKey.findByPk(id, { attributes: ['keyHash'] });
    if (apiKey) {
      await redis.del(`api_key_hash:${apiKey.keyHash}`);
    }
  } catch {}
}

export async function checkExpiredRotations() {
  const now = new Date();
  const expiredKeys = await ApiKey.findAll({
    where: {
      status: 'active',
      rotationExpiresAt: { [Op.lte]: now },
      replacedByKeyId: { [Op.ne]: null },
    },
  });

  for (const key of expiredKeys) {
    key.status = 'expired';
    await key.save();
    await clearApiKeyCache(key.id);
    console.log(`密钥 ${key.id} 轮换宽限期已过，已自动过期`);
  }

  return { expiredCount: expiredKeys.length };
}

export async function checkExpiredKeys() {
  const now = new Date();
  const expiredKeys = await ApiKey.findAll({
    where: {
      status: 'active',
      expiresAt: { [Op.lte]: now },
    },
  });

  for (const key of expiredKeys) {
    key.status = 'expired';
    await key.save();
    await clearApiKeyCache(key.id);
    console.log(`密钥 ${key.id} 已过期，状态已更新`);
  }

  return { expiredCount: expiredKeys.length };
}

export default {
  createApiKey,
  getApiKeyById,
  getApiKeyByHash,
  listApiKeys,
  updateApiKey,
  toggleApiKeyStatus,
  deleteApiKey,
  rotateApiKey,
  checkApiKeyStatus,
  verifyApiKey,
  updateLastUsedTime,
  incrementQuotaUsage,
  logAccess,
  listAccessLogs,
  getKeyUsageStats,
  checkExpiredRotations,
  checkExpiredKeys,
  hashApiKey,
  isIpInWhitelist,
  parsePermissionString,
  MAX_KEYS_PER_TENANT,
  KEY_PREFIX,
};
