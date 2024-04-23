chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    switch (request.action) {
        case "storeData":
            // Assuming you have an API setup to handle the storage of page data
            storePageData(request.data);
            break;
        case "downloadFile":
            // Handles the downloading of text files (e.g., page content)
            downloadFile(request.fileUrl, request.filename);
            break;
        case "downloadImages":
            // Initiates the downloading of images as requested from the content script
            downloadImages(request.imageUrls);
            break;
        case "captureVisibleTab":
            // Captures the visible part of the current tab
            captureVisibleTab(sendResponse);
            // Must return true when async response is expected
            return true; 
        case "scrollComplete":
            // Handles the completion of scrollable screenshot capturing
            processScrollableScreenshots(request.images, sendResponse);
            // Must return true when async response is expected
            return true;

        case "storeFacebookPostData":
            // Handles the storage of Facebook post data (likes, comments, shares)
            storePageData(request.data);
            break;
        default:
            console.error("Unrecognized action:", request.action);
    }
});

function storePageData(data) {
    fetch('http://localhost:3000/api/storeData', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(data)
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        if (response.headers.get("Content-Type").includes("application/json")) {
            return response.json();
        } else {
            // If it's not JSON, log the response text to see what's coming back
            response.text().then(text => console.log(text));
            throw new Error('Expected JSON response from the server');
        }
    })
    .then(data => console.log("Data stored:", data))
    .catch(error => console.error('Error storing data:', error));
}


function downloadFile(fileUrl, filename) {
    chrome.downloads.download({
        url: fileUrl,
        filename: filename,
        saveAs: true
    }, function(downloadId) {
        if (chrome.runtime.lastError) {
            console.error('Error downloading file:', chrome.runtime.lastError);
        } else {
            console.log('File download started with ID:', downloadId);
        }
    });
}

function downloadImages(imageUrls) {
    // This example sends the image URLs to an API that handles downloading.
    // Adjust based on your actual implementation details.
    fetch('http://localhost:3000/api/downloadImages', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ imageUrls: imageUrls })
    })
    .then(response => response.json())
    .then(data => console.log("Images processed:", data))
    .catch(error => console.error('Error processing images:', error));
}

function captureVisibleTab(sendResponse) {
    try {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            chrome.tabs.captureVisibleTab(tabs[0].windowId, {format: 'png'}, function(dataUrl) {
                if (chrome.runtime.lastError) {
                    console.error('Error capturing the visible tab:', chrome.runtime.lastError.message);
                    sendResponse({error: chrome.runtime.lastError.message});
                } else {
                    sendResponse({image: dataUrl});
                }
            });
        });
    } catch (error) {
        console.error('Exception when capturing the visible tab:', error);
        sendResponse({error: error.message});
    }
    return true; // indicates you wish to send a response asynchronously
}

function processScrollableScreenshots(images, sendResponse) {
    // Process or store the stitched image from scrollable screenshots
    // This function is a placeholder for whatever processing needs to happen with the screenshots
    console.log("Processing scrollable screenshots...");
    // Example: Sending the screenshots to a server for processing
    fetch('http://localhost:3000/api/processScrollScreenshots', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ images: images })
    })
    .then(response => response.json())
    .then(data => {
        console.log("Scrollable screenshots processed:", data);
        sendResponse({success: true, data: data});
    })
    .catch(error => {
        console.error('Error processing scrollable screenshots:', error);
        sendResponse({success: false, error: error});
    });
    return true; // Async response
}