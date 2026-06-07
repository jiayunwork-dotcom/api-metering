import { sequelize, User } from '../models/index.js';
import crypto from 'crypto';
import { up as apiKeyMigrationUp } from './003_add_api_key_management.js';

async function runMigrations() {
  try {
    console.log('Starting database migration...');
    
    await sequelize.sync({ force: false });
    console.log('Database tables created/updated successfully');
    
    try {
      await apiKeyMigrationUp();
      console.log('API Key management migration completed');
    } catch (error) {
      console.warn('API Key migration may have already run:', error.message);
    }
    
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
