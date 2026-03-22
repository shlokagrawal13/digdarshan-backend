const mongoose = require('mongoose');
const baseNewsSchema = require('../baseNewsSchema');

const StateNews = mongoose.model('StateNews', baseNewsSchema);

module.exports = StateNews;
