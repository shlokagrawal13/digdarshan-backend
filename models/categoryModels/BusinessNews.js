const mongoose = require('mongoose');
const baseNewsSchema = require('../baseNewsSchema');

const BusinessNews = mongoose.model('BusinessNews', baseNewsSchema);

module.exports = BusinessNews;
