// const fs = require('fs');
// const path = require('path');

// const categories = [
//     'Sports',
//     'Entertainment',
//     'State',
//     'MadhyaPradesh',
//     'Chhattisgarh',
//     'OtherStates',
//     'UttarPradesh',
//     'Horoscope',
//     'Technology',
//     'Health',
//     'Education',
//     'Lifestyle'
// ];

// const modelTemplate = (category) => `const mongoose = require('mongoose');
// const baseNewsSchema = require('../baseNewsSchema');

// const ${category}News = mongoose.model('${category}News', baseNewsSchema);

// module.exports = ${category}News;
// `;

// const modelsDir = path.join(__dirname, '..', 'models', 'categoryModels');

// // Create directory if it doesn't exist
// if (!fs.existsSync(modelsDir)) {
//     fs.mkdirSync(modelsDir, { recursive: true });
// }

// // Generate model files
// categories.forEach(category => {
//     const filePath = path.join(modelsDir, `${category}News.js`);
//     fs.writeFileSync(filePath, modelTemplate(category));
//     console.log(`Created ${category}News.js`);
// });

// console.log('All model files have been generated!');
