const axios = require('axios');
const { TwitterApi } = require('twitter-api-v2');

const postToTelegram = async (newsItem, caption, imageUrl) => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHANNEL_ID;
    if (!token || !chatId) return { success: false, platform: 'telegram', error: 'Missing Credentials' };

    try {
        const text = `${caption}\n\n${newsItem.link}`;
        if (imageUrl) {
            await axios.post(`https://api.telegram.org/bot${token}/sendPhoto`, {
                chat_id: chatId,
                photo: imageUrl,
                caption: text
            });
        } else {
            await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
                chat_id: chatId,
                text: text
            });
        }
        return { success: true, platform: 'telegram' };
    } catch (e) {
        return { success: false, platform: 'telegram', error: e.message };
    }
};

const postToFacebook = async (newsItem, caption, imageUrl) => {
    const pageId = process.env.FACEBOOK_PAGE_ID;
    const accessToken = process.env.FACEBOOK_ACCESS_TOKEN;
    if (!pageId || !accessToken) return { success: false, platform: 'facebook', error: 'Missing Credentials' };

    try {
        const message = `${caption}\n\n${newsItem.link}`;
        if (imageUrl) {
            await axios.post(`https://graph.facebook.com/v18.0/${pageId}/photos`, null, {
                params: { url: imageUrl, message: message, access_token: accessToken }
            });
        } else {
            await axios.post(`https://graph.facebook.com/v18.0/${pageId}/feed`, null, {
                params: { message: message, link: newsItem.link, access_token: accessToken }
            });
        }
        return { success: true, platform: 'facebook' };
    } catch (e) {
        return { success: false, platform: 'facebook', error: e.response?.data?.error?.message || e.message };
    }
};

const postToInstagram = async (newsItem, caption, imageUrl) => {
    const accountId = process.env.INSTAGRAM_ACCOUNT_ID;
    const accessToken = process.env.FACEBOOK_ACCESS_TOKEN;
    if (!accountId || !accessToken || !imageUrl) return { success: false, platform: 'instagram', error: 'Missing Credentials or Image' };

    try {
        // 1. Create Media Container
        const containerRes = await axios.post(`https://graph.facebook.com/v18.0/${accountId}/media`, null, {
            params: { image_url: imageUrl, caption: caption, access_token: accessToken }
        });
        const containerId = containerRes.data.id;

        // 2. Publish Media
        await axios.post(`https://graph.facebook.com/v18.0/${accountId}/media_publish`, null, {
            params: { creation_id: containerId, access_token: accessToken }
        });

        return { success: true, platform: 'instagram' };
    } catch (e) {
        return { success: false, platform: 'instagram', error: e.response?.data?.error?.message || e.message };
    }
};

const postToTwitter = async (newsItem, caption) => {
    if (!process.env.TWITTER_API_KEY) return { success: false, platform: 'twitter', error: 'Missing Credentials' };

    try {
        const client = new TwitterApi({
            appKey: process.env.TWITTER_API_KEY,
            appSecret: process.env.TWITTER_API_SECRET,
            accessToken: process.env.TWITTER_ACCESS_TOKEN,
            accessSecret: process.env.TWITTER_ACCESS_SECRET,
        });

        const text = `${caption.substring(0, 250)}\n${newsItem.link}`;
        await client.v2.tweet(text);
        
        return { success: true, platform: 'twitter' };
    } catch (e) {
        return { success: false, platform: 'twitter', error: e.message };
    }
};

const postToAllPlatforms = async (newsItem, caption, enabledPlatforms, imageUrl) => {
    const promises = [];
    if (enabledPlatforms.telegram) promises.push(postToTelegram(newsItem, caption, imageUrl));
    if (enabledPlatforms.facebook) promises.push(postToFacebook(newsItem, caption, imageUrl));
    if (enabledPlatforms.instagram) promises.push(postToInstagram(newsItem, caption, imageUrl));
    if (enabledPlatforms.twitter) promises.push(postToTwitter(newsItem, caption));

    const results = await Promise.allSettled(promises);
    return results.map(r => r.status === 'fulfilled' ? r.value : { success: false, error: 'Unknown promise rejection' });
};

module.exports = {
    postToAllPlatforms
};
