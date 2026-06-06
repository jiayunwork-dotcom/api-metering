import fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import dotenv from 'dotenv';
import { sequelize } from './models/index.js';
import { startEventBufferFlush } from './services/meteringEventService.js';
import { billingQueue } from './config/queue.js';
import { generateBillsForMonth } from './services/billingService.js';
import { cleanupOldAggregations } from './services/usageAggregationService.js';

import authRoutes from './routes/auth.js';
import tenantRoutes from './routes/tenants.js';
import meteringRoutes from './routes/metering.js';
import ruleRoutes from './routes/rules.js';
import billingRoutes from './routes/billing.js';
import usageRoutes from './routes/usage.js';
import dashboardRoutes from './routes/dashboard.js';

dotenv.config();

const app = fastify({
  logger: process.env.NODE_ENV === 'development',
  bodyLimit: 10 * 1024 * 1024,
});

app.register(cors, {
  origin: true,
  credentials: true,
});

app.register(jwt, {
  secret: process.env.JWT_SECRET || 'default-secret-key-change-in-production',
});

app.decorate('authenticate', async (request, reply) => {
  try {
    await request.jwtVerify();
  } catch (err) {
    reply.status(401).send({ success: false, message: '未授权访问' });
  }
});

app.get('/health', async () => {
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
  };
});

app.register(authRoutes);
app.register(tenantRoutes);
app.register(meteringRoutes);
app.register(ruleRoutes);
app.register(billingRoutes);
app.register(usageRoutes);
app.register(dashboardRoutes);

let billingCronTimer = null;
let cleanupCronTimer = null;

function scheduleMonthlyBilling() {
  const checkBilling = () => {
    const now = new Date();
    if (now.getDate() === 1 && now.getHours() === 0 && now.getMinutes() < 10) {
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const monthKey = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;
      console.log(`Auto-generating bills for ${monthKey}`);
      generateBillsForMonth(monthKey).catch(console.error);
    }
  };

  billingCronTimer = setInterval(checkBilling, 5 * 60 * 1000);
  console.log('Monthly billing scheduler started');
}

function scheduleCleanup() {
  cleanupCronTimer = setInterval(() => {
    cleanupOldAggregations().catch(console.error);
  }, 24 * 60 * 60 * 1000);
  console.log('Aggregation cleanup scheduler started');
}

const start = async () => {
  try {
    await sequelize.authenticate();
    console.log('Database connected successfully');

    const port = parseInt(process.env.PORT || '3000');
    await app.listen({ port, host: '0.0.0.0' });
    console.log(`Server running on port ${port}`);

    startEventBufferFlush();
    console.log('Event buffer flush started');

    if (process.env.NODE_ENV === 'production') {
      scheduleMonthlyBilling();
      scheduleCleanup();
    }

    process.on('SIGTERM', async () => {
      console.log('SIGTERM received, shutting down...');
      if (billingCronTimer) clearInterval(billingCronTimer);
      if (cleanupCronTimer) clearInterval(cleanupCronTimer);
      await app.close();
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      console.log('SIGINT received, shutting down...');
      if (billingCronTimer) clearInterval(billingCronTimer);
      if (cleanupCronTimer) clearInterval(cleanupCronTimer);
      await app.close();
      process.exit(0);
    });

  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
};

start();
