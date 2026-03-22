const mongoose = require('mongoose');
const baseNewsSchema = require('../baseNewsSchema');

const MadhyaPradeshNews = mongoose.model('MadhyaPradeshNews', baseNewsSchema);

module.exports = MadhyaPradeshNews;
