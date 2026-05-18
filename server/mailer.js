const nodemailer = require('nodemailer');
const { Queue, Worker } = require('bullmq');
const config = require('./config');
const { generateOrderSummary } = require('./ai');
const { emailJobsAdded } = require('./metrics');

const IORedis = require('ioredis');

let transporter;

// BullMQ requires a specific IORedis instance with maxRetriesPerRequest: null
const redisConnection = new IORedis(config.redisUrl || 'redis://redis:6379', {
  maxRetriesPerRequest: null
});

// Create the BullMQ Job Queue backed by Redis
const emailQueue = new Queue('emailQueue', {
  connection: redisConnection
});

async function setupMailer() {
  try {
    const testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: "smtp.ethereal.email",
      port: 587,
      secure: false, 
      auth: { user: testAccount.user, pass: testAccount.pass },
    });
    console.log('[Mailer] Ethereal Email & BullMQ Queue configured.');
  } catch (err) {
    console.error('[Mailer] Failed to configure mailer:', err.message);
  }
}

// Background Worker that processes jobs from the queue asynchronously
const emailWorker = new Worker('emailQueue', async (job) => {
  const { order } = job.data;
  if (!transporter) throw new Error('Transporter not ready');

  // Simulate network jitter occasionally for realism
  if (Math.random() < 0.2) throw new Error('Simulated network drop');

  // 1. Generate natural language summary via Gemini AI
  const aiSummary = await generateOrderSummary(order);

  // 2. Send Email
  const info = await transporter.sendMail({
    from: '"PulseDB System" <system@pulsedb.local>',
    to: '"Admin" <admin@pulsedb.local>',
    subject: `[ALERT] Order Update: #${order.id} is now ${order.status}`,
    text: `✨ AI SUMMARY:
${aiSummary}

--- RAW DETAILS ---
Customer: ${order.customer_name}
Product: ${order.product_name}
Priority: ${order.priority}
Status: ${order.status}`,
  });
  
  console.log(`[Worker] Sent Email for #${order.id} | Preview: ${nodemailer.getTestMessageUrl(info)}`);
}, {
  connection: redisConnection
});

// Listeners for robust error tracking
emailWorker.on('failed', (job, err) => {
  console.error(`[Worker] Job ${job.id} failed (Attempt ${job.attemptsMade}): ${err.message}. Retrying soon...`);
});

async function sendOrderNotification(order) {
  if (order.priority !== 'High' && order.status !== 'delivered') return;
  
  emailJobsAdded.inc();
  
  // Non-blocking: We push the job to Redis and return instantly. 
  // BullMQ handles retries (exponential backoff) if it fails!
  await emailQueue.add('sendEmail', { order }, {
    attempts: 3, 
    backoff: { type: 'exponential', delay: 2000 }
  });
  console.log(`[Mailer] Added Job to Queue for Order #${order.id}`);
}

module.exports = { setupMailer, sendOrderNotification, emailQueue };
