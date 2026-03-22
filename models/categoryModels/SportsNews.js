const mongoose = require('mongoose');
const baseNewsSchema = require('../baseNewsSchema');

const SportsNews = mongoose.model('SportsNews', baseNewsSchema);

module.exports = SportsNews;
