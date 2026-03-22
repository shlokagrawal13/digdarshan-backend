const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const multer = require('multer');

let cloudinary;
try {
  cloudinary = require('cloudinary').v2;

  if (process.env.CLOUDINARY_CLOUD_NAME) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET
    });
  }
} catch (err) {
  console.warn('Cloudinary not configured, file upload will be disabled');
}

const axios = require('axios');

// Configure Email API Sender over HTTP using SendGrid
const sendEmailViaSendGrid = async (options) => {
  const { to, subject, html } = options;
  try {
    const apiKey = process.env.SENDGRID_API_KEY;
    if (!apiKey) {
      console.warn("SENDGRID_API_KEY missing. Email will not be sent.");
      return;
    }
    const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'shlokagrawal94@gmail.com';
    const response = await axios.post('https://api.sendgrid.com/v3/mail/send', {
      personalizations: [{ to: [{ email: to }] }],
      from: { email: fromEmail, name: "Digdarshan" },
      subject: subject,
      content: [{ type: "text/html", value: html }]
    }, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    return response.data;
  } catch (err) {
    // SendGrid nests error messages in err.response.data.errors array
    const errorDetails = err.response?.data?.errors?.[0]?.message || err.message;
    console.error('Email API Error:', errorDetails);
    
    // Directly forward the restriction reason to the client UI
    const newErr = new Error(errorDetails);
    newErr.isSendGridError = true;
    throw newErr;
  }
};

exports.me = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Get user response with image URL
    const userResponse = user.toJSON();
    res.json(userResponse);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: "Server error" });
  }
};

exports.register = async (req, res) => {
  try {
    // Normalize email to lowercase
    if (req.body.email) req.body.email = req.body.email.toLowerCase();
    const { name, email, password } = req.body;

    // Validate inputs
    if (!name || !email || !password) {
      return res.status(400).json({ error: "All fields are required" });
    }

    // Check if user exists and is unverified
    let user = await User.findOne({ email });
    if (user) {
      if (!user.isVerified) {
        // User exists but is unverified - allow re-registration
        // Delete old unverified account
        await User.findByIdAndDelete(user._id);
      } else {
        return res.status(400).json({ error: "Email already registered and verified" });
      }
    }

    // Generate verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const hashedPassword = await bcrypt.hash(password, 10);

    // In development, auto-verify users. In production, require email verification
    const isDevelopment = process.env.NODE_ENV !== 'production';

    user = await User.create({
      name,
      email,
      password: hashedPassword,
      verificationToken: isDevelopment ? undefined : crypto.randomBytes(32).toString('hex'),
      verificationExpires: isDevelopment ? undefined : Date.now() + 24 * 60 * 60 * 1000,
      isVerified: isDevelopment ? true : false  // Auto-verify in dev
    });

    // Generate token immediately after registration
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d" // Longer expiration
    });

    // Send verification email with backend URL (only in production)
    if (!isDevelopment) {
      const verificationUrl = `${process.env.BACKEND_URL}/api/auth/verify-email/${verificationToken}`;

      try {
        await sendEmailViaSendGrid({
          to: email,
          subject: 'Welcome to Webvarta - Verify your email',
          html: `
            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
              <h1 style="color: #1a365d;">Welcome to Webvarta!</h1>
              <p>Hi ${name},</p>
              <p>Thank you for registering with Webvarta. To complete your registration, please verify your email:</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${verificationUrl}" 
                   style="background-color: #3182ce; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px;">
                  Verify Email Address
                </a>
              </div>
              <p>This link will expire in 24 hours.</p>
            </div>
          `
        });

        res.status(201).json({
          message: "Registration successful! Please check your email to verify your account.",
          requiresVerification: true,
          token,
          user: {
            id: user._id,
            name: user.name,
            email: user.email
          }
        });
      } catch (emailError) {
        console.error('Email error:', emailError);
        await User.findByIdAndDelete(user._id);

        // Return detailed error if email fails (especially Resend domain verification errors)
        let errorMessage = "Failed to send verification email. Please try again.";
        if (emailError.isSendGridError) {
          errorMessage = `Email API Error: ${emailError.message}`;
        }

        return res.status(500).json({ error: errorMessage, details: emailError.message });
      }
    } else {
      // Development mode - auto-verified
      res.status(201).json({
        message: "Registration successful! You can now login.",
        requiresVerification: false,
        token,
        user: user.toJSON()
      });
    }
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: "Registration failed. Please try again." });
  }
};

