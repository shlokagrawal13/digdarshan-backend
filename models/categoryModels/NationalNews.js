const mongoose = require('mongoose');
const baseNewsSchema = require('../baseNewsSchema');

const NationalNews = mongoose.model('NationalNews', baseNewsSchema);

module.exports = NationalNews;
