// C:\Users\ASUS\Desktop\mern-app\backend\config\db.js
const mongoose = require('mongoose');
const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI, { // Include options for current versions of Mongoose
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log("MongoDB Connected");
    } catch (err) {
        console.error("MongoDB Connection Failed", err); // Log the error for debugging
        process.exit(1); // Exit process with failure
    }
};

module.exports = connectDB;