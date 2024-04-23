const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const app = express();
const port = 3000;

// Ensure these directories exist
const screenshotsDir = path.join(__dirname, 'screenshots');
const imagesFolder = path.join(__dirname, 'images'); // Define imagesFolder here

if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
}

if (!fs.existsSync(imagesFolder)) {
    fs.mkdirSync(imagesFolder, { recursive: true }); // Ensure images directory exists
}

// Setup express server
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
app.use('/screenshots', express.static(screenshotsDir));
app.use('/images', express.static(imagesFolder)); // This will now work as imagesFolder is defined

// MongoDB Connection and the rest of your code follows...


// MongoDB Connection
mongoose.connect('mongodb://localhost:27017/myExtensionDB', {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Page Schema
const PageSchema = new mongoose.Schema({
    title: String,
    description: String,
    url: String,
    screenshotDataUrl: String,
    likes: Number, // New field for likes
    comments: Number, // New field for comments
    shares: Number, // New field for shares
    date: { type: Date, default: Date.now },
});


const Page = mongoose.model('Page', PageSchema);

app.post('/api/downloadImages', async (req, res) => {
    const { imageUrls } = req.body;
    const imagesFolder = path.join(__dirname, 'images');

    if (!fs.existsSync(imagesFolder)) {
        fs.mkdirSync(imagesFolder, { recursive: true });
    }

    try {
        const downloadPromises = imageUrls.map(async (imageUrl) => {
            // Fetch the image without downloading it, to check headers
            const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
            const buffer = Buffer.from(response.data);

            // Check the Content-Type for allowed image formats
            const contentType = response.headers['content-type'];
            const allowedFormats = ['image/png', 'image/jpg', 'image/jpeg'];
            const isValidFormat = allowedFormats.includes(contentType);

            // Check the size (in bytes). 80KB = 80 * 1024 bytes
            const minSize = 80 * 1024;
            const isValidSize = buffer.length > minSize;

            if (isValidFormat && isValidSize) {
                // Extract and sanitize the file name
                const imageNameRaw = path.basename(new URL(imageUrl).pathname);
                const imageName = imageNameRaw.replace(/[^a-z0-9.]/gi, '_');
                const imagePath = path.join(imagesFolder, imageName);

                // Save the image
                fs.writeFileSync(imagePath, buffer, 'binary');
                return imageName; // Return the image name for further processing
            }

            // If the image does not meet criteria, return null to indicate it was skipped
            return null;
        });

        const downloadedImages = (await Promise.all(downloadPromises)).filter(name => name !== null);
        res.json({ message: `${downloadedImages.length} images meeting criteria have been downloaded and stored locally.`, downloadedImages });
    } catch (error) {
        console.error('Failed to download images:', error);
        res.status(500).json({ message: 'Failed to download images', error: error.toString() });
    }
});



// Route for storing page data including scrollable screenshot
// Assuming screenshotsDir is defined as an absolute path
console.log(`Screenshots directory: ${screenshotsDir}`);

// Adjusted endpoint to store page data including likes, comments, and shares
app.post('/api/storeData', async (req, res) => {
    const { title, description, url, screenshotDataUrl, likes, comments, shares } = req.body; // Extract new fields from the request body

    try {
        let finalPath = screenshotDataUrl;
        if (isValidDataUrl(screenshotDataUrl)) {
            const savedPath = await saveScreenshot(screenshotDataUrl);
            finalPath = `/screenshots/${path.basename(savedPath)}`;
        }

        // Include likes, comments, and shares in the new page document
        const pageData = new Page({ 
            title, 
            description, 
            url, 
            screenshotDataUrl: finalPath,
            likes, // Store likes
            comments, // Store comments
            shares, // Store shares
            date: new Date()
        });

        await pageData.save();

        res.json({ message: 'Data saved successfully!', pageData });
    } catch (err) {
        console.error('Failed to save data:', err);
        res.status(500).send('Failed to save data');
    }
});

// Route for processing and storing scrollable screenshots
app.post('/api/processScrollScreenshots', async (req, res) => {
    const { images } = req.body;
    if (!images || !Array.isArray(images)) {
        return res.status(400).json({ message: 'Invalid request: images array is missing or invalid.' });
    }

    let yOffset = 0;
    let maxWidth = 0;
    let canvasHeight = 0;
    let compositeOperations = [];

    try {
        // First, let's calculate the total height and max width without writing files
        for (const dataUrl of images) {
            const buffer = Buffer.from(dataUrl.split(',')[1], 'base64');
            const image = sharp(buffer);
            const meta = await image.metadata();

            maxWidth = Math.max(maxWidth, meta.width);
            // Adjust canvasHeight calculation to include the first image's full height and subtract overlap for others
            canvasHeight += (yOffset > 0 ? meta.height - 100 : meta.height);
            yOffset += (yOffset > 0 ? meta.height - 100 : meta.height); // Adjust yOffset increment
        }

        // Reset yOffset for composite operations
        yOffset = 0;

        // Prepare composite operations
        for (const dataUrl of images) {
            const buffer = Buffer.from(dataUrl.split(',')[1], 'base64');

            compositeOperations.push({
                input: buffer,
                top: yOffset,
                left: 0
            });

            // Read metadata again (consider optimizing by storing metadata from the first loop)
            const meta = await sharp(buffer).metadata();
            yOffset += (yOffset > 0 ? meta.height - 100 : meta.height); // Adjust yOffset increment
        }

        // Create the final stitched image
        let finalImage = sharp({
            create: {
                width: maxWidth,
                height: canvasHeight,
                channels: 4,
                background: { r: 0, g: 0, b: 0, alpha: 0 }
            }
        }).composite(compositeOperations);

        // Save the final stitched image
        const finalFilename = `stitched_${Date.now()}.png`;
        const finalPath = path.join(screenshotsDir, finalFilename);
        await finalImage.toFile(finalPath);

        res.status(200).json({ message: 'Screenshots processed', finalImagePath: finalPath });
    } catch (error) {
        console.error('Error during screenshot processing:', error);
        res.status(500).json({ message: 'Error processing screenshots', error: error.message });
    }
});

// Utility function to save screenshot
function isValidDataUrl(s) {
    return /^data:image\/([a-zA-Z]*);base64,([^\"]*)$/.test(s);
}

// Modified saveScreenshot function to handle only data URLs
async function saveScreenshot(screenshotDataUrl) {
    if (!isValidDataUrl(screenshotDataUrl)) {
        console.error('Provided string is not a valid data URL.');
        return null; // Return null indicating failure to process invalid data URL
    }

    const matches = screenshotDataUrl.match(/^data:(.+);base64,(.*)$/);
    const ext = matches[1].split('/')[1].split(';')[0]; // Extract file extension
    const data = Buffer.from(matches[2], 'base64');
    const filename = `screenshot-${Date.now()}.${ext}`;
    const filepath = path.join(screenshotsDir, filename);

    fs.writeFileSync(filepath, data, 'binary');
    console.log(`Screenshot saved to ${filepath}`);
    return filepath; // Return the path of the saved file
}


// Start the server
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});