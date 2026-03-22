const Subscription = require('../models/Subscription');

exports.createSubscription = async (req, res) => {
  try {
    const {
      dateTime,
      newspaperName,
      firstName,
      lastName,
      phone,
      email,
      designation,
      website,
      serviceAddress,
      purpose,
      frequency,
      circulation,
      rniNo,
      abcCertificate,
      contactPerson
    } = req.body;

    // Validate required fields
    if (!dateTime || !newspaperName || !firstName || !lastName || !phone || !email || !serviceAddress || !purpose || !frequency || !circulation) {
      return res.status(400).json({ error: 'All required fields must be provided' });
    }

    // Create new subscription
    const subscription = new Subscription({
      dateTime,
      newspaperName,
      firstName,
      lastName,
      phone,
      email,
      designation,
      website,
      serviceAddress,
      purpose,
      frequency,
      circulation,
      rniNo,
      abcCertificate,
      contactPerson
    });

    await subscription.save();

    res.status(201).json({
      success: true,
      message: 'Subscription created successfully',
      data: subscription
    });
    
  } catch (error) {
    console.error('Subscription error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to create subscription'
    });
  }
};

exports.getSubscriptions = async (req, res) => {
  try {
    const subscriptions = await Subscription.find().sort('-createdAt');
    res.json({ subscriptions });
  } catch (error) {
    console.error('Get subscriptions error:', error);
    res.status(500).json({ error: 'Failed to fetch subscriptions' });
  }
};
