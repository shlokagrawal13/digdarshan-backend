const User = require("../models/User");

const adminAuth = async (req, res, next) => {
  try {
    // First verify if user is authenticated
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: "Authentication required" });
    }

    // Get user and check admin status
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    // For routes that require owner access
    if (req.path.includes('/approve/') || req.path.includes('/revoke/')) {
      // Check if the email matches the owner's email
      if (user.email !== process.env.OWNER_EMAIL) {
        return res.status(403).json({ error: "Only the owner can approve or revoke admin access" });
      }
    }
    
    // For other admin routes, check normal admin access
    if (!user.isAdmin || !user.adminApproved) {
      return res.status(403).json({ error: "Admin access required" });
    }

    next();
  } catch (error) {
    console.error('Admin auth middleware error:', error);
    res.status(500).json({ error: "Server error" });
  }
};

module.exports = adminAuth;
