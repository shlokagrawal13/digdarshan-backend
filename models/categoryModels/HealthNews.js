const mongoose = require('mongoose');
const baseNewsSchema = require('../baseNewsSchema');

const HealthNews = mongoose.model('HealthNews', baseNewsSchema);

module.exports = HealthNews;
