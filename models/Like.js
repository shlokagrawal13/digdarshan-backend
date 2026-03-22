const mongoose = require('mongoose');

const likeSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  postId: { type: mongoose.Schema.Types.ObjectId, required: true },
  createdAt: { type: Date, default: Date.now }
});

// Compound index for efficient queries and to prevent duplicate likes
likeSchema.index({ userId: 1, postId: 1 }, { unique: true });

likeSchema.statics.toggleLike = async function(userId, postId) {
  const session = await this.startSession();
  session.startTransaction();

  try {
    const existingLike = await this.findOne({ userId, postId }).session(session);
    
    if (existingLike) {
      await this.deleteOne({ userId, postId }).session(session);
      const count = await this.countDocuments({ postId }).session(session);
      await session.commitTransaction();
      return { action: 'unlike', count };
    }

    await this.create([{ userId, postId }], { session });
    const count = await this.countDocuments({ postId }).session(session);
    await session.commitTransaction();
    return { action: 'like', count };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

module.exports = mongoose.model('Like', likeSchema);
