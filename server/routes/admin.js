const express = require('express');
const { emailQueue } = require('../mailer');

const router = express.Router();

// Get all jobs in the Dead Letter Queue (Failed state after all retries)
router.get('/dlq', async (req, res) => {
  try {
    const failedJobs = await emailQueue.getFailed();
    const formattedJobs = failedJobs.map(job => ({
      id: job.id,
      name: job.name,
      data: job.data,
      failedReason: job.failedReason,
      timestamp: job.timestamp
    }));
    res.json({ success: true, count: formattedJobs.length, jobs: formattedJobs });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Replay a specific job from the DLQ
router.post('/dlq/:id/replay', async (req, res) => {
  try {
    const job = await emailQueue.getJob(req.params.id);
    if (!job) return res.status(404).json({ success: false, error: 'Job not found' });
    
    await job.retry();
    res.json({ success: true, message: `Job ${job.id} re-queued successfully` });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Retry all failed jobs
router.post('/dlq/replay-all', async (req, res) => {
  try {
    const failedJobs = await emailQueue.getFailed();
    const promises = failedJobs.map(job => job.retry());
    await Promise.all(promises);
    res.json({ success: true, message: `Re-queued ${promises.length} jobs` });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
