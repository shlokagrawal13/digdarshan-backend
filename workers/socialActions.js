const { socialActionsQueue } = require('../config/bull');
const Like = require('../models/Like');
const Comment = require('../models/Comment');
const View = require('../models/View');

socialActionsQueue.process('like', async (job) => {
  const { userId, postId } = job.data;
  await Like.create({ userId, postId });
});

socialActionsQueue.process('comment', async (job) => {
  const { userId, postId, content } = job.data;
  await Comment.create({ userId, postId, content });
});

socialActionsQueue.process('view', async (job) => {
  const { userId, postId } = job.data;
  await View.create({ userId, postId });
});

// Setup batch processing every 5 minutes
setInterval(async () => {
  // Sync Redis counts with MongoDB
  // ...implementation...
}, 5 * 60 * 1000);