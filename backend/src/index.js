import fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import dotenv from 'dotenv';
import cron from 'node-cron';
import { sequelize } from './models/index.js';
import { startEventBufferFlush } from './services/meteringEventService.js';
import { billingQueue } from './config/queue.js';
import { generateBillsForMonth } from './services/billingService.js';
import { cleanupOldAggregations } from './services/usageAggregationService.js';
import { evaluateAllTenants } from './services/alertRuleService.js';
import { checkExpiredCircuits } from './services/circuitBreakerService.js';
import { triggerAutoReconciliation } from './services/reconciliationService.js';
import { initReplaySocket, closeReplaySocket } from './websocket/replaySocket.js';

import authRoutes from './routes/auth.js';
import tenantRoutes from './routes/tenants.js';
import meteringRoutes from './routes/metering.js';
import ruleRoutes from './routes/rules.js';
import billingRoutes from './routes/billing.js';
import usageRoutes from './routes/usage.js';
import dashboardRoutes from './routes/dashboard.js';
import alertRoutes from './routes/alerts.js';
import reconciliationRoutes from './routes/reconciliation.js';

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
app.register(alertRoutes);
app.register(reconciliationRoutes, { prefix: '/api/reconciliation' });

let billingCronTimer = null;
let cleanupCronTimer = null;
let alertEvalTimer = null;
let circuitCheckTimer = null;
let reconciliationCronJob = null;

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

function scheduleAlertEvaluation() {
  alertEvalTimer = setInterval(async () => {
    try {
      const results = await evaluateAllTenants();
      const totalTriggered = results.reduce((sum, r) => sum + (r.triggered || 0), 0);
      if (totalTriggered > 0) {
        console.log(`Alert evaluation completed: ${totalTriggered} rules triggered`);
      }
    } catch (error) {
      console.error('Alert evaluation failed:', error);
    }
  }, 60 * 1000);
  console.log('Alert evaluation scheduler started');
}

function scheduleCircuitBreakerCheck() {
  circuitCheckTimer = setInterval(async () => {
    try {
      const result = await checkExpiredCircuits();
      if (result.transitioned > 0) {
        console.log(`Circuit breaker check: ${result.transitioned} circuits transitioned to half-open`);
      }
    } catch (error) {
      console.error('Circuit breaker check failed:', error);
    }
  }, 30 * 1000);
  console.log('Circuit breaker check scheduler started');
}

function scheduleDailyReconciliation() {
  reconciliationCronJob = cron.schedule('0 3 * * *', async () => {
    try {
      console.log('Starting daily auto-reconciliation at 03:00');
      const task = await triggerAutoReconciliation();
      console.log(`Auto-reconciliation task created: ${task.taskNo}`);
    } catch (error) {
      console.error('Daily auto-reconciliation failed:', error);
    }
  }, {
    timezone: 'Asia/Shanghai',
  });
  console.log('Daily reconciliation scheduler started (runs at 03:00 every day)');
}

const start = async () => {
  try {
    await sequelize.authenticate();
    console.log('Database connected successfully');

    const port = parseInt(process.env.PORT || '3000');
    
    app.addHook('onListen', () => {
      initReplaySocket(app.server);
      console.log('WebSocket server initialized for replay progress');
    });
    
    await app.listen({ port, host: '0.0.0.0' });
    console.log(`Server running on port ${port}`);

    startEventBufferFlush();
    console.log('Event buffer flush started');

    if (process.env.NODE_ENV === 'production') {
      scheduleMonthlyBilling();
      scheduleCleanup();
      scheduleAlertEvaluation();
      scheduleCircuitBreakerCheck();
      scheduleDailyReconciliation();
    } else {
      scheduleAlertEvaluation();
      scheduleCircuitBreakerCheck();
      scheduleDailyReconciliation();
    }

    process.on('SIGTERM', async () => {
      console.log('SIGTERM received, shutting down...');
      if (billingCronTimer) clearInterval(billingCronTimer);
      if (cleanupCronTimer) clearInterval(cleanupCronTimer);
      if (alertEvalTimer) clearInterval(alertEvalTimer);
      if (circuitCheckTimer) clearInterval(circuitCheckTimer);
      if (reconciliationCronJob) reconciliationCronJob.stop();
      closeReplaySocket();
      await app.close();
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      console.log('SIGINT received, shutting down...');
      if (billingCronTimer) clearInterval(billingCronTimer);
      if (cleanupCronTimer) clearInterval(cleanupCronTimer);
      if (alertEvalTimer) clearInterval(alertEvalTimer);
      if (circuitCheckTimer) clearInterval(circuitCheckTimer);
      if (reconciliationCronJob) reconciliationCronJob.stop();
      closeReplaySocket();
      await app.close();
      process.exit(0);
    });

  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
};

start();
