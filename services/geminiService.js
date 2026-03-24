const { GoogleGenerativeAI } = require('@google/generative-ai');

const stripHtml = (html) => {
    if (!html) return "";
    return html
        .replace(/<[^>]*>?/gm, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .trim();
};

// Ensure API key is available
const apiKey = process.env.GEMINI_API_KEY;
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

/**
 * Uses Gemini to rewrite and optimize news content for the platform
 */
const generateHindiContent = async (newsItem, category = 'news', aiModel = 'gemini-2.5-flash') => {
    if (!genAI) {
        console.warn('GEMINI_API_KEY is missing. Using original RSS content fallback.');
        return {
            hindiTitle: stripHtml(newsItem.title),
            hindiSummary: stripHtml(newsItem.contentSnippet || newsItem.content || newsItem.description),
            shortSummary: stripHtml(newsItem.contentSnippet || newsItem.content || newsItem.description).substring(0, 140) + '...',
            keywords: [category, 'latest', 'news'],
            metaDescription: stripHtml(newsItem.contentSnippet || newsItem.content || newsItem.description).substring(0, 150),
            tags: [category, 'latest']
        };
    }

    try {
        const model = genAI.getGenerativeModel({ model: aiModel });

        const prompt = `
        You are an expert Hindi journalist and SEO specialist. Rewrite the following news article to make it highly engaging and professional in Hindi.
        
        Original Title: ${stripHtml(newsItem.title)}
        Original Content: ${stripHtml(newsItem.description)}
        Source: ${newsItem.link}

        Please return ONLY a valid JSON object with the following structure (no markdown tags, no extra text):
        {
            "hindiTitle": "Catchy and professional Hindi headline (max 80 chars)",
            "hindiSummary": "Detailed Hindi article content (around 200-300 words). Use paragraphs and <br> tags for formatting if needed. Write in a neutral journalistic tone.",
            "shortSummary": "A concise summary for social media sharing (max 150 chars in Hindi)",
            "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
            "metaDescription": "SEO meta description in Hindi (max 160 chars)",
            "tags": ["tag1", "tag2", "tag3"]
        }`;

        const result = await model.generateContent(prompt);
        const responseText = result.response.text().trim();
        
        // Remove markdown formatting if Gemini includes it
        const cleanJson = responseText.replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
        
        const parsed = JSON.parse(cleanJson);
        return parsed;
        
    } catch (error) {
        console.error('Gemini content generation failed:', error.message);
        return {
            hindiTitle: stripHtml(newsItem.title),
            hindiSummary: stripHtml(newsItem.contentSnippet || newsItem.content || newsItem.description),
            shortSummary: stripHtml(newsItem.contentSnippet || newsItem.content || newsItem.description).substring(0, 140) + '...',
            keywords: [category, 'latest', 'news'],
            metaDescription: stripHtml(newsItem.contentSnippet || newsItem.content || newsItem.description).substring(0, 150),
            tags: [category, 'latest']
        };
    }
};

/**
 * Generates a social media caption using Gemini
 */
const generateSocialCaption = async (newsItem, generatedContent, aiModel = 'gemini-2.5-flash') => {
     if (!genAI) {
        return `${generatedContent.hindiTitle}\n\nपूरी खबर पढ़ें हमारी वेबसाइट पर! #News #Hindi`;
    }

    try {
        const model = genAI.getGenerativeModel({ model: aiModel });
        const prompt = `
        Write a highly engaging social media caption in Hindi for Facebook and Twitter for this news:
        Title: ${generatedContent.hindiTitle}
        Summary: ${generatedContent.shortSummary}
        
        Keep it under 3-4 lines. Include 3-4 relevant emojis and 3 trending hashtags. 
        End with a call to action to click the link underneath.
        Return ONLY the caption text.
        `;

        const result = await model.generateContent(prompt);
        return result.response.text().trim();
    } catch (error) {
        console.error('Gemini caption generation failed:', error.message);
        return `${generatedContent.hindiTitle}\n\n${generatedContent.shortSummary}\n\n#News #Updates`;
    }
};

module.exports = {
    generateHindiContent,
    generateSocialCaption
};
