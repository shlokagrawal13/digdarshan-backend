const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const multer = require('multer');
const rateLimit = require("express-rate-limit");

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

// Configure nodemailer
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Rate Limiting for Login Attempts
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 login attempts per windowMs
  message: { error: "Too many login attempts, please try again later." }
});

// Multer Configuration for Image Upload
const upload = multer({ storage: multer.memoryStorage() });

exports.me = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json(user);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: "Server error" });
  }
};

exports.register = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: "All fields are required" });
    }

    let user = await User.findOne({ email });
    if (user) {
      if (!user.isVerified) {
        await User.findByIdAndDelete(user._id);
      } else {
        return res.status(400).json({ error: "Email already registered and verified" });
      }
    }

    const verificationToken = crypto.randomBytes(32).toString('hex');
    const hashedPassword = await bcrypt.hash(password, 10);

    user = await User.create({ 
      name, email, password: hashedPassword, 
      verificationToken, verificationExpires: Date.now() + 24*60*60*1000, 
      isVerified: false 
    });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" });

    const verificationUrl = `${process.env.BACKEND_URL}}/api/auth/verify-email/${verificationToken}`;
    
    try {
      await transporter.sendMail({
        to: email,
        subject: 'Welcome to Digdarshan - Verify your email',
        html: `<p>Hi ${name}, verify your email: <a href="${verificationUrl}">Verify Email</a></p>`
      });

      res.status(201).json({ message: "Registration successful! Check your email.", token });
    } catch (emailError) {
      await User.findByIdAndDelete(user._id);
      return res.status(500).json({ error: "Failed to send verification email." });
    }
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: "Registration failed." });
  }
};

exports.login = [loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    let user = await User.findOne({ email });

    if (!user || !await bcrypt.compare(password, user.password)) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    if (!user.isVerified) {
      return res.status(403).json({ error: "Please verify your email first" });
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" });

    res.json({ message: "Login successful", token, user });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
}];

exports.resetPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) return res.status(404).json({ error: "User not found" });

    const resetToken = crypto.randomBytes(32).toString("hex");
    user.resetToken = resetToken;
    user.resetTokenExpires = Date.now() + 3600000;
    await user.save();

    const resetUrl = `${process.env.CLIENT_URL}/reset-password/${resetToken}`;
    await transporter.sendMail({
      to: email,
      subject: "Password Reset Request",
      html: `<p>Click <a href="${resetUrl}">here</a> to reset your password.</p>`
    });

    res.json({ message: "Password reset link sent to email." });
  } catch (error) {
    res.status(500).json({ error: "Error sending reset email." });
  }
};

exports.approveAdminByEmail = async (req, res) => {
  const { token } = req.params;
  try {
    const user = await User.findOne({ 
      where: { 
        emailVerificationToken: token, 
        emailVerificationTokenExpires: { [Op.gt]: new Date() } 
      } 
    });

    if (!user) {
      return res.status(404).json({ error: "Invalid or expired token" });
    }

    user.isVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationTokenExpires = undefined;
    await user.save();

    res.json({ message: "Email verified successfully, you can now log in." });
  } catch (error) {
    console.error('Error approving admin by email:', error);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.denyAdminByEmail = async (req, res) => {
  const { token } = req.params;
  try {
    const user = await User.findOne({ 
      where: { 
        emailVerificationToken: token, 
        emailVerificationTokenExpires: { [Op.gt]: new Date() } 
      } 
    });

    if (!user) {
      return res.status(404).json({ error: "Invalid or expired token" });
    }

    user.emailVerificationToken = undefined;
    user.emailVerificationTokenExpires = undefined;
    await user.save();

    res.json({ message: "Email verification denied. You can register again if this was a mistake." });
  } catch (error) {
    console.error('Error denying admin by email:', error);
    res.status(500).json({ error: "Internal server error" });
  }
};
