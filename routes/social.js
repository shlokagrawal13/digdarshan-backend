const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const authMiddleware = require('../middleware/auth');
const { socialActionsQueue } = require('../config/bull');
const redis = require('../config/redis');
const Like = require('../models/Like');
const Comment = require('../models/Comment');
const View = require('../models/View');
const BadWords = require('bad-words');
const filter = new BadWords();

// Utility function to build nested comment tree
const buildCommentTree = (comments) => {
  // Create a map of comments by their ID for quick lookup
  const commentMap = new Map();
  const topLevelComments = [];

  // First pass: create a map of all comments
  comments.forEach(comment => {
    commentMap.set(comment._id.toString(), {
      ...comment.toObject(),
      replies: []
    });
  });

  // Second pass: build the tree structure
  comments.forEach(comment => {
    const commentObj = commentMap.get(comment._id.toString());
    
    if (comment.parentId) {
      // This is a reply - add it to parent's replies array
      const parentComment = commentMap.get(comment.parentId.toString());
      if (parentComment) {
        parentComment.replies.push(commentObj);
      }
    } else {
      // This is a top-level comment
      topLevelComments.push(commentObj);
    }
  });

  return topLevelComments;
};

// Rate limiters
const likeLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50 // 50 likes per 15 minutes
});

const commentLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20 // 20 comments per 15 minutes
});

// Like/Unlike a post
router.post('/:postId/like', [authMiddleware, likeLimit], async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user.id;
    const io = req.app.get('io');

    const existingLike = await Like.findOne({ userId, postId });
    
    if (existingLike) {
      await Like.deleteOne({ userId, postId });
      const newCount = await Like.countDocuments({ postId });
      
      await redis.hdel(`post:${postId}:likes`, userId);
      await redis.hset(`post:${postId}`, 'likeCount', newCount.toString());

      io.to(`post:${postId}`).emit('likeUpdate', {
        postId,
        count: newCount,
        action: 'unlike'
      });
      
      return res.json({ success: true, action: 'unlike', count: newCount, hasLiked: false });
    }

    const newLike = await Like.create({ userId, postId });
    const newCount = await Like.countDocuments({ postId });
    
    await redis.hset(`post:${postId}:likes`, userId, '1');
    await redis.hset(`post:${postId}`, 'likeCount', newCount.toString());

    io.to(`post:${postId}`).emit('likeUpdate', { postId, count: newCount, action: 'like' });
    
    res.json({ success: true, action: 'like', count: newCount, hasLiked: true });
  } catch (error) {
    console.error('Like error:', error);
    res.status(500).json({ message: 'Failed to update like status' });
  }
});

// Add new endpoint to check like status
router.get('/:postId/like/status', authMiddleware, async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user.id;

    const existingLike = await Like.findOne({ userId, postId });
    const count = await Like.countDocuments({ postId });

    res.json({
      hasLiked: !!existingLike,
      count
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to get like status' });
  }
});

