const express = require("express");
const multer = require('multer');
const { 
    register, 
    login, 
    verifyEmail, 
    completeProfile,
    me,
    adminLogin,    // Admin-specific login
    adminRegister, // Admin-specific registration
    approveAdmin,  // Approve admin requests
    listAdmins,    // List admin users
    revokeAdmin,   // Revoke admin access
    verifyAdmin,   // Verify admin session
    approveAdminByEmail,  // Add new email-based approval handlers
    denyAdminByEmail,
    reapproveAdmin // Re-approve admin access
} = require("../controllers/authController");
const authMiddleware = require("../middleware/auth");
const adminAuth = require("../middleware/adminAuth"); // Import adminAuth middleware

const router = express.Router();

// 🔹 Multer for file uploads (Profile Image)
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 1024 * 1024 // 1MB limit
  }
});

// Admin Email Approval Routes (No auth required as these are email links)
router.get("/admin/approve-by-email/:token", approveAdminByEmail);
router.get("/admin/deny-by-email/:token", denyAdminByEmail);

// Admin Routes
router.post("/admin/login", adminLogin);  // Admin-specific login
router.post("/admin/register", adminRegister);  // Admin-specific registration
router.get("/admin/verify", authMiddleware, verifyAdmin);  // Verify admin session
router.get("/admin/list", authMiddleware, adminAuth, listAdmins);  // List all admins
router.post("/admin/approve/:userId", authMiddleware, adminAuth, approveAdmin);  // Approve admin request
router.post("/admin/revoke/:userId", authMiddleware, adminAuth, revokeAdmin);  // Revoke admin access
router.post("/admin/reapprove/:userId", authMiddleware, adminAuth, reapproveAdmin); // Re-approve admin access

// 🔹 Regular User Authentication Routes
router.post("/register", register);
router.post("/login", login);
router.get("/verify-email/:token", verifyEmail);
router.post("/complete-profile", authMiddleware, upload.single('profileImage'), completeProfile);
router.get("/me", authMiddleware, me); 

// 🔹 Google Login Route (Include Google Login)
const googleAuthRouter = require("./google-login"); 
router.use("/google-login", googleAuthRouter);  // Changed path to match frontend request

module.exports = router;
