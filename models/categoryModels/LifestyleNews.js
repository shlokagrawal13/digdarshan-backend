const mongoose = require('mongoose');
const baseNewsSchema = require('../baseNewsSchema');

const LifestyleNews = mongoose.model('LifestyleNews', baseNewsSchema);

module.exports = LifestyleNews;
