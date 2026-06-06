import { sequelize, User, Tenant, ApiInterface, MeteringRule, Quota } from '../models/index.js';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

const initDB = async () => {
  console.log('Starting database initialization...');

  try {
    await sequelize.sync({ alter: true });
    console.log('Database tables created/updated');

    const existingAdmin = await User.findOne({ where: { username: 'admin' } });
    if (!existingAdmin) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await User.create({
        id: uuidv4(),
        username: 'admin',
        password: hashedPassword,
        role: 'admin',
        name: '系统管理员',
        email: 'admin@example.com',
      });
      console.log('Admin user created: admin/admin123');
    } else {
      console.log('Admin user already exists');
    }

    const demoTenant = await Tenant.findOne({ where: { code: 'DEMO001' } });
    if (!demoTenant) {
      const tenant = await Tenant.create({
        id: uuidv4(),
        code: 'DEMO001',
        name: '演示租户',
        status: 'active',
        contactEmail: 'demo@example.com',
        contactPhone: '13800138000',
        address: '北京市朝阳区',
        companyName: '演示科技有限公司',
        taxNumber: '91110000MA00000000',
        bankName: '中国工商银行',
        bankAccount: '6222020000000000000',
        discountRate: 0.9,
      });
      console.log('Demo tenant created:', tenant.code);

      const apis = [
        { id: uuidv4(), name: '用户查询接口', path: '/api/v1/users', method: 'GET', description: '查询用户信息' },
        { id: uuidv4(), name: '订单创建接口', path: '/api/v1/orders', method: 'POST', description: '创建订单' },
        { id: uuidv4(), name: '数据导出接口', path: '/api/v1/export', method: 'GET', description: '导出数据' },
      ];

      for (const api of apis) {
        await ApiInterface.create(api);
        console.log('API created:', api.name);
      }

      const allApis = await ApiInterface.findAll();
      const now = new Date();
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

      for (const api of allApis) {
        await MeteringRule.create({
          id: uuidv4(),
          apiInterfaceId: api.id,
          effectiveFrom: nextMonth,
          dimensions: [
            {
              name: 'call_count',
              enabled: true,
              unitPrice: 0.01,
              tieredPricing: [
                { start: 0, end: 10000, unitPrice: 0.01 },
                { start: 10000, end: 100000, unitPrice: 0.008 },
                { start: 100000, end: null, unitPrice: 0.005 },
              ],
            },
            {
              name: 'data_transfer',
              enabled: true,
              unitPrice: 0.5,
              tieredPricing: [],
            },
            {
              name: 'compute_time',
              enabled: false,
              unitPrice: 0.1,
              tieredPricing: [],
            },
          ],
          status: 'active',
          createdBy: 'system',
        });
        console.log('Metering rule created for API:', api.name);
      }

      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      await Quota.create({
        id: uuidv4(),
        tenantId: tenant.id,
        apiInterfaceId: null,
        month,
        type: 'free_quota',
        dimension: 'call_count',
        limitAmount: 1000,
        usedAmount: 0,
        status: 'active',
      });

      await Quota.create({
        id: uuidv4(),
        tenantId: tenant.id,
        apiInterfaceId: null,
        month,
        type: 'package_quota',
        dimension: 'call_count',
        limitAmount: 10000,
        usedAmount: 0,
        status: 'active',
      });

      await Quota.create({
        id: uuidv4(),
        tenantId: tenant.id,
        apiInterfaceId: null,
        month,
        type: 'hard_limit',
        dimension: 'call_count',
        limitAmount: 100000,
        usedAmount: 0,
        status: 'active',
      });
      console.log('Quotas created for demo tenant');
    }

    console.log('Database initialization completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Database initialization failed:', error);
    process.exit(1);
  }
};

initDB();