exports.login = async (req, res) => {
  try {
    // Normalize email to lowercase
    if (req.body.email) req.body.email = req.body.email.toLowerCase();
    const { email, password } = req.body;
    let user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({ error: "No account found with this email. Please register first." });
    }

    // First check email verification
    if (!user.isVerified) {
      // If verification token exists and hasn't expired, tell user to check email
      if (user.verificationToken && user.verificationExpires > Date.now()) {
        return res.status(403).json({
          error: "Please verify your email first. Check your inbox for the verification link.",
          requiresVerification: true
        });
      }
      // If token expired, allow requesting new verification
      else {
        return res.status(403).json({
          error: "Email verification expired. Please request a new verification email.",
          requiresNewVerification: true
        });
      }
    }

    // Check password only after verifying email
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: "Invalid password. Please try again." });
    }

    // For admin logins, check approval status
    if (user.isAdmin && !user.adminApproved) {
      return res.status(403).json({
        error: "Your admin access request is pending approval. You'll receive an email when approved.",
        isPendingApproval: true
      });
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d"
    });

    // Remove sensitive data from response
    const userResponse = user.toJSON();
    delete userResponse.password;
    delete userResponse.verificationToken;
    delete userResponse.verificationExpires;

    res.json({
      message: "Login successful",
      token,
      user: userResponse
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: "Server error. Please try again later." });
  }
};

exports.completeProfile = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { phone, dob, address } = req.body;

    if (!phone || !dob || !address) {
      return res.status(400).json({ error: "All fields are required" });
    }

    let profileImageData = null;
    if (req.file) {
      profileImageData = {
        data: req.file.buffer,
        contentType: req.file.mimetype
      };
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      {
        $set: {
          phone,
          dob: new Date(dob),
          address,
          profileImage: profileImageData,
          profileCompleted: true
        }
      },
      { new: true }
    ).select('-password');

    const token = jwt.sign(
      { id: updatedUser._id, profileCompleted: true },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    // Get user response with image URL
    const userResponse = updatedUser.toJSON();

    res.json({
      message: "Profile completed successfully",
      token,
      user: userResponse
    });
  } catch (error) {
    console.error('Profile completion error:', error);
    res.status(500).json({ error: "Failed to update profile" });
  }
};

