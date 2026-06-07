import sequelize from '../config/database.js';
import { QueryTypes } from 'sequelize';

export async function up() {
  const transaction = await sequelize.transaction();

  try {
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id),
        name VARCHAR(100) NOT NULL,
        key_prefix VARCHAR(16) NOT NULL,
        key_hash VARCHAR(128) NOT NULL UNIQUE,
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        expires_at TIMESTAMP,
        last_used_at TIMESTAMP,
        rotation_grace_period INTEGER,
        rotation_expires_at TIMESTAMP,
        replaced_by_key_id UUID REFERENCES api_keys(id),
        quota_limit BIGINT,
        quota_used BIGINT DEFAULT 0,
        quota_unit VARCHAR(20),
        ip_whitelist_enabled BOOLEAN DEFAULT true,
        created_by UUID,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP
      );
    `, { transaction });

    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_api_key_tenant ON api_keys(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_api_key_hash ON api_keys(key_hash);
      CREATE INDEX IF NOT EXISTS idx_api_key_status ON api_keys(status);
      CREATE INDEX IF NOT EXISTS idx_api_key_expires ON api_keys(expires_at);
      CREATE INDEX IF NOT EXISTS idx_api_key_rotation_expires ON api_keys(rotation_expires_at);
      CREATE INDEX IF NOT EXISTS idx_api_key_tenant_status ON api_keys(tenant_id, status);
    `, { transaction });

    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS api_key_permissions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        api_key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
        resource VARCHAR(50) NOT NULL,
        action VARCHAR(20) NOT NULL,
        created_by UUID,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(api_key_id, resource, action)
      );
    `, { transaction });

    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_api_key_permission_key ON api_key_permissions(api_key_id);
      CREATE INDEX IF NOT EXISTS idx_api_key_permission_resource_action ON api_key_permissions(resource, action);
    `, { transaction });

    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS api_key_ip_whitelists (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        api_key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
        ip_or_cidr VARCHAR(50) NOT NULL,
        ip_type VARCHAR(10) NOT NULL DEFAULT 'ipv4',
        comment VARCHAR(200),
        created_by UUID,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(api_key_id, ip_or_cidr)
      );
    `, { transaction });

    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_ip_whitelist_key ON api_key_ip_whitelists(api_key_id);
      CREATE INDEX IF NOT EXISTS idx_ip_whitelist_ip ON api_key_ip_whitelists(ip_or_cidr);
    `, { transaction });

    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS api_key_access_logs (
        id BIGSERIAL PRIMARY KEY,
        api_key_id UUID REFERENCES api_keys(id),
        tenant_id UUID,
        key_prefix VARCHAR(16),
        access_type VARCHAR(50) NOT NULL,
        resource VARCHAR(50),
        action VARCHAR(20),
        ip_address VARCHAR(45),
        user_agent VARCHAR(500),
        request_path VARCHAR(500),
        request_method VARCHAR(10),
        denied_reason VARCHAR(500),
        timestamp TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        metadata JSONB DEFAULT '{}'
      );
    `, { transaction });

    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_access_log_key ON api_key_access_logs(api_key_id);
      CREATE INDEX IF NOT EXISTS idx_access_log_tenant ON api_key_access_logs(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_access_log_type ON api_key_access_logs(access_type);
      CREATE INDEX IF NOT EXISTS idx_access_log_timestamp ON api_key_access_logs(timestamp);
      CREATE INDEX IF NOT EXISTS idx_access_log_tenant_timestamp ON api_key_access_logs(tenant_id, timestamp);
      CREATE INDEX IF NOT EXISTS idx_access_log_key_timestamp ON api_key_access_logs(api_key_id, timestamp);
    `, { transaction });

    const columns = await sequelize.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'metering_events' 
      AND column_name = 'api_key_id'
    `, { type: QueryTypes.SELECT, transaction });

    if (columns.length === 0) {
      await sequelize.query(`
        ALTER TABLE metering_events 
        ADD COLUMN api_key_id UUID REFERENCES api_keys(id);
      `, { transaction });

      await sequelize.query(`
        CREATE INDEX IF NOT EXISTS idx_event_api_key ON metering_events(api_key_id);
        CREATE INDEX IF NOT EXISTS idx_event_tenant_api_key_month ON metering_events(tenant_id, api_key_id, month);
      `, { transaction });
    }

    await transaction.commit();
    console.log('API Key management tables created successfully');
  } catch (error) {
    await transaction.rollback();
    console.error('Migration failed:', error);
    throw error;
  }
}

export async function down() {
  const transaction = await sequelize.transaction();

  try {
    await sequelize.query(`
      DROP INDEX IF EXISTS idx_event_tenant_api_key_month;
      DROP INDEX IF EXISTS idx_event_api_key;
      ALTER TABLE metering_events DROP COLUMN IF EXISTS api_key_id;
    `, { transaction });

    await sequelize.query(`DROP TABLE IF EXISTS api_key_access_logs CASCADE`, { transaction });
    await sequelize.query(`DROP TABLE IF EXISTS api_key_ip_whitelists CASCADE`, { transaction });
    await sequelize.query(`DROP TABLE IF EXISTS api_key_permissions CASCADE`, { transaction });
    await sequelize.query(`DROP TABLE IF EXISTS api_keys CASCADE`, { transaction });

    await transaction.commit();
    console.log('API Key management tables dropped successfully');
  } catch (error) {
    await transaction.rollback();
    console.error('Rollback failed:', error);
    throw error;
  }
}

export default { up, down };