// Enhanced comment handling with profanity filter
router.post('/:postId/comment', [authMiddleware, commentLimit], async (req, res) => {
  try {
    const { postId } = req.params;
    let { content } = req.body;
    const userId = req.user.id;
    const io = req.app.get('io');    const { name, email, website, parentId } = req.body;

    if (!content?.trim() || !name || !email) {
      return res.status(400).json({ message: 'Comment content, name and email are required' });
    }

    // Clean content
    content = filter.clean(content.trim());

    // Spam check - prevent duplicate comments in short time
    const recentCommentKey = `recent:comment:${userId}:${postId}`;
    const canComment = await redis.set(recentCommentKey, '1', 'NX', 'EX', 30);
    if (!canComment) {
      return res.status(429).json({ message: 'Please wait before commenting again' });
    }

    // If this is a reply, verify parent comment exists
    if (parentId) {
      const parentComment = await Comment.findById(parentId);
      if (!parentComment) {
        return res.status(404).json({ message: 'Parent comment not found' });
      }
    }    const comment = await Comment.create({ 
      userId, 
      postId, 
      content,
      name,
      email,
      website,
      parentId
    });

    // If this is a reply, update parent comment's replies array
    if (parentId) {
      await Comment.findByIdAndUpdate(parentId, {
        $push: { replies: comment._id }
      });
    }    // Populate the comment and its parent
    let populatedComment = await Comment.findById(comment._id).populate([
      {
        path: 'userId',
        select: 'name profileImage'
      }
    ]);    // If this is a reply, get the parent comment with all its replies
    if (parentId) {
      const parentComment = await Comment.findById(parentId).populate([
        {
          path: 'userId',
          select: 'name profileImage'
        },
        {
          path: 'replies',
          populate: {
            path: 'userId',
            select: 'name profileImage'
          }
        }
      ]);

      if (!parentComment) {
        return res.status(404).json({ message: 'Parent comment not found' });
      }

      populatedComment = { ...populatedComment.toObject(), parentComment };
    }

    // Structure the comment data for socket emission
    const commentData = {
      comment: {
        ...populatedComment,
        _id: populatedComment._id.toString(),
        userId: populatedComment.userId?._id?.toString(),
        parentId: parentId?.toString(),
        createdAt: populatedComment.createdAt.toISOString(),
      },
      parentId: parentId?.toString()
    };

    // Notify clients in the post's room
    const postRoom = `post:${postId}`;
    const roomClients = await io.in(postRoom).allSockets();
    
    if (roomClients.size > 0) {
      io.to(postRoom).emit('newComment', commentData);
      console.log(`Emitted newComment to ${roomClients.size} clients in room ${postRoom}`);
    }

    res.json({
      success: true,
      comment: populatedComment,
      totalComments: await Comment.countDocuments({ postId })
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Add authentication middleware for views
router.post('/:postId/view', authMiddleware, async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user.id;
    const { sessionId } = req.body; // Get session ID from client

    // Validate session ID
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Session ID required'
      });
    }

    // Record view with session tracking
    const { totalViews, uniqueViews } = await View.handleView(postId, userId, sessionId);

    // Cache in Redis
    const multi = redis.multi();
    multi.hset(`post:${postId}`, 'totalViews', totalViews.toString());
    multi.hset(`post:${postId}`, 'uniqueViews', uniqueViews.toString());
    await multi.exec();

    // Emit real-time update
    const io = req.app.get('io');
    io.to(`post:${postId}`).emit('viewUpdate', {
      postId,
      totalViews,
      uniqueViews
    });

    res.json({
      success: true,
      totalViews,
      uniqueViews
    });

  } catch (error) {
    console.error('View error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Update the social route to handle Redis errors better
router.post('/:postId/view', authMiddleware, async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user.id;
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Session ID required'
      });
    }

    // Record view first
    const result = await View.handleView(postId, userId, sessionId);

    // Try to update Redis cache, but don't fail if Redis fails
    try {
      const multi = redis.multi();
      multi.hset(`post:${postId}`, 'totalViews', result.totalViews.toString());
      multi.hset(`post:${postId}`, 'uniqueViews', result.uniqueViews.toString());
      await multi.exec();
    } catch (redisError) {
      console.warn('Redis cache update failed:', redisError);
      // Continue without Redis cache
    }

    // Emit socket event
    const io = req.app.get('io');
    io.to(`post:${postId}`).emit('viewUpdate', {
      postId,
      ...result
    });

    res.json({
      success: true,
      ...result
    });

  } catch (error) {
    console.error('View error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to record view'
    });
  }
});

// Get post stats - with MongoDB fallback
router.get('/:postId/stats', async (req, res) => {
  try {
    const { postId } = req.params;
    let likeCount = 0;
    let viewCount = 0;
    let comments = [];

    try {
      // Try Redis first
      [likeCount, viewCount] = await Promise.all([
        redis.hget(`post:${postId}`, 'likeCount'),
        redis.hget(`post:${postId}`, 'viewCount')
      ]);
      comments = await redis.lrange(`post:${postId}:comments`, 0, 9);
    } catch (redisErr) {
      // Fallback to MongoDB
      [likeCount, viewCount, comments] = await Promise.all([
        Like.countDocuments({ postId }),
        View.countDocuments({ postId }),
        Comment.find({ postId }).sort('-createdAt').limit(10)
      ]);
    }
    
    res.json({
      likeCount: parseInt(likeCount) || 0,
      viewCount: parseInt(viewCount) || 0,
      comments: Array.isArray(comments) ? comments : [],
      totalViews: parseInt(viewCount) || 0,
      uniqueViews: await View.countDocuments({ postId, isUnique: true })
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get post's comments with replies
router.get('/:postId/comments', async (req, res) => {
  try {
    const { postId } = req.params;
    
    // Fetch all comments for the post
    const allComments = await Comment.find({ postId })
      .populate('userId', 'name profileImage')
      .sort('-createdAt');

    // Transform flat array into nested tree
    const commentTree = buildCommentTree(allComments);

    res.json({
      success: true,
      comments: commentTree
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;