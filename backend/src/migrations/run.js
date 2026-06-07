import { sequelize, User } from '../models/index.js';
import crypto from 'crypto';
import { up as apiKeyMigrationUp } from './003_add_api_key_management.js';

async function runMigrations() {
  try {
    console.log('Starting database migration...');
    
    console.log('Step 1: Sync base tables (tenants, api_interfaces, etc.)...');
    await sequelize.sync({ force: false, alter: false });
    console.log('Base tables synced successfully');
    
    console.log('Step 2: Run API Key management migration...');
    try {
      await apiKeyMigrationUp();
      console.log('API Key management migration completed');
    } catch (error) {
      if (error.message.includes('already exists') || error.message.includes('duplicate') || error.message.includes('does not exist')) {
        console.warn('API Key migration may have already run or partial:', error.message);
      } else {
        console.error('API Key migration failed:', error);
        throw error;
      }
    }
    
    console.log('Step 3: Final sync for indexes and constraints...');
    await sequelize.sync({ force: false, alter: false });
    console.log('Database tables created/updated successfully');
    
    const adminCount = await User.count({ where: { username: 'admin' } });
    if (adminCount === 0) {
      const passwordHash = crypto.createHash('sha256').update('admin123').digest('hex');
      await User.create({
        username: 'admin',
        password: passwordHash,
        name: '系统管理员',
        email: 'admin@example.com',
        role: 'admin',
        status: 'active',
      });
      console.log('Default admin user created: admin/admin123');
    }
    
    console.log('Migration completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

runMigrations();
