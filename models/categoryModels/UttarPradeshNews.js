const mongoose = require('mongoose');
const baseNewsSchema = require('../baseNewsSchema');

const UttarPradeshNews = mongoose.model('UttarPradeshNews', baseNewsSchema);

module.exports = UttarPradeshNews;
