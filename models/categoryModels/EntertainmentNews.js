const mongoose = require('mongoose');
const baseNewsSchema = require('../baseNewsSchema');

const EntertainmentNews = mongoose.model('EntertainmentNews', baseNewsSchema);

module.exports = EntertainmentNews;