exports.verifyEmail = async (req, res) => {
  try {
    const { token } = req.params;

    // Find user with valid verification token
    const user = await User.findOne({
      verificationToken: token,
      verificationExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.send(`
        <html>
          <body style="font-family: Arial, sans-serif; background-color: #f3f4f6; margin: 0; padding: 40px;">
            <div style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); padding: 2rem;">
              <h1 style="color: #dc2626;">Invalid or Expired Link</h1>
              <p>The verification link is invalid or has expired. Please request a new verification email.</p>
              <div style="text-align: center; margin-top: 2rem;">
                <a href="${process.env.CLIENT_URL}/login" 
                   style="display: inline-block; background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 10px;">
                  Go to Login
                </a>
              </div>
            </div>
          </body>
        </html>
      `);
    }

    try {
      // Mark as verified first
      user.isVerified = true;
      user.verificationToken = undefined;
      user.verificationExpires = undefined;

      // If this is an admin verification, generate approval token
      if (user.isAdmin) {
        const approvalToken = crypto.randomBytes(32).toString('hex');
        user.approvalToken = approvalToken;
        user.approvalTokenExpires = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days expiry
      }

      // Save the changes first
      await user.save();

      // If admin, send owner email and admin confirmation
      if (user.isAdmin) {
        // Get the owner's email
        const ownerEmail = process.env.OWNER_EMAIL;
        if (!ownerEmail) {
          throw new Error('Owner email not configured');
        }

        // Send notification email to owner about pending approval
        await sendEmailViaSendGrid({
          to: ownerEmail,
          subject: 'New Admin Approval Request - Digdarshan',
          html: `
            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
              <h1 style="color: #1a365d;">New Admin Approval Request</h1>
              <p>Hello,</p>
              <p>A new admin approval request has been received for Digdarshan:</p>
              <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <p style="margin: 5px 0;"><strong>Name:</strong> ${user.name}</p>
                <p style="margin: 5px 0;"><strong>Email:</strong> ${user.email}</p>
                <p style="margin: 5px 0;"><strong>Reason:</strong> ${user.adminReason}</p>
              </div>
              <p>Please review the request and click the button below to approve or deny access:</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${process.env.BACKEND_URL}/api/auth/admin/approve-by-email/${user.approvalToken}" target="_self" style="background-color: #059669; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin-right: 10px; display:inline-block;">Approve Access</a>
                <a href="${process.env.BACKEND_URL}/api/auth/admin/deny-by-email/${user.approvalToken}" target="_self" style="background-color: #dc2626; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display:inline-block;">Deny Access</a>
              </div>
              <p style="color: #6b7280; font-size: 0.9em;">This approval link will expire in 7 days.</p>
            </div>
          `
        });

        // Send confirmation email to admin
        await sendEmailViaSendGrid({
          to: user.email,
          subject: 'Digdarshan Admin Request - Email Verified',
          html: `
            <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
              <h1 style="color: #1a365d;">Email Verification Successful</h1>
              <p>Dear ${user.name},</p>
              <p>Your email has been successfully verified! 🎉</p>
              <p style="background-color: #f3f4f6; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <strong>Next Steps:</strong><br>
                Your admin access request is now pending approval from the Digdarshan owner. You will receive another email once your request is reviewed.
              </p>
              <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <p style="margin: 0;"><strong>Status:</strong> Awaiting Owner Approval</p>
                <p style="margin: 10px 0 0 0;"><strong>Reason provided:</strong> ${user.adminReason}</p>
              </div>
              <p>The owner will review your request as soon as possible. You will receive an email with their decision.</p>
            </div>
          `
        });
      } else {
        // For regular users, send verification success email
        await sendEmailViaSendGrid({
          to: user.email,
          subject: 'Digdarshan - Email Verified',
          html: `
            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
              <h1 style="color: #1a365d;">Email Verified Successfully!</h1>
              <p>Hi ${user.name},</p>
              <p>Your email has been successfully verified. You can now log in to Webvarta.</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${process.env.CLIENT_URL}/login" 
                   style="background-color: #059669; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">
                  Go to Login
                </a>
              </div>
            </div>
          `
        });
      }

      // Return appropriate verification success page
      const approvalStatus = !user.isAdmin
        ? 'You can now log in to your account.'
        : 'Your request has been sent to the owner for approval. You will receive an email once it\'s reviewed.';

      const statusColor = user.isAdmin ? '#2563eb' : '#059669';
      const buttonText = user.isAdmin ? 'Check Status' : 'Go to Login';
      const buttonUrl = user.isAdmin ? `${process.env.ADMIN_URL || 'https://digdarshanadmin.vercel.app'}/admin/login` : `${process.env.CLIENT_URL}/login`;

      return res.send(`
        <html>
          <body style="font-family: Arial, sans-serif; background-color: #f3f4f6; margin: 0; padding: 40px;">
            <div style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); padding: 2rem;">
              <h2 style="color: ${statusColor}; text-align: center;">Email Verified Successfully!</h2>
              <p style="color: #4b5563; text-align: center; margin-bottom: 20px;">
                ${approvalStatus}
              </p>
              <div style="text-align: center;">
                <a href="${buttonUrl}" 
                   style="display: inline-block; background-color: ${statusColor}; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px;">
                  ${buttonText}
                </a>
              </div>
            </div>
          </body>
        </html>
      `);
    } catch (innerError) {
      // If there's an error during the email sending or saving process
      console.error('Verification process error:', innerError);

      // Try to revert the changes if possible
      if (user.isModified()) {
        user.isVerified = false;
        user.verificationToken = token;
        user.verificationExpires = Date.now() + 24 * 60 * 60 * 1000;
        try {
          await user.save();
        } catch (revertError) {
          console.error('Failed to revert user changes:', revertError);
        }
      }

      throw innerError; // Re-throw to be caught by outer catch block
    }
  } catch (error) {
    console.error('Email verification error:', error);
    return res.status(500).send(`
      <html>
        <body style="font-family: Arial, sans-serif; background-color: #f3f4f6; margin: 0; padding: 40px;">
          <div style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); padding: 2rem;">
            <h1 style="color: #dc2626;">Verification Failed</h1>
            <p>Sorry, we couldn't verify your email. Please try again or contact support.</p>
            <p style="color: #6b7280; font-size: 0.9em;">Error: ${error.message || 'An unexpected error occurred'}</p>
            <div style="text-align: center; margin-top: 2rem;">
              <a href="${process.env.CLIENT_URL}/support" 
                 style="display: inline-block; background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 10px;">
                Contact Support
              </a>
            </div>
          </div>
        </body>
      </html>
    `);
  }
};

// Handle admin registration requests
exports.adminRegister = async (req, res) => {
  try {
    // Normalize email to lowercase
    if (req.body.email) req.body.email = req.body.email.toLowerCase();
    const { name, email, password, adminReason } = req.body;

    if (!name || !email || !password || !adminReason) {
      return res.status(400).json({ error: "All fields including admin reason are required" });
    }

    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ error: "Email already registered" });
    }

    // Generate verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const hashedPassword = await bcrypt.hash(password, 10);

    user = await User.create({
      name,
      email,
      password: hashedPassword,
      verificationToken,
      verificationExpires: Date.now() + 24 * 60 * 60 * 1000,
      isVerified: false,
      role: 'admin',
      isAdmin: true,
      adminReason,
      adminApproved: false
    });

    // Send verification email
    const verificationUrl = `${process.env.BACKEND_URL}/api/auth/verify-email/${verificationToken}`;

    try {
      await sendEmailViaSendGrid({
        to: email,
        subject: 'Digdarshan Admin Registration - Verify your email',
        html: `
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #1a365d;">Digdarshan Admin Registration</h1>
            <p>Hi ${name},</p>
            <p>Thank you for registering as an admin with Digdarshan. Please verify your email:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${verificationUrl}" 
                 style="background-color: #3182ce; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px;">
                Verify Email Address
              </a>
            </div>
            <p>After email verification, your admin access request will be reviewed by the owner.</p>
            <p>This verification link will expire in 24 hours.</p>
          </div>
        `
      });

      res.status(201).json({
        message: "Admin registration submitted! Please verify your email. Your request will be reviewed by the owner.",
        requiresVerification: true
      });
    } catch (emailError) {
      console.error('Email error:', emailError);
      await User.findByIdAndDelete(user._id);

      let errorMessage = "Failed to send verification email. Please try again.";
      if (emailError.isSendGridError) {
        errorMessage = `Email API Error: ${emailError.message}`;
      }
      return res.status(500).json({ error: errorMessage, details: emailError.message });
    }
  } catch (error) {
    console.error('Admin registration error:', error);
    res.status(500).json({ error: "Registration failed. Please try again." });
  }
};

