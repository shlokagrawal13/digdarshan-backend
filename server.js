require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require("express-rate-limit");
const connectDB = require('./config/db');
const authRoutes = require('./routes/auth');
const newsRoutes = require('./routes/newsRoutes');
const socialRoutes = require('./routes/social');
const subscriptionRoutes = require('./routes/subscriptionRoutes');
const redis = require('./config/redis');
const http = require('http');
const socketIO = require('socket.io');

connectDB();

const app = express();

// Add this instead
app.set('trust proxy', ['loopback', 'linklocal', 'uniquelocal']);

// Update IP middleware
app.use((req, res, next) => {
  const realIp = req.ip || 
                 req.headers['x-real-ip'] || 
                 req.headers['x-forwarded-for']?.split(',')[0] || 
                 req.socket.remoteAddress?.replace(/^.*:/, '') || 
                 '127.0.0.1';
                 
  req.realIp = realIp;
  next();
});

// Security Middleware
app.use(cors({
  origin: [process.env.CLIENT_URL, process.env.ADMIN_URL, 'http://localhost:3000', 'http://localhost:3001'].filter(Boolean),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Cross-Origin-Opener-Policy']
}));

app.use(helmet({
  crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" }
}));

app.use(compression());
app.use(express.json());
app.use(morgan('dev'));

// Rate Limiting
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Increased limit
  message: "Too many auth attempts, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

const newsLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 500, // Increased limit for news requests
  message: "Too many news requests, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000 // Increased general limit
});

// Apply rate limiting selectively
app.use("/api/auth/google-login", authLimiter);
app.use("/api/auth/login", authLimiter);
app.use("/api/news", newsLimiter);
app.use("/api", generalLimiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/news', newsRoutes);
app.use('/api/social', socialRoutes);
app.use('/api/subscriptions', subscriptionRoutes);

app.get("/", (req, res) => {
    res.send("API is running...");
});

const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: [process.env.CLIENT_URL, process.env.ADMIN_URL, 'http://localhost:3000', 'http://localhost:3001'].filter(Boolean),
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Socket.io connection handler with improved room management
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  // Track which posts this socket is subscribed to
  const subscribedPosts = new Set();

  socket.on('joinPost', (postId) => {
    if (postId) {
      const roomName = `post:${postId}`;
      socket.join(roomName);
      subscribedPosts.add(postId);
      console.log(`Client ${socket.id} joined room ${roomName}`);
    }
  });

  socket.on('leavePost', (postId) => {
    if (postId) {
      const roomName = `post:${postId}`;
      socket.leave(roomName);
      subscribedPosts.delete(postId);
      console.log(`Client ${socket.id} left room ${roomName}`);
    }
  });

  socket.on('disconnect', () => {
    // Cleanup - leave all rooms this socket was in
    subscribedPosts.forEach(postId => {
      const roomName = `post:${postId}`;
      socket.leave(roomName);
      console.log(`Cleanup: Client ${socket.id} removed from room ${roomName}`);
    });
    subscribedPosts.clear();
    console.log('Client disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Backend Running at http://localhost:${PORT}`);
});
app.set('io', io); // Make io accessible to routes
