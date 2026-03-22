const mongoose = require('mongoose');

const baseNewsSchema = new mongoose.Schema({
    title: { type: String, required: true },
    body: { type: String, required: true },
    image: {
        data: Buffer,
        contentType: String,
        url: String
    },
    categories: [{ type: String }],
    date: { type: Date, default: Date.now }
});

module.exports = baseNewsSchema;
