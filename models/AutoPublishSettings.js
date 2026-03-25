const mongoose = require('mongoose');

const autoPublishSettingsSchema = new mongoose.Schema({
    isRunning: { type: Boolean, default: false },
    isPublishing: { type: Boolean, default: false },
    interval: { type: String, default: '0 */6 * * *' },
    categories: { type: [String], default: ['national'] },
    newsPerBatch: { type: Number, default: 2 },
    platforms: {
        telegram: { type: Boolean, default: false },
        facebook: { type: Boolean, default: false },
        instagram: { type: Boolean, default: false },
        twitter: { type: Boolean, default: false }
    },
    aiModel: { type: String, default: 'gemini-2.5-flash' },
    lastRun: { type: Date, default: null },
    logs: { type: Array, default: [] }
}, { timestamps: true });

module.exports = mongoose.model('AutoPublishSettings', autoPublishSettingsSchema);
