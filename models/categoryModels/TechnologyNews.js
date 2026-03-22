const mongoose = require('mongoose');
const baseNewsSchema = require('../baseNewsSchema');

const TechnologyNews = mongoose.model('TechnologyNews', baseNewsSchema);

module.exports = TechnologyNews;
