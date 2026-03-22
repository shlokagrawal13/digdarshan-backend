const mongoose = require('mongoose');
const baseNewsSchema = require('../baseNewsSchema');

const OtherStatesNews = mongoose.model('OtherStatesNews', baseNewsSchema);

module.exports = OtherStatesNews;
