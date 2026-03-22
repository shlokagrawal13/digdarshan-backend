const mongoose = require('mongoose');

const viewSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  postId: { type: String, required: true },
  viewDate: { type: Date, default: Date.now },
  sessionId: { type: String, required: true }, // Track unique sessions
  viewDuration: { type: Number, default: 0 }, // Track view duration in seconds
  isUnique: { type: Boolean, default: true } // Track if it's first view of the day
});

// Compound indexes for performance
viewSchema.index({ postId: 1, sessionId: 1 });
viewSchema.index({ postId: 1, userId: 1, viewDate: 1 });

// Static method to handle view tracking
viewSchema.statics.handleView = async function(postId, userId, sessionId) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  try {
    // Check for existing view today
    const existingView = await this.findOne({
      postId,
      userId,
      viewDate: { $gte: today }
    });

    if (!existingView) {
      // Create new unique view
      await this.create({
        postId,
        userId,
        sessionId,
        isUnique: true
      });
    } else {
      // Create non-unique view with same session
      await this.create({
        postId,
        userId,
        sessionId,
        isUnique: false
      });
    }

    // Get view counts
    const [totalViews, uniqueViews] = await Promise.all([
      this.countDocuments({ postId }),
      this.countDocuments({ postId, isUnique: true })
    ]);

    return { totalViews, uniqueViews };
  } catch (error) {
    console.error('View tracking error:', error);
    throw error;
  }
};

module.exports = mongoose.model('View', viewSchema);
