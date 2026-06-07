import Bull from 'bull';
import dotenv from 'dotenv';

dotenv.config();

const redisConfig = {
  redis: process.env.REDIS_URL,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
  },
};

export const eventPersistenceQueue = new Bull('event-persistence', redisConfig);
export const aggregationQueue = new Bull('aggregation', redisConfig);
export const notificationQueue = new Bull('notification', redisConfig);
export const emailQueue = new Bull('email', redisConfig);
export const billingQueue = new Bull('billing', redisConfig);
export const reconciliationQueue = new Bull('reconciliation', redisConfig);
export const replayQueue = new Bull('event-replay', redisConfig);
export const alertQueue = new Bull('reconciliation-alert', redisConfig);
export const approvalQueue = new Bull('reconciliation-approval', redisConfig);

eventPersistenceQueue.on('failed', (job, err) => {
  console.error(`Event persistence job ${job.id} failed:`, err.message);
});

aggregationQueue.on('failed', (job, err) => {
  console.error(`Aggregation job ${job.id} failed:`, err.message);
});

notificationQueue.on('failed', (job, err) => {
  console.error(`Notification job ${job.id} failed:`, err.message);
});

emailQueue.on('failed', (job, err) => {
  console.error(`Email job ${job.id} failed:`, err.message);
});

billingQueue.on('failed', (job, err) => {
  console.error(`Billing job ${job.id} failed:`, err.message);
});

reconciliationQueue.on('failed', (job, err) => {
  console.error(`Reconciliation job ${job.id} failed:`, err.message);
});

replayQueue.on('failed', (job, err) => {
  console.error(`Event replay job ${job.id} failed:`, err.message);
});

alertQueue.on('failed', (job, err) => {
  console.error(`Alert job ${job.id} failed:`, err.message);
});

approvalQueue.on('failed', (job, err) => {
  console.error(`Approval job ${job.id} failed:`, err.message);
});

export default {
  eventPersistenceQueue,
  aggregationQueue,
  notificationQueue,
  emailQueue,
  billingQueue,
  reconciliationQueue,
  replayQueue,
  alertQueue,
  approvalQueue,
};
