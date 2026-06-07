import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import {
  createApiKey,
  getApiKeyById,
  listApiKeys,
  updateApiKey,
  toggleApiKeyStatus,
  deleteApiKey,
  rotateApiKey,
  verifyApiKey,
  checkApiKeyStatus,
  hashApiKey,
  isIpInWhitelist,
  MAX_KEYS_PER_TENANT,
} from '../src/services/apiKeyService.js';
import { ApiKey, Tenant, sequelize } from '../src/models/index.js';
import crypto from 'crypto';

const testTenantId = crypto.randomUUID();
let testKeyId = null;
let testFullKey = null;

describe('ApiKey Service Tests', () => {
  beforeEach(async () => {
    await ApiKey.destroy({ where: { tenantId: testTenantId }, force: true });

    const testTenant = await Tenant.findOne({ where: { id: testTenantId } });
    if (!testTenant) {
      await Tenant.create({
        id: testTenantId,
        name: 'Test Tenant for API Keys',
        code: 'test-api-key-tenant',
        status: 'active',
        contactEmail: 'test@example.com',
      });
    }
  });

  afterEach(async () => {
    await ApiKey.destroy({ where: { tenantId: testTenantId }, force: true });
  });

  describe('createApiKey', () => {
    it('should create a new API key with full permissions', async () => {
      const data = {
        name: 'Test Key Full Access',
        presetRole: 'full_access',
      };

      const result = await createApiKey(testTenantId, data);
      testKeyId = result.id;
      testFullKey = result.fullKey;

      assert.ok(result.id);
      assert.ok(result.fullKey);
      assert.ok(result.keyPrefix);
      assert.equal(result.name, data.name);
      assert.equal(result.status, 'active');
      assert.ok(result.fullKey.startsWith('sk_live_'));
      assert.equal(result.keyPrefix, result.fullKey.substring(0, 16));
      assert.equal(result.permissions.length, 12);
    });

    it('should create a new API key with read_only preset', async () => {
      const data = {
        name: 'Test Key Read Only',
        presetRole: 'read_only',
      };

      const result = await createApiKey(testTenantId, data);
      assert.equal(result.permissions.length, 6);
      assert.ok(result.permissions.every(p => p.action === 'read'));
    });

    it('should create a new API key with report_only preset', async () => {
      const data = {
        name: 'Test Key Report Only',
        presetRole: 'report_only',
      };

      const result = await createApiKey(testTenantId, data);
      assert.equal(result.permissions.length, 2);
    });

    it('should create a new API key with custom permissions', async () => {
      const data = {
        name: 'Test Key Custom',
        permissions: ['metering_event:write', 'usage_query:read'],
      };

      const result = await createApiKey(testTenantId, data);
      assert.equal(result.permissions.length, 2);
    });

    it('should create a new API key with IP whitelist', async () => {
      const data = {
        name: 'Test Key with IP Whitelist',
        presetRole: 'full_access',
        ipWhitelist: ['192.168.1.1', '10.0.0.0/24'],
      };

      const result = await createApiKey(testTenantId, data);
      assert.equal(result.ipWhitelists.length, 2);
      assert.equal(result.ipWhitelistEnabled, true);
    });

    it('should create a new API key with expiration', async () => {
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const data = {
        name: 'Test Key with Expiration',
        presetRole: 'full_access',
        expiresAt: futureDate.toISOString(),
      };

      const result = await createApiKey(testTenantId, data);
      assert.ok(result.expiresAt);
    });

    it('should create a new API key with quota', async () => {
      const data = {
        name: 'Test Key with Quota',
        presetRole: 'full_access',
        quotaLimit: 1000,
        quotaUnit: 'calls',
      };

      const result = await createApiKey(testTenantId, data);
      assert.equal(result.quotaLimit, 1000);
      assert.equal(result.quotaUnit, 'calls');
    });

    it('should reject creation without permissions', async () => {
      const data = {
        name: 'Test Key No Permissions',
      };

      await assert.rejects(createApiKey(testTenantId, data), /请选择权限/);
    });

    it('should reject creation with invalid expiration date', async () => {
      const pastDate = new Date(Date.now() - 1000);
      const data = {
        name: 'Test Key Invalid Expiration',
        presetRole: 'full_access',
        expiresAt: pastDate.toISOString(),
      };

      await assert.rejects(createApiKey(testTenantId, data), /过期时间必须大于当前时间/);
    });

    it('should respect max keys per tenant limit', async () => {
      for (let i = 0; i < MAX_KEYS_PER_TENANT; i++) {
        await createApiKey(testTenantId, {
          name: `Test Key ${i}`,
          presetRole: 'full_access',
        });
      }

      const data = {
        name: 'Test Key Over Limit',
        presetRole: 'full_access',
      };

      await assert.rejects(createApiKey(testTenantId, data), /最多创建/);
    });
  });

  describe('getApiKeyById', () => {
    it('should get API key by ID', async () => {
      const created = await createApiKey(testTenantId, {
        name: 'Test Key',
        presetRole: 'full_access',
      });

      const found = await getApiKeyById(created.id, testTenantId);
      assert.ok(found);
      assert.equal(found.id, created.id);
      assert.equal(found.name, created.name);
      assert.ok(!found.keyHash);
    });

    it('should return null for non-existent key', async () => {
      const found = await getApiKeyById(crypto.randomUUID(), testTenantId);
      assert.equal(found, null);
    });

    it('should return null for wrong tenant', async () => {
      const created = await createApiKey(testTenantId, {
        name: 'Test Key',
        presetRole: 'full_access',
      });

      const found = await getApiKeyById(created.id, crypto.randomUUID());
      assert.equal(found, null);
    });
  });

  describe('listApiKeys', () => {
    it('should list API keys for a tenant', async () => {
      for (let i = 0; i < 3; i++) {
        await createApiKey(testTenantId, {
          name: `Test Key ${i}`,
          presetRole: 'full_access',
        });
      }

      const result = await listApiKeys(testTenantId);
      assert.equal(result.total, 3);
      assert.equal(result.data.length, 3);
    });

    it('should filter by status', async () => {
      const key1 = await createApiKey(testTenantId, {
        name: 'Test Key 1',
        presetRole: 'full_access',
      });
      await createApiKey(testTenantId, {
        name: 'Test Key 2',
        presetRole: 'full_access',
      });

      await toggleApiKeyStatus(key1.id, testTenantId);

      const result = await listApiKeys(testTenantId, { status: 'disabled' });
      assert.equal(result.total, 1);
      assert.equal(result.data[0].id, key1.id);
    });
  });

  describe('updateApiKey', () => {
    it('should update API key name', async () => {
      const created = await createApiKey(testTenantId, {
        name: 'Original Name',
        presetRole: 'full_access',
      });

      const updated = await updateApiKey(created.id, testTenantId, {
        name: 'Updated Name',
      });

      assert.equal(updated.name, 'Updated Name');
    });

    it('should update API key permissions', async () => {
      const created = await createApiKey(testTenantId, {
        name: 'Test Key',
        presetRole: 'full_access',
      });

      const updated = await updateApiKey(created.id, testTenantId, {
        permissions: ['metering_event:write'],
      });

      assert.equal(updated.permissions.length, 1);
      assert.equal(updated.permissions[0].resource, 'metering_event');
      assert.equal(updated.permissions[0].action, 'write');
    });

    it('should update IP whitelist', async () => {
      const created = await createApiKey(testTenantId, {
        name: 'Test Key',
        presetRole: 'full_access',
      });

      const updated = await updateApiKey(created.id, testTenantId, {
        ipWhitelistEnabled: true,
        ipWhitelist: ['192.168.1.100'],
      });

      assert.equal(updated.ipWhitelists.length, 1);
      assert.equal(updated.ipWhitelists[0].ipOrCidr, '192.168.1.100');
    });
  });

  describe('toggleApiKeyStatus', () => {
    it('should toggle status from active to disabled', async () => {
      const created = await createApiKey(testTenantId, {
        name: 'Test Key',
        presetRole: 'full_access',
      });

      assert.equal(created.status, 'active');

      const result = await toggleApiKeyStatus(created.id, testTenantId);
      assert.equal(result.status, 'disabled');
    });

    it('should toggle status from disabled to active', async () => {
      const created = await createApiKey(testTenantId, {
        name: 'Test Key',
        presetRole: 'full_access',
      });

      await toggleApiKeyStatus(created.id, testTenantId);
      const result = await toggleApiKeyStatus(created.id, testTenantId);
      assert.equal(result.status, 'active');
    });
  });

  describe('deleteApiKey', () => {
    it('should delete an API key', async () => {
      const created = await createApiKey(testTenantId, {
        name: 'Test Key',
        presetRole: 'full_access',
      });

      const result = await deleteApiKey(created.id, testTenantId);
      assert.equal(result.success, true);

      const found = await getApiKeyById(created.id, testTenantId);
      assert.equal(found, null);
    });
  });

  describe('rotateApiKey', () => {
    it('should rotate an API key with grace period', async () => {
      const oldKey = await createApiKey(testTenantId, {
        name: 'Original Key',
        presetRole: 'full_access',
        ipWhitelist: ['192.168.1.1'],
      });

      const result = await rotateApiKey(oldKey.id, testTenantId, 24);

      assert.ok(result.newKey.id);
      assert.ok(result.newKey.fullKey);
      assert.equal(result.gracePeriodHours, 24);
      assert.ok(result.rotationExpiresAt);
      assert.notEqual(result.newKey.id, oldKey.id);
      assert.equal(result.newKey.name, 'Original Key (轮换)');
      assert.equal(result.newKey.permissions.length, oldKey.permissions.length);
      assert.equal(result.newKey.ipWhitelists.length, 1);

      const oldKeyUpdated = await getApiKeyById(oldKey.id, testTenantId);
      assert.equal(oldKeyUpdated.replacedByKeyId, result.newKey.id);
      assert.equal(oldKeyUpdated.rotationGracePeriod, 24);
    });

    it('should reject rotation with invalid grace period', async () => {
      const oldKey = await createApiKey(testTenantId, {
        name: 'Original Key',
        presetRole: 'full_access',
      });

      await assert.rejects(rotateApiKey(oldKey.id, testTenantId, 100), /宽限期必须在1-72小时之间/);
      await assert.rejects(rotateApiKey(oldKey.id, testTenantId, 0), /宽限期必须在1-72小时之间/);
    });
  });

  describe('verifyApiKey', () => {
    it('should verify a valid API key', async () => {
      const created = await createApiKey(testTenantId, {
        name: 'Test Key',
        presetRole: 'full_access',
      });

      const result = await verifyApiKey(created.fullKey, '127.0.0.1');
      assert.equal(result.valid, true);
      assert.ok(result.apiKey);
    });

    it('should verify a valid API key with correct permissions', async () => {
      const created = await createApiKey(testTenantId, {
        name: 'Test Key',
        presetRole: 'full_access',
      });

      const result = await verifyApiKey(created.fullKey, '127.0.0.1', 'metering_event', 'write');
      assert.equal(result.valid, true);
    });

    it('should reject an API key with incorrect permissions', async () => {
      const created = await createApiKey(testTenantId, {
        name: 'Test Key',
        presetRole: 'read_only',
      });

      const result = await verifyApiKey(created.fullKey, '127.0.0.1', 'metering_event', 'write');
      assert.equal(result.valid, false);
      assert.equal(result.reason, 'permission_denied');
    });

    it('should reject an API key with IP not in whitelist', async () => {
      const created = await createApiKey(testTenantId, {
        name: 'Test Key',
        presetRole: 'full_access',
        ipWhitelist: ['192.168.1.1'],
      });

      const result = await verifyApiKey(created.fullKey, '10.0.0.1');
      assert.equal(result.valid, false);
      assert.equal(result.reason, 'ip_denied');
    });

    it('should allow an API key with IP in whitelist', async () => {
      const created = await createApiKey(testTenantId, {
        name: 'Test Key',
        presetRole: 'full_access',
        ipWhitelist: ['192.168.1.0/24'],
      });

      const result = await verifyApiKey(created.fullKey, '192.168.1.100');
      assert.equal(result.valid, true);
    });

    it('should reject an invalid API key', async () => {
      const result = await verifyApiKey('sk_live_invalidkey1234567890', '127.0.0.1');
      assert.equal(result.valid, false);
      assert.equal(result.reason, 'invalid_key');
    });

    it('should reject a disabled API key', async () => {
      const created = await createApiKey(testTenantId, {
        name: 'Test Key',
        presetRole: 'full_access',
      });

      await toggleApiKeyStatus(created.id, testTenantId);

      const result = await verifyApiKey(created.fullKey, '127.0.0.1');
      assert.equal(result.valid, false);
      assert.equal(result.reason, 'disabled');
    });

    it('should reject an API key that exceeded quota', async () => {
      const created = await createApiKey(testTenantId, {
        name: 'Test Key',
        presetRole: 'full_access',
        quotaLimit: 1,
        quotaUnit: 'calls',
      });

      const key = await ApiKey.findByPk(created.id);
      key.quotaUsed = 1;
      await key.save();

      const result = await verifyApiKey(created.fullKey, '127.0.0.1');
      assert.equal(result.valid, false);
      assert.equal(result.reason, 'quota_exceeded');
    });
  });

  describe('checkApiKeyStatus', () => {
    it('should return valid for active key', async () => {
      const created = await createApiKey(testTenantId, {
        name: 'Test Key',
        presetRole: 'full_access',
      });

      const result = await checkApiKeyStatus(created);
      assert.equal(result.valid, true);
    });

    it('should return invalid for disabled key', async () => {
      const created = await createApiKey(testTenantId, {
        name: 'Test Key',
        presetRole: 'full_access',
      });

      await toggleApiKeyStatus(created.id, testTenantId);
      const updated = await getApiKeyById(created.id, testTenantId);

      const result = await checkApiKeyStatus(updated);
      assert.equal(result.valid, false);
      assert.equal(result.reason, 'disabled');
    });

    it('should return invalid for expired key', async () => {
      const pastDate = new Date(Date.now() - 1000);
      const key = {
        id: crypto.randomUUID(),
        status: 'active',
        expiresAt: pastDate,
      };

      const result = await checkApiKeyStatus(key);
      assert.equal(result.valid, false);
      assert.equal(result.reason, 'expired');
    });

    it('should return invalid for rotation expired key', async () => {
      const pastDate = new Date(Date.now() - 1000);
      const key = {
        id: crypto.randomUUID(),
        status: 'active',
        replacedByKeyId: crypto.randomUUID(),
        rotationExpiresAt: pastDate,
      };

      const result = await checkApiKeyStatus(key);
      assert.equal(result.valid, false);
      assert.equal(result.reason, 'rotation_expired');
    });
  });

  describe('isIpInWhitelist', () => {
    it('should return true for empty whitelist', () => {
      const result = isIpInWhitelist('127.0.0.1', []);
      assert.equal(result, true);
    });

    it('should return true for exact IP match', () => {
      const whitelist = [{ ipOrCidr: '192.168.1.1' }];
      const result = isIpInWhitelist('192.168.1.1', whitelist);
      assert.equal(result, true);
    });

    it('should return false for IP not in whitelist', () => {
      const whitelist = [{ ipOrCidr: '192.168.1.1' }];
      const result = isIpInWhitelist('192.168.1.2', whitelist);
      assert.equal(result, false);
    });

    it('should return true for IP in CIDR range', () => {
      const whitelist = [{ ipOrCidr: '192.168.1.0/24' }];
      const result = isIpInWhitelist('192.168.1.100', whitelist);
      assert.equal(result, true);
    });

    it('should return false for IP outside CIDR range', () => {
      const whitelist = [{ ipOrCidr: '192.168.1.0/24' }];
      const result = isIpInWhitelist('192.168.2.1', whitelist);
      assert.equal(result, false);
    });
  });

  describe('hashApiKey', () => {
    it('should generate consistent hash for same key', () => {
      const key = 'sk_live_testkey1234567890';
      const hash1 = hashApiKey(key);
      const hash2 = hashApiKey(key);
      assert.equal(hash1, hash2);
    });

    it('should generate different hashes for different keys', () => {
      const hash1 = hashApiKey('sk_live_key11234567890');
      const hash2 = hashApiKey('sk_live_key21234567890');
      assert.notEqual(hash1, hash2);
    });
  });
});
