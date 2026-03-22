// backend/routes/newsRoutes.js
const express = require('express');
const router = express.Router();
const newsController = require('../controllers/newsController');

// Search endpoint
router.get('/search', newsController.searchNews);

// Define routes for each category
router.post('/:category', newsController.createNews); // Use the modified createNews controller
router.get('/:category', newsController.getNewsByCategory);
router.delete('/:category/:id', newsController.deleteNews);

module.exports = router;