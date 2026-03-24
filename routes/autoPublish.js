const express = require('express');
const router = express.Router();
const scheduler = require('../jobs/newsScheduler');

// Optional: You can import your existing authMiddleware here to protect these endpoints
// const adminAuth = require('../middleware/adminAuth');
// router.use(adminAuth);

router.get('/settings', (req, res) => {
    res.json(scheduler.getSettings());
});

router.put('/settings', (req, res) => {
    const updated = scheduler.updateSettings(req.body);
    res.json(updated);
});

router.post('/start', (req, res) => {
    scheduler.startScheduler();
    res.json({ success: true, message: 'Scheduler started', settings: scheduler.getSettings() });
});

router.post('/stop', (req, res) => {
    scheduler.stopScheduler();
    res.json({ success: true, message: 'Scheduler stopped', settings: scheduler.getSettings() });
});

router.post('/run-now', async (req, res) => {
    try {
        // Runs async in background to avoid timeout
        scheduler.runNewsJob();
        res.json({ success: true, message: 'Batch run initiated in background' });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

router.get('/logs', (req, res) => {
    res.json(scheduler.getSettings().logs);
});

module.exports = router;
