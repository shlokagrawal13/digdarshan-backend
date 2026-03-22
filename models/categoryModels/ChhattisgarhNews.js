const mongoose = require('mongoose');
const baseNewsSchema = require('../baseNewsSchema');

const ChhattisgarhNews = mongoose.model('ChhattisgarhNews', baseNewsSchema);

module.exports = ChhattisgarhNews;
