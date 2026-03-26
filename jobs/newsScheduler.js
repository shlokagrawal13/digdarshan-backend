const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { fetchNewsByCategory } = require('../services/rssService');
const { generateHindiContent, generateSocialCaption } = require('../services/geminiService');
const { getNewsImage } = require('../services/imageService');
const { postToAllPlatforms } = require('../services/socialMediaService');
const NewsModels = require('../models/News');
const AutoPublishSettings = require('../models/AutoPublishSettings');

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

let activeCronJob = null;
let missedSchedulePoller = null;

const getDbSettings = async () => {
    let doc = await AutoPublishSettings.findOne();
    if (!doc) {
        doc = await AutoPublishSettings.create({});
    }
    return doc;
};

const addLog = async (logEntry) => {
    const doc = await getDbSettings();
    doc.logs.unshift(logEntry);
    if (doc.logs.length > 50) {
        doc.logs.pop();
    }
    await doc.save();
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
    const settings = await getDbSettings();
    if (settings.isPublishing) {
        console.log('[AI Auto Publisher] Job already running, skipping trigger.');
        return;
    }
    settings.isPublishing = true;
    settings.lastRun = new Date();
    await settings.save();
    console.log('[AI Auto Publisher] Fetching news batch for ALL selected categories...');
    
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
                    // Prevent Google Gemini "429 Too Many Requests" (Max 15 RPM limit)
                    // We wait 15 seconds per article (~4 articles per min) to comfortably guarantee we never exceed the quota
                    await new Promise(resolve => setTimeout(resolve, 15000));

                    // 1. Generate Content
                    const generated = await generateHindiContent(item, category, settings.aiModel || 'gemini-flash-latest');
                    
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
                    const socialCaption = await generateSocialCaption(item, generated, settings.aiModel || 'gemini-flash-latest');
                    
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

    const finalSettings = await getDbSettings();
    finalSettings.isPublishing = false;
    await finalSettings.save();

    await addLog({
        timestamp: new Date(),
        publishedCount: successCount,
        failedCount: failCount,
        skippedCount: skipCount,
        details: batchDetails
    });
    console.log(`[AI Auto Publisher] Batch complete. Success: ${successCount}, Failed: ${failCount}, Skipped Dupes: ${skipCount}`);
};

const getPastScheduledTime = (cronExpression) => {
    const now = new Date();
    
    if (cronExpression === '* * * * *') {
        const d = new Date(now);
        d.setSeconds(0, 0); // e.g. 15:30:00
        return d;
    } else if (cronExpression === '0 * * * *') {
        const d = new Date(now);
        d.setMinutes(0, 0, 0);
        return d;
    } else if (cronExpression === '0 0 * * *') {
        const d = new Date(now);
        d.setHours(0, 0, 0, 0);
        return d;
    } else {
        const match = cronExpression?.match(/0 \*\/(\d+) \* \* \*/);
        if (match) {
            const step = parseInt(match[1], 10);
            const currentHour = now.getHours();
            const lastCronHour = currentHour - (currentHour % step);
            const d = new Date(now);
            d.setHours(lastCronHour, 0, 0, 0);
            return d;
        }
    }
    return new Date(0);
};

const checkMissedSchedule = async () => {
    try {
        const settings = await getDbSettings();
        if (!settings.isRunning || settings.isPublishing) return;
        
        const lastRun = settings.lastRun ? new Date(settings.lastRun) : new Date(0);
        const expectedPastRun = getPastScheduledTime(settings.interval);

        if (expectedPastRun > lastRun) {
            console.log(`[AI Auto Publisher] Catch-up triggered! Missed schedule detected. Expected: ${expectedPastRun.toLocaleString()}, Last Run: ${lastRun.toLocaleString()}`);
            runNewsJob(); // run immediately
        }
    } catch (e) {
        console.error('[AI Auto Publisher] Poller error:', e);
    }
};

const stopScheduler = async () => {
    if (activeCronJob) {
        activeCronJob.stop();
        activeCronJob = null;
    }
    if (missedSchedulePoller) {
        clearInterval(missedSchedulePoller);
        missedSchedulePoller = null;
    }
    const doc = await getDbSettings();
    doc.isRunning = false;
    await doc.save();
};

const startScheduler = async (passedDoc = null) => {
    if (activeCronJob) {
        activeCronJob.stop();
        activeCronJob = null;
    }
    if (missedSchedulePoller) {
        clearInterval(missedSchedulePoller);
        missedSchedulePoller = null;
    }
    const doc = passedDoc || await getDbSettings();
    doc.isRunning = true;
    await doc.save();
    
    activeCronJob = cron.schedule(doc.interval, runNewsJob);
    
    // Check every minute for sleep / missed schedules
    missedSchedulePoller = setInterval(checkMissedSchedule, 60 * 1000);
    // Also do one immediate check on start
    setTimeout(checkMissedSchedule, 5000); 

    console.log(`[AI Auto Publisher] Scheduler started with interval: ${doc.interval}`);
};

const updateSettings = async (newSettings) => {
    const doc = await getDbSettings();
    Object.assign(doc, newSettings);
    await doc.save();
    if (doc.isRunning) {
        await startScheduler(doc);
    }
    return doc.toObject();
};

const getSettings = async () => {
    const doc = await getDbSettings();
    return doc.toObject();
};

const initScheduler = async () => {
    try {
        const doc = await getDbSettings();
        if (doc.isPublishing) {
            doc.isPublishing = false;
            await doc.save();
        }
        if (doc.isRunning) {
            console.log(`[AI Auto Publisher] Resuming saved cron job from MongoDB...`);
            await startScheduler(doc);
        }
    } catch (err) {
        console.error('[AI Auto Publisher] Init error:', err);
    }
};

module.exports = {
    runNewsJob,
    startScheduler,
    stopScheduler,
    updateSettings,
    getSettings,
    initScheduler
};
