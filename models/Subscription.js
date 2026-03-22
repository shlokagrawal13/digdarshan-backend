const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
  dateTime: { type: Date, required: true },
  newspaperName: { type: String, required: true },
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  phone: { type: String, required: true },
  email: { type: String, required: true },
  designation: { type: String },
  website: { type: String },
  serviceAddress: { type: String, required: true },
  purpose: { type: String, required: true },
  frequency: { type: String, required: true },
  circulation: { type: String, required: true },
  rniNo: { type: String },
  abcCertificate: { type: String },
  contactPerson: {
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    designation: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String, required: true }
  },
  createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('Subscription', subscriptionSchema);
