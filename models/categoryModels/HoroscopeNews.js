const mongoose = require('mongoose');
const baseNewsSchema = require('../baseNewsSchema');

const HoroscopeNews = mongoose.model('HoroscopeNews', baseNewsSchema);

module.exports = HoroscopeNews;
