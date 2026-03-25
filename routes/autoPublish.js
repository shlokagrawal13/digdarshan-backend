const express = require('express');
const router = express.Router();
const scheduler = require('../jobs/newsScheduler');

// Optional: You can import your existing authMiddleware here to protect these endpoints
// const adminAuth = require('../middleware/adminAuth');
// router.use(adminAuth);

router.get('/settings', async (req, res) => {
    try {
        const settings = await scheduler.getSettings();
        res.json(settings);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.put('/settings', async (req, res) => {
    try {
        const updated = await scheduler.updateSettings(req.body);
        res.json(updated);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/start', async (req, res) => {
    try {
        await scheduler.startScheduler();
        const settings = await scheduler.getSettings();
        res.json({ success: true, message: 'Scheduler started', settings });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/stop', async (req, res) => {
    try {
        await scheduler.stopScheduler();
        const settings = await scheduler.getSettings();
        res.json({ success: true, message: 'Scheduler stopped', settings });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
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

router.get('/logs', async (req, res) => {
    try {
        const settings = await scheduler.getSettings();
        res.json(settings.logs || []);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
