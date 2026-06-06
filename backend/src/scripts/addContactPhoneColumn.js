import sequelize from '../config/database.js';
import { QueryTypes } from 'sequelize';

async function addContactPhoneColumn() {
  console.log('Checking if contactPhone column exists...');

  try {
    const columns = await sequelize.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'tenants' AND column_name = 'contactPhone'",
      { type: QueryTypes.SELECT }
    );

    if (columns.length > 0) {
      console.log('✅ contactPhone column already exists, skipping');
      process.exit(0);
    }

    console.log('Adding contactPhone column to tenants table...');
    
    await sequelize.query(`
      ALTER TABLE tenants 
      ADD COLUMN "contactPhone" VARCHAR(20)
    `);

    console.log('✅ contactPhone column added successfully');

    const existingRows = await sequelize.query(
      "SELECT COUNT(*) as count FROM tenants WHERE \"contactPhone\" IS NULL OR \"contactPhone\" = ''",
      { type: QueryTypes.SELECT }
    );

    if (existingRows[0].count > 0) {
      console.log(`ℹ️  Found ${existingRows[0].count} rows with empty contactPhone, they will use NULL value`);
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to add contactPhone column:', error.message);
    
    if (error.message.includes('already exists')) {
      console.log('ℹ️  Column already exists, this is safe to ignore');
      process.exit(0);
    }
    
    process.exit(1);
  }
}

addContactPhoneColumn();
