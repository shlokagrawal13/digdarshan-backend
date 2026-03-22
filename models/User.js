const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
  googleId: String,
  isVerified: { type: Boolean, default: false },
  verificationToken: String,
  verificationExpires: Date,
  profileCompleted: { type: Boolean, default: false },
  phone: String,
  dob: Date,
  address: String,
  profileImage: {
    data: Buffer,
    contentType: String
  },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  // Fields for admin moderation
  isAdmin: { type: Boolean, default: false },
  adminApproved: { type: Boolean, default: false },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedAt: Date,
  adminReason: String, // For storing why this person needs admin access
  approvalToken: String,
  approvalTokenExpires: Date
});

UserSchema.methods.toJSON = function() {
  const obj = this.toObject();
  if (obj.profileImage && obj.profileImage.data && obj.profileImage.contentType) {
    obj.profileImageUrl = `data:${obj.profileImage.contentType};base64,${obj.profileImage.data.toString('base64')}`;
    delete obj.profileImage;
  }
  return obj;
};

module.exports = mongoose.model("User", UserSchema);
