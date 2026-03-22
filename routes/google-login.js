const express = require('express');
const router = express.Router();
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const jwt = require('jsonwebtoken');
const User = require('../models/User');

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_REDIRECT_URI,
    passReqToCallback: true
  },
  async (req, accessToken, refreshToken, profile, done) => {
    try {
      let user = await User.findOne({ email: profile.emails[0].value });
      
      if (!user) {
        user = await User.create({
          name: profile.displayName,
          email: profile.emails[0].value,
          password: 'google-auth-' + Math.random().toString(36).slice(-8),
          isVerified: true,
          profileImage: profile.photos[0].value,
          googleId: profile.id
        });
      }

      return done(null, user);
    } catch (error) {
      return done(error, null);
    }
  }
));

router.post('/', async (req, res) => {
  try {
    const { name, email, profilePic } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    let user = await User.findOne({ email });
    if (!user) {
      user = await User.create({
        name: name || email.split('@')[0],
        email,
        password: 'google-auth-' + Math.random().toString(36).slice(-8),
        isVerified: true,
        profileImage: profilePic || null,
        profileCompleted: false, // Set to false initially
        authProvider: 'google'
      });
    }

    const token = jwt.sign(
      { id: user._id, isVerified: true, profileCompleted: user.profileCompleted }, 
      process.env.JWT_SECRET, 
      { expiresIn: '7d' }
    );

    const userResponse = user.toJSON();
    delete userResponse.password;

    // Add requiresProfile flag
    const requiresProfile = !user.profileCompleted;
    res.status(200).json({ token, user: userResponse, requiresProfile });
  } catch (error) {
    console.error('Google auth error:', error);
    res.status(500).json({ error: 'Authentication failed', details: error.message });
  }
});

module.exports = router;
