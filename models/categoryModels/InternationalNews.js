const mongoose = require('mongoose');
const baseNewsSchema = require('../baseNewsSchema');

const InternationalNews = mongoose.model('InternationalNews', baseNewsSchema);

module.exports = InternationalNews;
