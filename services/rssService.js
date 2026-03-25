const Parser = require('rss-parser');

const parser = new Parser({
    customFields: {
        item: [
            ['media:content', 'mediaContent'],
            ['media:thumbnail', 'mediaThumbnail'],
            ['enclosure', 'enclosure'],
            ['StoryImage', 'storyImage'],
            ['image', 'image'],
            ['content:encoded', 'contentEncoded']
        ]
    },
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml'
    }
});

// Example Feeds for Hindi News
const RSS_FEEDS = {
    national: [
        'https://feeds.feedburner.com/ndtvkhabar-latest',
        'https://www.abplive.com/home/feed'
    ],
    international: [
        'https://feeds.feedburner.com/ndtvkhabar-world',
        'https://www.abplive.com/world/feed'
    ],
    sports: [
        'https://feeds.feedburner.com/ndtvkhabar-sports',
        'https://www.abplive.com/sports/feed'
    ],
    technology: [
        'https://feeds.feedburner.com/ndtvkhabar-tech',
        'https://www.abplive.com/technology/feed'
    ],
    business: [
        'https://feeds.feedburner.com/ndtvkhabar-business',
        'https://www.abplive.com/business/feed'
    ],
    entertainment: [
        'https://feeds.feedburner.com/ndtvkhabar-bollywood',
        'https://www.abplive.com/entertainment/feed'
    ],
    state: ['https://www.abplive.com/states/feed'],
    madhyapradesh: ['https://www.abplive.com/states/madhya-pradesh/feed'],
    chhattisgarh: ['https://www.abplive.com/states/chhattisgarh/feed'],
    otherstates: ['https://www.abplive.com/states/feed'],
    uttarpradesh: ['https://www.abplive.com/states/up-uk/feed'],
    horoscope: ['https://www.abplive.com/astro/feed'],
    health: ['https://www.abplive.com/health/feed'],
    education: ['https://www.abplive.com/education/feed'],
    lifestyle: ['https://feeds.feedburner.com/ndtvkhabar-lifestyle', 'https://www.abplive.com/lifestyle/feed']
};

/**
 * Extracts the best possible image URL from an RSS item
 */
const extractImage = (item) => {
    if (item.storyImage) return item.storyImage;
    if (item.image) {
        if (typeof item.image === 'string') return item.image;
        if (item.image.url) return item.image.url;
    }
    if (item.enclosure && item.enclosure.url) return item.enclosure.url;
    if (item.mediaContent && item.mediaContent.$ && item.mediaContent.$.url) return item.mediaContent.$.url;
    if (item.mediaThumbnail && item.mediaThumbnail.$ && item.mediaThumbnail.$.url) return item.mediaThumbnail.$.url;
    if (item.mediaContent && typeof item.mediaContent === 'string' && item.mediaContent.startsWith('http')) return item.mediaContent;
    
    // Check inside content/description for an img tag
    const imgRegex = /<img[^>]+src=["']?([^"'>\s]+)["']?[^>]*>/i;
    const contentToSearch = item.contentEncoded || item.content || item.contentSnippet || item.description || '';
    const match = imgRegex.exec(contentToSearch);
    if (match && match[1]) return match[1];

    return null;
};

/**
 * Fetches news from configured RSS feeds for a specific category
 */
const fetchNewsByCategory = async (category, maxItems = 5) => {
    const feeds = RSS_FEEDS[category.toLowerCase()] || RSS_FEEDS['national'];
    let allNews = [];

    for (const feedUrl of feeds) {
        try {
            const feed = await parser.parseURL(feedUrl);
            const items = feed.items.map(item => ({
                title: item.title,
                description: item.contentSnippet || item.content,
                link: item.link,
                pubDate: item.pubDate,
                source: feed.title,
                category: category,
                originalImage: extractImage(item)
            }));
            
            allNews = [...allNews, ...items];
        } catch (error) {
            console.error(`Error fetching RSS feed ${feedUrl}:`, error.message);
        }
    }

    // Sort by date descending and limit
    allNews.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
    return allNews.slice(0, maxItems);
};

module.exports = {
    fetchNewsByCategory,
    RSS_FEEDS
};
