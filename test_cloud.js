require('dotenv').config();
const cloudinary = require('cloudinary').v2;

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const testCloudinary = async () => {
    try {
        const result = await cloudinary.uploader.upload('https://feeds.abplive.com/onecms/images/uploaded-images/2024/05/17/c97b8ea79de42b2ab672be9cce54d3a01715939226500582_original.jpg');
        console.log('Success! URL: ' + result.secure_url);
    } catch (e) {
        console.error('Cloudinary Failed:', e.message || e);
    }
};
testCloudinary();
