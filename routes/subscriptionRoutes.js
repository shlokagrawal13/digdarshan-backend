const express = require('express');
const router = express.Router();
const { createSubscription, getSubscriptions } = require('../controllers/subscriptionController');

// Create new subscription
router.post('/', createSubscription);

// Get all subscriptions
router.get('/', getSubscriptions);

module.exports = router;
