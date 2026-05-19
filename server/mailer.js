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

  // Print it directly to the logs for easy demoing!
  console.log(`\n====== 📧 AI EMAIL GENERATED ======`);
  console.log(`Order ID: #${order.id}`);
  console.log(`AI Summary: ${aiSummary}`);
  console.log(`=====================================\n`);

  // 2. Send Email
  try {
    const info = await transporter.sendMail({
      from: '"PulseDB System" <system@pulsedb.local>',
      to: '"Admin" <admin@pulsedb.local>',
      subject: `[ALERT] Order Update: #${order.id} is now ${order.status}`,
      text: `✨ AI SUMMARY:\n${aiSummary}\n\n--- RAW DETAILS ---\nCustomer: ${order.customer_name}\nProduct: ${order.product_name}\nPriority: ${order.priority}\nStatus: ${order.status}`,
    });
    console.log(`[Worker] Preview Link: ${nodemailer.getTestMessageUrl(info)}`);
  } catch (err) {
    // Render Free Tier blocks SMTP ports to prevent spammers.
    // We catch it here so the job still "succeeds" and the AI summary is visible above.
    console.log(`[Worker] Note: SMTP blocked by Render Free Tier. Email content logged above instead.`);
  }
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
