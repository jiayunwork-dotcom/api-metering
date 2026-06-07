import sequelize from '../config/database.js';
import { QueryTypes } from 'sequelize';

export async function up() {
  const transaction = await sequelize.transaction();

  try {
    console.log('Checking and creating prerequisite tables...');

    await sequelize.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_tenants_status') THEN
          CREATE TYPE enum_tenants_status AS ENUM ('active', 'disabled');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_api_keys_status') THEN
          CREATE TYPE enum_api_keys_status AS ENUM ('active', 'disabled', 'expired', 'deleted');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_api_key_permissions_resource') THEN
          CREATE TYPE enum_api_key_permissions_resource AS ENUM ('metering_event', 'usage_query', 'billing_view', 'rule_management', 'tenant_info', 'api_key_management');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_api_key_permissions_action') THEN
          CREATE TYPE enum_api_key_permissions_action AS ENUM ('read', 'write');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_api_key_ip_whitelists_ip_type') THEN
          CREATE TYPE enum_api_key_ip_whitelists_ip_type AS ENUM ('ipv4', 'ipv6');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_api_key_access_logs_access_type') THEN
          CREATE TYPE enum_api_key_access_logs_access_type AS ENUM ('success', 'denied_invalid_key', 'denied_expired', 'denied_ip', 'denied_permission', 'denied_quota', 'denied_disabled');
        END IF;
      END $$;
    `, { transaction });

    const tenantsExists = await sequelize.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'tenants'
      )
    `, { type: QueryTypes.SELECT, transaction });

    if (!tenantsExists[0].exists) {
      console.log('Creating tenants table...');
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS tenants (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(100) NOT NULL,
          code VARCHAR(50) NOT NULL UNIQUE,
          status enum_tenants_status NOT NULL DEFAULT 'active',
          contact_email VARCHAR(100) NOT NULL,
          contact_phone VARCHAR(20),
          contact_name VARCHAR(50),
          company_name VARCHAR(200),
          tax_number VARCHAR(50),
          address TEXT,
          discount_rate DECIMAL(5,4) DEFAULT 0,
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          deleted_at TIMESTAMP
        );
      `, { transaction });
      console.log('tenants table created');
    } else {
      console.log('tenants table already exists');
    }

    const apiInterfacesExists = await sequelize.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'api_interfaces'
      )
    `, { type: QueryTypes.SELECT, transaction });

    if (!apiInterfacesExists[0].exists) {
      console.log('Creating api_interfaces table...');
      await sequelize.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_api_interfaces_status') THEN
            CREATE TYPE enum_api_interfaces_status AS ENUM ('active', 'inactive');
          END IF;
        END $$;
      `, { transaction });

      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS api_interfaces (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(100) NOT NULL,
          path VARCHAR(200) NOT NULL,
          method VARCHAR(10) NOT NULL DEFAULT 'POST',
          description TEXT,
          status enum_api_interfaces_status NOT NULL DEFAULT 'active',
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          deleted_at TIMESTAMP,
          UNIQUE(path, method)
        );
      `, { transaction });
      console.log('api_interfaces table created');
    } else {
      console.log('api_interfaces table already exists');
    }

    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id),
        name VARCHAR(100) NOT NULL,
        key_prefix VARCHAR(16) NOT NULL,
        key_hash VARCHAR(128) NOT NULL UNIQUE,
        status enum_api_keys_status NOT NULL DEFAULT 'active',
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
        resource enum_api_key_permissions_resource NOT NULL,
        action enum_api_key_permissions_action NOT NULL,
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
        ip_type enum_api_key_ip_whitelists_ip_type NOT NULL DEFAULT 'ipv4',
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
        access_type enum_api_key_access_logs_access_type NOT NULL,
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