// Handle admin approval
exports.approveAdmin = async (req, res) => {
  try {
    const { userId } = req.params;
    const adminUser = await User.findById(req.user.id);

    // Check if the approver is an approved admin
    if (!adminUser.isAdmin || !adminUser.adminApproved) {
      return res.status(403).json({ error: "Only approved admins can approve other admins" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (!user.isAdmin || user.adminApproved) {
      return res.status(400).json({ error: "Invalid approval request" });
    }

    user.adminApproved = true;
    user.approvedBy = req.user.id;
    user.approvedAt = new Date();
    await user.save();

    // Send approval email
    await sendEmailViaSendGrid({
      to: user.email,
      subject: 'Digdarshan Admin Access Approved',
      html: `
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #1a365d;">Admin Access Approved</h1>
          <p>Hi ${user.name},</p>
          <p>Your admin access request for Digdarshan has been approved. You can now log in to the admin dashboard.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.ADMIN_URL}/admin/login" 
               style="background-color: #3182ce; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px;">
              Go to Admin Login
            </a>
          </div>
        </div>
      `
    });

    res.json({ message: "Admin access approved successfully" });
  } catch (error) {
    console.error('Admin approval error:', error);
    res.status(500).json({ error: "Failed to approve admin access" });
  }
};

// Get admin users list
exports.listAdmins = async (req, res) => {
  try {
    const currentUser = await User.findById(req.user.id);
    if (!currentUser.isAdmin || !currentUser.adminApproved) {
      return res.status(403).json({ error: "Only approved admins can view admin list" });
    }

    // Get pending admin requests
    const pendingAdmins = await User.find({
      isAdmin: true,
      adminApproved: false
    }).select('-password');

    // Get approved admins
    const approvedAdmins = await User.find({
      isAdmin: true,
      adminApproved: true
    })
      .populate('approvedBy', 'name email')
      .select('-password');

    // Get revoked admins (was admin, now revoked)
    const revokedAdmins = await User.find({
      role: 'admin',
      isAdmin: false,
      adminApproved: false
    }).select('-password');

    res.json({ pending: pendingAdmins, approved: approvedAdmins, revoked: revokedAdmins });
  } catch (error) {
    console.error('List admins error:', error);
    res.status(500).json({ error: "Failed to fetch admin list" });
  }
};

// Revoke admin access
exports.revokeAdmin = async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUser = await User.findById(req.user.id);

    // Check if the revoker is an approved admin
    if (!currentUser.isAdmin || !currentUser.adminApproved) {
      return res.status(403).json({ error: "Only approved admins can revoke admin access" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (!user.isAdmin || !user.adminApproved) {
      return res.status(400).json({ error: "Invalid revocation request" });
    }

    // Don't allow revoking your own access
    if (user._id.toString() === currentUser._id.toString()) {
      return res.status(400).json({ error: "Cannot revoke your own admin access" });
    }

    user.isAdmin = false;
    user.adminApproved = false;
    user.approvedBy = undefined;
    user.approvedAt = undefined;
    await user.save();

    // Send revocation email
    await sendEmailViaSendGrid({
      to: user.email,
      subject: 'Digdarshan Admin Access Revoked',
      html: `
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #1a365d;">Admin Access Revoked</h1>
          <p>Hi ${user.name},</p>
          <p>Your admin access to Digdarshan has been revoked. If you think this is a mistake, please contact the administrator.</p>
        </div>
      `
    });

    return res.json({ message: "Admin access revoked successfully" });
  } catch (error) {
    console.error('Admin revocation error:', error);
    return res.status(500).json({ error: "Failed to revoke admin access" });
  }
};

// Re-approve a revoked admin
exports.reapproveAdmin = async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUser = await User.findById(req.user.id);

    // Only approved admins can re-approve
    if (!currentUser.isAdmin || !currentUser.adminApproved) {
      return res.status(403).json({ error: "Only approved admins can re-approve admin access" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Only allow re-approval if user was previously an admin but is currently not approved
    if (!user.isAdmin && !user.adminApproved) {
      user.isAdmin = true;
      user.adminApproved = true;
      user.approvedBy = currentUser._id;
      user.approvedAt = new Date();
      await user.save();

      // Send re-approval email
      await sendEmailViaSendGrid({
        to: user.email,
        subject: 'Digdarshan Admin Access Restored',
        html: `
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #059669;">Admin Access Restored</h1>
            <p>Hi ${user.name},</p>
            <p>Your admin access to Digdarshan has been restored. You can now log in to the admin dashboard again.</p>
          </div>
        `
      });

      return res.json({ message: "Admin access restored successfully" });
    } else {
      return res.status(400).json({ error: "User is already an approved admin or not eligible for re-approval" });
    }
  } catch (error) {
    console.error('Admin re-approval error:', error);
    return res.status(500).json({ error: "Failed to restore admin access" });
  }
};

// Verify admin token and access
exports.verifyAdmin = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user || !user.isAdmin || !user.adminApproved) {
      return res.json({ success: false });
    }

    res.json({ success: true, user: user });
  } catch (error) {
    console.error('Admin verification error:', error);
    res.status(500).json({ success: false, error: "Verification failed" });
  }
};

// Admin-specific login endpoint
exports.adminLogin = async (req, res) => {
  try {
    // Normalize email to lowercase
    if (req.body.email) req.body.email = req.body.email.toLowerCase();
    const { email, password } = req.body;
    let user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    // Check if user is an admin
    if (!user.isAdmin) {
      return res.status(403).json({ error: "Access denied. Admin privileges required." });
    }

    // Check if admin is approved
    if (!user.adminApproved) {
      return res.status(403).json({ error: "Your admin access request is pending approval." });
    }

    // Check if email is verified
    if (!user.isVerified) {
      return res.status(403).json({ error: "Please verify your email first" });
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    // Generate token with admin flag
    const token = jwt.sign(
      {
        id: user._id,
        isAdmin: true,
        adminApproved: true
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    // Remove sensitive data from response
    const userResponse = user.toJSON();
    delete userResponse.password;
    delete userResponse.verificationToken;
    delete userResponse.verificationExpires;

    res.json({
      message: "Admin login successful",
      token,
      user: userResponse
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ error: "Server error" });
  }
};

// Handle email-based admin approval
exports.approveAdminByEmail = async (req, res) => {
  try {
    const { token } = req.params;
    const user = await User.findOne({
      approvalToken: token,
      approvalTokenExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.send(`
        <html>
          <body style="font-family: Arial, sans-serif; background-color: #f3f4f6; margin: 0; padding: 40px;">
            <div style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); padding: 2rem;">
              <h1 style="color: #dc2626;">Invalid or Expired Link</h1>
              <p>The approval link is invalid or has expired.</p>
            </div>
          </body>
        </html>
      `);
    }

    user.adminApproved = true;
    user.approvalToken = undefined;
    user.approvalTokenExpires = undefined;
    user.approvedAt = new Date();
    await user.save();

    // Send approval email to admin
    await sendEmailViaSendGrid({
      to: user.email,
      subject: 'Digdarshan Admin Access Approved',
      html: `
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #1a365d;">Admin Access Approved!</h1>
          <p>Hi ${user.name},</p>
          <p>Your admin access request for Digdarshan has been approved. You can now log in to the admin dashboard.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.ADMIN_URL}/admin/login" 
               style="background-color: #059669; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px;">
              Go to Admin Dashboard
            </a>
          </div>
        </div>
      `
    });

    return res.send(`
      <html>
        <body style="font-family: Arial, sans-serif; background-color: #f3f4f6; margin: 0; padding: 40px;">
          <div style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); padding: 2rem;">
            <h1 style="color: #059669;">Admin Access Approved</h1>
            <p>You have successfully approved admin access for ${user.email}.</p>
            <p>They will receive an email with instructions to access the admin dashboard.</p>
          </div>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('Admin email approval error:', error);
    return res.status(500).send(`
      <html>
        <body style="font-family: Arial, sans-serif; background-color: #f3f4f6; margin: 0; padding: 40px;">
          <div style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); padding: 2rem;">
            <h1 style="color: #dc2626;">Approval Failed</h1>
            <p>Sorry, we couldn't process the admin approval. Please try again or contact support.</p>
          </div>
        </body>
      </html>
    `);
  }
};

// Handle email-based admin denial
exports.denyAdminByEmail = async (req, res) => {
  try {
    const { token } = req.params;
    const user = await User.findOne({
      approvalToken: token,
      approvalTokenExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.send(`
        <html>
          <body style="font-family: Arial, sans-serif; background-color: #f3f4f6; margin: 0; padding: 40px;">
            <div style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); padding: 2rem;">
              <h1 style="color: #dc2626;">Invalid or Expired Link</h1>
              <p>The denial link is invalid or has expired.</p>
            </div>
          </body>
        </html>
      `);
    }

    // Reset admin status
    user.isAdmin = false;
    user.adminApproved = false;
    user.approvalToken = undefined;
    user.approvalTokenExpires = undefined;
    await user.save();

    // Send denial email
    await sendEmailViaSendGrid({
      to: user.email,
      subject: 'Digdarshan Admin Access Request - Not Approved',
      html: `
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #1a365d;">Admin Access Request Update</h1>
          <p>Hi ${user.name},</p>
          <p>We regret to inform you that your admin access request for Digdarshan has not been approved at this time.</p>
          <p>If you believe this is a mistake or would like to submit another request in the future, please contact support.</p>
        </div>
      `
    });

    return res.send(`
      <html>
        <body style="font-family: Arial, sans-serif; background-color: #f3f4f6; margin: 0; padding: 40px;">
          <div style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); padding: 2rem;">
            <h1 style="color: #dc2626;">Admin Access Denied</h1>
            <p>You have denied admin access for ${user.email}.</p>
            <p>They will receive an email notification about this decision.</p>
          </div>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('Admin email denial error:', error);
    return res.status(500).send(`
      <html>
        <body style="font-family: Arial, sans-serif; background-color: #f3f4f6; margin: 0; padding: 40px;">
          <div style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); padding: 2rem;">
            <h1 style="color: #dc2626;">Operation Failed</h1>
            <p>Sorry, we couldn't process the admin denial. Please try again or contact support.</p>
          </div>
        </body>
      </html>
    `);
  }
};
