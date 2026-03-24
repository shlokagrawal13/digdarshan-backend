const axios = require('axios');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const cloudinary = require('cloudinary').v2;

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const uploadToCloudinary = (buffer, folder, format = 'jpg') => {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            { folder: folder, format: format },
            (error, result) => {
                if (result) {
                    resolve(result.secure_url);
                } else {
                    reject(error);
                }
            }
        );
        stream.end(buffer);
    });
};

const fetchImageFromPexels = async (keyword) => {
    if (!process.env.PEXELS_API_KEY) return null;
    try {
        const page = Math.floor(Math.random() * 15) + 1;
        const res = await axios.get(`https://api.pexels.com/v1/search?query=${keyword}&per_page=1&page=${page}`, {
            headers: { Authorization: process.env.PEXELS_API_KEY }
        });
        if (res.data.photos && res.data.photos.length > 0) {
            return { url: res.data.photos[0].src.large2x, credit: 'Pexels' };
        }
    } catch (e) {
        console.error('Pexels API Error:', e.message);
    }
    return null;
};

const fetchImageFromUnsplash = async (keyword) => {
    if (!process.env.UNSPLASH_ACCESS_KEY) return null;
    try {
        const page = Math.floor(Math.random() * 15) + 1;
        const res = await axios.get(`https://api.unsplash.com/search/photos?query=${keyword}&per_page=1&page=${page}`, {
            headers: { Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}` }
        });
        if (res.data.results && res.data.results.length > 0) {
            return { url: res.data.results[0].urls.raw + '&w=1200', credit: 'Unsplash' };
        }
    } catch (e) {
        console.error('Unsplash API Error:', e.message);
    }
    return null;
};

const processAndUploadImage = async (imageUrl, altKeyword) => {
    try {
        // Download the image
        const response = await axios({ url: imageUrl, responseType: 'arraybuffer' });
        const inputBuffer = Buffer.from(response.data, 'binary');

        // Prepare watermark
        const logoPath = path.join(__dirname, '../assets/logo.png');
        let compositeElements = [];
        
        const gradientSettings = (width, height) => {
            const gradientSvg = `
                <svg width="${width}" height="${height}">
                    <defs>
                        <linearGradient id="grad" x1="0" y1="0.5" x2="0" y2="1">
                            <stop offset="0%" stop-color="black" stop-opacity="0" />
                            <stop offset="100%" stop-color="black" stop-opacity="0.8" />
                        </linearGradient>
                    </defs>
                    <rect width="100%" height="100%" fill="url(#grad)" />
                </svg>
            `;
            return {
                 input: Buffer.from(gradientSvg),
                 blend: 'over'
            };
        };

        if (fs.existsSync(logoPath)) {
            // Resize logo if exists
            const logoBuffer = await sharp(logoPath)
                .resize(160, null, { withoutEnlargement: true })
                .ensureAlpha()
                .toBuffer();
                
            const getLogoComposite = (imgWidth, imgHeight) => ({
                input: logoBuffer,
                gravity: 'southeast',
                blend: 'over'
            });
            
            compositeElements = (w, h) => [gradientSettings(w, h), getLogoComposite(w, h)];
        } else {
            // Text watermark fallback
            const siteName = process.env.SITE_NAME || 'NewsPortal';
            const svgText = `
                <svg width="600" height="100">
                  <text x="10" y="80" font-family="Arial" font-size="40" font-weight="bold" fill="white" fill-opacity="0.8">
                    ${siteName}
                  </text>
                </svg>
            `;
            const getTextComposite = () => ({
                input: Buffer.from(svgText),
                gravity: 'southeast',
                blend: 'over'
            });
            compositeElements = (w, h) => [gradientSettings(w, h), getTextComposite()];
        }

        // Process images
        const createVersion = async (w, h) => {
            return await sharp(inputBuffer)
                .resize(w, h, { fit: 'cover', position: 'center' })
                .composite(compositeElements(w, h))
                .jpeg({ quality: 85 })
                .toBuffer();
        };

        const [newsCardBuf, socialBuf] = await Promise.all([
            createVersion(1200, 630),
            createVersion(1080, 1080)
        ]);

        // Upload to Cloudinary
        const d = new Date();
        const folder = `news-images/${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`;
        
        const [newsCardUrl, socialUrl] = await Promise.all([
            uploadToCloudinary(newsCardBuf, folder),
            uploadToCloudinary(socialBuf, folder)
        ]);

        return {
            newsCard: newsCardUrl,
            social: socialUrl,
            og: newsCardUrl // Same as newsCard
        };

    } catch (error) {
        console.error('Image Processing Error:', error.message);
        return null;
    }
};

const getNewsImage = async (keywords, fallbackUrl = null) => {
    let source = await fetchImageFromPexels(keywords[0] || 'news');
    if (!source) source = await fetchImageFromUnsplash(keywords[0] || 'news');
    
    // If no stock images found but we have an RSS fallback image
    let imageUrlToProcess = source ? source.url : fallbackUrl;
    let credit = source ? source.credit : 'RSS';

    if (!imageUrlToProcess) {
        // Ultimate fallback: random nature/news from pexels
        imageUrlToProcess = 'https://images.pexels.com/photos/3861458/pexels-photo-3861458.jpeg'; 
        credit = 'Pexels Default';
    }

    const processedUrls = await processAndUploadImage(imageUrlToProcess, keywords[0]);
    if (!processedUrls) return null;

    return {
        ...processedUrls,
        credit
    };
};

module.exports = {
    getNewsImage
};
