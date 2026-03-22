const mongoose = require('mongoose');
const baseNewsSchema = require('../baseNewsSchema');

const EducationNews = mongoose.model('EducationNews', baseNewsSchema);

module.exports = EducationNews;
