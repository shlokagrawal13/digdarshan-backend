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
 * Robust generator that falls back across models securely
 */
const getRobustContent = async (prompt, requestedModel) => {
    const modelsQueue = [
        'gemini-2.5-flash-lite',
        'gemini-1.5-flash-latest',
        'gemini-1.5-flash',
        'gemini-1.5-flash-001',
        'gemini-1.5-pro'
    ];
    
    // Prioritize user's requested model if it's not the known 20-limit trap
    if (requestedModel && !['gemini-flash-latest', 'gemini-3-flash'].includes(requestedModel)) {
        modelsQueue.unshift(requestedModel);
    }

    const uniqueQueue = [...new Set(modelsQueue)];
    let lastError = null;

    for (const modelAlias of uniqueQueue) {
        try {
            const model = genAI.getGenerativeModel({ model: modelAlias });
            const result = await model.generateContent(prompt);
            return result;
        } catch (error) {
            console.warn(`[Gemini] Model ${modelAlias} fallback check failed: ${error.message.substring(0, 100)}...`);
            lastError = error;
            // 404 (Not Found) or 429 (Quota Exceeded) -> move to next model
            if (error.message.includes('404') || error.message.includes('429') || error.message.includes('Quota')) {
                continue;
            }
            // For severe errors break out
            if (error.message.includes('403') || error.message.includes('401')) {
                throw error;
            }
        }
    }
    throw new Error(`All fallback models exhausted. Last error: ${lastError?.message}`);
};

/**
 * Uses Gemini to rewrite and optimize news content for the platform
 */
const generateHindiContent = async (newsItem, category = 'news', aiModel = 'gemini-2.5-flash-lite') => {
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
        const prompt = `
        You are an expert Hindi journalist and SEO specialist. Rewrite the following news article to make it highly engaging and professional in Hindi. Your output MUST BE significantly longer and more detailed than the original snippet. Elaborate on the context and background.
        
        Original Title: ${stripHtml(newsItem.title)}
        Original Content: ${stripHtml(newsItem.description)}
        Source: ${newsItem.link}

        Please return ONLY a valid JSON object with the following structure (no markdown tags, no extra text):
        {
            "hindiTitle": "Catchy and professional Hindi headline (max 80 chars)",
            "hindiSummary": "Detailed Hindi article content. YOU MUST WRITE strictly between 150-300 words. Separate paragraphs with \\n\\n (newline characters). Do NOT use any HTML tags like <br>. Write in a neutral journalistic tone.",
            "shortSummary": "A concise summary for social media sharing (max 150 chars in Hindi)",
            "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
            "metaDescription": "SEO meta description in Hindi (max 160 chars)",
            "tags": ["tag1", "tag2", "tag3"]
        }`;

        const result = await getRobustContent(prompt, aiModel);
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
        const prompt = `
        Write a highly engaging social media caption in Hindi for Facebook and Twitter for this news:
        Title: ${generatedContent.hindiTitle}
        Summary: ${generatedContent.shortSummary}
        
        Keep it under 3-4 lines. Include 3-4 relevant emojis and 3 trending hashtags. 
        End with a call to action to click the link underneath.
        Return ONLY the caption text.
        `;

        const result = await getRobustContent(prompt, aiModel);
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
