// backend/controllers/newsController.js
const NewsModels = require('../models/News');
const multer = require('multer');

// Multer configuration for storing files in memory
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Helper function to detect categories based on content
const detectCategories = (title, body, baseCategory) => {
    const categoryKeywords = {
        'राष्ट्रीय': ['राष्ट्रीय', 'भारत', 'देश'],
        'अंतरराष्ट्रीय': ['अंतरराष्ट्रीय', 'विदेश', 'दुनिया'],
        'खेल': ['खेल', 'क्रिकेट', 'फुटबॉल'],
        'व्यापार': ['व्यापार', 'बिजनेस', 'आर्थिक'],
        'मनोरंजन': ['मनोरंजन', 'बॉलीवुड', 'फिल्म'],
        'टेक्नोलॉजी': ['टेक्नोलॉजी', 'तकनीक', 'डिजिटल'],
        'मध्यप्रदेश': ['मध्यप्रदेश', 'भोपाल', 'इंदौर'],
        'उत्तरप्रदेश': ['उत्तरप्रदेश', 'लखनऊ', 'कानपुर'],
        'छत्तीसगढ़': ['छत्तीसगढ़', 'रायपुर', 'बिलासपुर']
    };

    // Category mapping from English to Hindi
    const categoryMapping = {
        'national': 'राष्ट्रीय',
        'international': 'अंतरराष्ट्रीय',
        'sports': 'खेल',
        'business': 'व्यापार',
        'entertainment': 'मनोरंजन',
        'technology': 'टेक्नोलॉजी',
        'madhyapradesh': 'मध्यप्रदेश',
        'uttarpradesh': 'उत्तरप्रदेश',
        'chhattisgarh': 'छत्तीसगढ़',
        'state': 'राज्य',
        'otherstates': 'अन्य राज्य',
        'lifestyle': 'जीवन शैली',
        'health': 'स्वास्थ्य',
        'education': 'शिक्षा'
    };

    const detectedCategories = [];
    const content = `${title} ${body}`.toLowerCase();

    for (const [category, keywords] of Object.entries(categoryKeywords)) {
        if (keywords.some(keyword => content.includes(keyword.toLowerCase()))) {
            detectedCategories.push(category); // Save Hindi category directly
        }
    }

    // Convert baseCategory from English to Hindi and include it
    const hindiBaseCategory = categoryMapping[baseCategory] || baseCategory;
    if (!detectedCategories.includes(hindiBaseCategory)) {
        detectedCategories.push(hindiBaseCategory);
    }

    return detectedCategories;
};

// Create News - Modified to use multer middleware
exports.createNews = [ // Use an array to include middleware
    upload.single('image'), // 'image' should match the field name in FormData
    async (req, res) => {
        try {
            const category = req.params.category;
            const NewsModel = NewsModels[category];
            
            if (!NewsModel) {
                return res.status(400).send({ message: 'Invalid category' });
            }

            // Pass category parameter to detectCategories
            const detectedCategories = detectCategories(req.body.title, req.body.body, category);

            const newNews = new NewsModel({
                title: req.body.title,
                body: req.body.body,
                categories: detectedCategories, // Add detected categories
                // Store image data if file is uploaded
                image: req.file ? {
                    data: req.file.buffer,
                    contentType: req.file.mimetype,
                    url: `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`
                } : undefined, // Or set to null if no image is uploaded
                // ... other fields from req.body
            });

            const savedNews = await newNews.save();
            res.status(201).send({
                success: true,
                data: savedNews
            });
        } catch (error) {
            console.error("Error creating news:", error);
            res.status(500).send({ message: 'Error creating news', error: error });
        }
    }
];

// Get News by Category - No changes needed for fetching, but consider how to send image to frontend
exports.getNewsByCategory = async (req, res) => {
    try {
        const category = req.params.category;
        const NewsModel = NewsModels[category];

        if (!NewsModel) {
            return res.status(400).send({ message: 'Invalid category' });
        }

        const news = await NewsModel.find()
            .sort({ date: -1 })
            .lean()
            .exec();

        // Transform the news data to include base64 image URL
        const transformedNews = news.map(item => ({
            ...item,
            image: item.image ? {
                ...item.image,
                url: item.image.url || `data:${item.image.contentType};base64,${item.image.data.toString('base64')}`
            } : null
        }));

        res.send({ posts: transformedNews }); // Changed response to match your frontend structure { posts: newsArray }
    } catch (error) {
        console.error("Error fetching news:", error);
        res.status(500).send({ message: 'Error fetching news', error: error });
    }
};

// Delete News by ID - No changes needed
exports.deleteNews = async (req, res) => {
    try {
        const category = req.params.category;
        const NewsModel = NewsModels[category];

        if (!NewsModel) {
            return res.status(400).send({ message: 'Invalid category' });
        }

        const newsId = req.params.id;
        const deletedNews = await NewsModel.findByIdAndDelete(newsId);
        
        if (!deletedNews) {
            return res.status(404).send({ message: 'News not found' });
        }
        
        res.send({ message: 'News deleted successfully' });
    } catch (error) {
        console.error("Error deleting news:", error);
        res.status(500).send({ message: 'Error deleting news', error: error });
    }
};

// Search news
exports.searchNews = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.status(400).json({ message: 'खोज क्वेरी आवश्यक है' });
    }

    // Create a regex for case-insensitive search
    const searchRegex = new RegExp(q, 'i');

    // Array to store results from all categories
    let allResults = [];

    // Search through all news models/categories
    for (const category in NewsModels) {
      try {
        const results = await NewsModels[category].find({
          $or: [
            { title: searchRegex },
            { body: searchRegex },
            { categories: searchRegex }
          ]
        })
        .sort({ date: -1 })
        .limit(10)
        .lean();

        // Transform results to include image URLs
        const transformedResults = results.map(item => ({
          ...item,
          image: item.image?.url || item.image,
          category: item.categories?.[0] || category
        }));

        allResults = [...
            allResults, ...transformedResults];
      } catch (error) {
        console.error(`Error searching in ${category}:`, error);
      }
    }

    // Sort combined results by date
    allResults.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Limit total results
    allResults = allResults.slice(0, 50);

    res.json({ posts: allResults });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ message: 'समाचार खोजने में त्रुटि' });
  }
};