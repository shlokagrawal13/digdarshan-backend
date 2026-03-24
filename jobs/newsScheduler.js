const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { fetchNewsByCategory } = require('../services/rssService');
const { generateHindiContent, generateSocialCaption } = require('../services/geminiService');
const { getNewsImage } = require('../services/imageService');
const { postToAllPlatforms } = require('../services/socialMediaService');
const NewsModels = require('../models/News');

const PROCESSED_URLS_FILE = path.join(__dirname, '../data/processed_rss.json');

const getProcessedUrls = () => {
    try {
        if (!fs.existsSync(path.dirname(PROCESSED_URLS_FILE))) {
            fs.mkdirSync(path.dirname(PROCESSED_URLS_FILE), { recursive: true });
        }
        if (fs.existsSync(PROCESSED_URLS_FILE)) {
            return JSON.parse(fs.readFileSync(PROCESSED_URLS_FILE, 'utf8'));
        }
    } catch (e) {}
    return [];
};

const saveProcessedUrl = (url) => {
    try {
        let urls = getProcessedUrls();
        urls.push(url);
        if (urls.length > 2000) urls = urls.slice(urls.length - 2000); // keep last 2000
        fs.writeFileSync(PROCESSED_URLS_FILE, JSON.stringify(urls));
    } catch (e) {}
};

// In-memory settings
let settings = {
    isRunning: false,
    isPublishing: false,
    interval: '0 */6 * * *',
    categories: ['national'],
    newsPerBatch: 2, // Process max 2 per category
    platforms: { telegram: false, facebook: false, instagram: false, twitter: false },
    aiModel: 'gemini-2.5-flash', // Allow UI dynamic model selection
    lastRun: null,
    logs: [] // keep last 50
};

let activeCronJob = null;

const addLog = (logEntry) => {
    settings.logs.unshift(logEntry);
    if (settings.logs.length > 50) {
        settings.logs.pop();
    }
};

const HINDI_CATEGORIES = {
    national: 'राष्ट्रीय',
    international: 'अंतरराष्ट्रीय',
    state: 'राज्य',
    uttarpradesh: 'उत्तर प्रदेश',
    madhyapradesh: 'मध्य प्रदेश',
    chhattisgarh: 'छत्तीसगढ़',
    otherstates: 'अन्य राज्य',
    sports: 'खेल',
    entertainment: 'मनोरंजन',
    business: 'व्यापार',
    technology: 'तकनीक',
    education: 'शिक्षा',
    health: 'स्वास्थ्य',
    lifestyle: 'लाइफस्टाइल',
    horoscope: 'राशिफल'
};

const saveNewsToDatabase = async (generated, imageUrl, category) => {
    const Model = NewsModels[category.toLowerCase()] || NewsModels['national'];
    const hindiCategoryName = HINDI_CATEGORIES[category.toLowerCase()] || category;

    const newPost = new Model({
        title: generated.hindiTitle,
        body: generated.hindiSummary,
        image: {
            url: imageUrl
        },
        categories: [hindiCategoryName, ...generated.tags],
        date: new Date()
    });

    await newPost.save();
    return newPost;
};

const runNewsJob = async () => {
    if (settings.isPublishing) {
        console.log('[AI Auto Publisher] Job already running, skipping trigger.');
        return;
    }
    settings.isPublishing = true;
    console.log('[AI Auto Publisher] Fetching news batch for ALL selected categories...');
    settings.lastRun = new Date();
    
    let successCount = 0;
    let failCount = 0;
    let skipCount = 0;
    const batchDetails = [];
    const processedUrls = getProcessedUrls();

    try {
        // Iterate over ALL selected categories so none are left out
        for (const category of settings.categories) {
            console.log(`[AI Auto Publisher] Processing category: ${category}`);
            const _rssItems = await fetchNewsByCategory(category, 15); // Fetch more items to safely skip duplicates
            
            if (!_rssItems || _rssItems.length === 0) {
                continue; // no items for this category
            }

            let categoryPublishedCount = 0;

            for (const item of _rssItems) {
                // Break if we successfully published the required amount for this category
                if (categoryPublishedCount >= (settings.newsPerBatch || 2)) break;

                // Duplicate check
                if (processedUrls.includes(item.link)) {
                    console.log(`[AI Auto Publisher] Skipping duplicate: ${item.title}`);
                    skipCount++;
                    continue; // Skip!
                }

                try {
                    // 1. Generate Content
                    const generated = await generateHindiContent(item, category, settings.aiModel || 'gemini-2.5-flash');
                    
                    // 2. Process Image
                    const imgData = await getNewsImage(generated.keywords, item.originalImage);
                    const imageUrl = imgData ? imgData.newsCard : null;
                    const socialImageUrl = imgData ? imgData.social : null;

                    // 3. Save Context to Database
                    const savedPost = await saveNewsToDatabase(generated, imageUrl, category);

                    // Mark as processed immediately to prevent concurrent duplicates
                    saveProcessedUrl(item.link);
                    processedUrls.push(item.link);

                    // 4. Create Social Media Caption
                    const socialCaption = await generateSocialCaption(item, generated, settings.aiModel || 'gemini-2.5-flash');
                    
                    // 5. Post to Social Media
                    const postLink = process.env.CLIENT_URL ? `${process.env.CLIENT_URL}/news/${category}/${savedPost._id}` : item.link;
                    if (Object.values(settings.platforms).some(v => v)) {
                        await postToAllPlatforms({ link: postLink }, socialCaption, settings.platforms, socialImageUrl);
                    }

                    successCount++;
                    categoryPublishedCount++;
                    batchDetails.push({ title: generated.hindiTitle, category: category, status: 'Success' });
                } catch (innerError) {
                    console.error(`[AI Auto Publisher] Error processing item: ${item.title}`, innerError);
                    failCount++;
                    batchDetails.push({ title: item.title, category: category, status: 'Failed', error: innerError.message });
                    saveProcessedUrl(item.link); // Mark as processed even if failed so we don't infinitely retry broken RSS entries
                    processedUrls.push(item.link);
                }
            }
        }
    } catch (error) {
         console.error('[AI Auto Publisher] Critical failure in batch:', error);
         failCount++;
    }

    settings.isPublishing = false;

    addLog({
        timestamp: new Date(),
        publishedCount: successCount,
        failedCount: failCount,
        skippedCount: skipCount,
        details: batchDetails
    });
    console.log(`[AI Auto Publisher] Batch complete. Success: ${successCount}, Failed: ${failCount}, Skipped Dupes: ${skipCount}`);
};

const stopScheduler = () => {
    if (activeCronJob) {
        activeCronJob.stop();
        activeCronJob = null;
    }
    settings.isRunning = false;
};

const startScheduler = () => {
    stopScheduler();
    activeCronJob = cron.schedule(settings.interval, runNewsJob);
    settings.isRunning = true;
    console.log(`[AI Auto Publisher] Scheduler started with interval: ${settings.interval}`);
};

const updateSettings = (newSettings) => {
    settings = { ...settings, ...newSettings };
    if (settings.isRunning) {
        startScheduler(); // Restart with new interval
    }
    return settings;
};

const getSettings = () => settings;

module.exports = {
    runNewsJob,
    startScheduler,
    stopScheduler,
    updateSettings,
    getSettings
};
