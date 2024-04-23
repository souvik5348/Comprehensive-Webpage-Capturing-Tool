let globalFeatures = {};
let lastScrollPosition = 0;
let scrollInterval = 1000; // Default to 1 second, can be adjusted as needed
let screenshotDataUrls = []; // To store the URLs of captured screenshots for stitching
const overlapHeight = 100; // Height in pixels to overlap each screenshot
const renderingDelay = 500; // Time in milliseconds to wait for page rendering after scrolling
let initialCaptureCompleted = false; // Flag to indicate if the initial screen capture is complete

// Overlay and rectangle drawing variables
let overlay, rectangle, startX, startY, isDragging = false;

// Function to toggle the display of the navbar
function toggleNavbar(hide) {
    const navbarSelectors = ['nav', '.navbar', 'header'];
    navbarSelectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(element => {
            element.style.display = hide ? 'none' : '';
        });
    });
}

// Function to smoothly scroll to the top of the page
function scrollToTop(callback) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(callback, 1000); // Delay to ensure the page has scrolled to the top
}

// Function to capture the initial screen including the navbar
function captureInitialScreen() {
    console.log('Capturing initial screen with navbar...');
    toggleNavbar(false); // Ensure the navbar is displayed
    // Use a slight delay to ensure any page reflows have finished
    setTimeout(() => {
        chrome.runtime.sendMessage({ action: "captureVisibleTab" }, (response) => {
            if (response && response.image) {
                // Save the initial screenshot URL
                screenshotDataUrls.push(response.image);
                console.log('Initial screen with navbar captured.');
                initialCaptureCompleted = true;
                toggleNavbar(true); // Now hide the navbar and proceed with the rest of the page
                setTimeout(captureAndScroll, renderingDelay); // Continue with scrolling capture
            } else {
                console.error('Error capturing initial screen:', response.error);
            }
        });
    }, 100); // Delay for navbar display adjustment
}

// Function to capture the viewport and scroll
function captureAndScroll() {
    if (!initialCaptureCompleted) {
        captureInitialScreen();
        return; // Exit function and wait for initial capture to complete
    }

    // Calculate the maximum scroll position
    const maxScrollPosition = document.documentElement.scrollHeight - window.innerHeight;
    // Check if we've reached the bottom of the page
    if (lastScrollPosition < maxScrollPosition) {
        // Scroll the page
        window.scrollBy(0, window.innerHeight - overlapHeight);
        lastScrollPosition += window.innerHeight - overlapHeight;
        // Delay for rendering
        setTimeout(() => {
            // Now take the screenshot
            chrome.runtime.sendMessage({action: "captureVisibleTab"}, (response) => {
                // Check if the screenshot was successful
                if (response && response.image) {
                    screenshotDataUrls.push(response.image);
                    // Log for debugging
                    console.log(`Captured screenshot at position: ${lastScrollPosition}`);
                    // Recursively call to scroll and capture next part of the page
                    setTimeout(captureAndScroll, scrollInterval);
                } else {
                    console.error('Error capturing screenshot:', response.error);
                }
            });
        }, renderingDelay);
    } else {
        // We've finished capturing the page
        finishCaptureProcess();
    }
}

function finishCaptureProcess() {
    toggleNavbar(false);

    fetch('http://localhost:3000/api/processScrollScreenshots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images: screenshotDataUrls })
    })
    .then(response => response.json())
    .then(data => {
        if(data.finalImagePath) {
            return fetch('http://localhost:3000/api/storeData', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: document.title,
                    description: "A description", // You might want to dynamically fetch or specify this
                    url: window.location.href,
                    screenshotDataUrl: data.finalImagePath
                })
            });
        } else {
            throw new Error('Failed to process screenshots.');
        }
    })
    .then(response => response.json())
    .then(data => console.log("Scrollable screenshot path saved in DB:", data))
    .catch(error => console.error("Error during processing and storing scrollable screenshot path:", error));

    scrollToTop();
    screenshotDataUrls = []; // Clear for future captures
}

// Handle settings for enabling/disabling features
function handleSettings() {
    if (globalFeatures.captureTitle || globalFeatures.captureDescription) {
        sendDataBasedOnFeatures();
    }
    if (globalFeatures.copyText) {
        copyTextToClipboard();
    }
    if (globalFeatures.downloadImages) {
        downloadPageImages();
    }
    if (globalFeatures.rectangularScreenshot) {
        toggleOverlay();
    }
    if (globalFeatures.scrollableScreenshot) {
        // Begin the scrollable screenshot process
        toggleNavbar(true); // Hide the navbar
        scrollToTop(() => {
            lastScrollPosition = 0; // Reset scroll position
            setTimeout(captureAndScroll, scrollInterval); // Start capture process
        });
    }

    if (globalFeatures.facebookPostData) {
        // Now call the new function to handle Facebook post data
        handleFacebookPostData();
    }
}



// Listen for messages from the background script or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "startScrollCapture") {
        globalFeatures.scrollableScreenshot = true;
        lastScrollPosition = 0; // Reset scroll position
        initialCaptureCompleted = false; // Reset initial capture flag
        captureInitialScreen(); // Start with the initial screen capture
    } else if (request.action === "applySettings") {
        globalFeatures = request.features;
        handleSettings();
    }
    // Additional message handling can be added here if needed
});

// At the top of content.js, include the parseSocialCount function provided in the reference
function parseSocialCount(text) {
    if (text.includes('K')) {
        let number = text.replace(/[^\d.]/g, '');
        return Math.round(parseFloat(number) * 1000);
    } else {
        return parseInt(text.replace(/[^\d]/g, ''), 10);
    }
}

// Wait for an element to appear in the DOM
function waitForElement(selector, callback) {
    console.log(`Waiting for element: ${selector}`);
    const observer = new MutationObserver((mutations, me) => {
        const element = document.querySelector(selector);
        if (element) {
            console.log(`Element found: ${selector}`);
            me.disconnect(); // Stop observing
            callback(element);
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

// Adjusted MutationObserver to include logging
function handleFacebookPostData() {
    console.log("Starting to handle Facebook post data...");

    waitForElement('span.x1e558r4', (likesElement) => {
        console.log("Likes element found, parsing likes...");
        const likes = parseSocialCount(likesElement.innerText);
        console.log(`Likes: ${likes}`);
        // Continue with sending data
    });

    waitForElement('span.x193iq5w:first-of-type', (commentsElement) => {
        console.log("Comments element found, parsing comments...");
        const comments = parseSocialCount(commentsElement.innerText);
        console.log(`Comments: ${comments}`);
        // Continue with sending data
    });

    waitForElement('span.x193iq5w:last-of-type', (sharesElement) => {
        console.log("Shares element found, parsing shares...");
        const shares = parseSocialCount(sharesElement.innerText);
        console.log(`Shares: ${shares}`);
        // Continue with sending data
    });
}
// Ensure handleFacebookPostData is called within handleSettings or wherever appropriate

function sendDataBasedOnFeatures() {
    let dataToStore = { url: window.location.href };
    if (globalFeatures.captureTitle) {
        dataToStore.title = document.title;
    }
    if (globalFeatures.captureDescription) {
        const metaDescription = document.querySelector('meta[name="description"]');
        if (metaDescription) {
            dataToStore.description = metaDescription.content;
        }
    }
    if (!globalFeatures.rectangularScreenshot) {
        sendPageData(dataToStore);
    }
}

function sendPageData(data) {
    fetch('http://localhost:3000/api/storeData', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(data)
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        console.log("Data stored successfully:", data);
        if (globalFeatures.rectangularScreenshot) {
            // Only remove overlay if this function is also handling screenshots
            removeOverlay();
        }
    })
    .catch(error => {
        console.error("Error storing data:", error);
        removeOverlay();
    });
}

function copyTextToClipboard() {
    const allText = document.body.innerText;
    const blob = new Blob([allText], {type: 'text/plain'});
    const textFileUrl = URL.createObjectURL(blob);
    chrome.runtime.sendMessage({action: "downloadFile", fileUrl: textFileUrl, filename: 'page-content.txt'});
}

function downloadPageImages() {
    const images = Array.from(document.images)
        .filter(img => img.src && !img.src.endsWith('.svg') && img.naturalWidth > 50 && img.naturalHeight > 50)
        .map(img => img.src);
    chrome.runtime.sendMessage({action: "downloadImages", imageUrls: images});
}


function toggleOverlay() {
    if (!document.getElementById('extensionOverlay')) {
        createOverlay();
    } else {
        removeOverlay();
    }
}

function createOverlay() {
    removeOverlay();
    overlay = document.createElement('div');
    overlay.id = 'extensionOverlay';
    document.body.appendChild(overlay);
    Object.assign(overlay.style, {
        position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0, 0, 0, 0.5)', zIndex: 10000, cursor: 'crosshair'
    });

    rectangle = document.createElement('div');
    Object.assign(rectangle.style, {
        position: 'absolute', border: '2px solid red', zIndex: '10001'
    });
    overlay.appendChild(rectangle);

    addEventListeners();
}

function addEventListeners() {
    overlay.addEventListener('mousedown', startDrawing);
    overlay.addEventListener('mousemove', drawRectangle);
    overlay.addEventListener('mouseup', (e) => stopDrawing(e));
}

function startDrawing(e) {
    isDragging = true;
    [startX, startY] = [e.clientX, e.clientY];
    updateRectangle(0, 0, startX, startY);
}

function drawRectangle(e) {
    if (!isDragging) return;
    let width = Math.abs(e.clientX - startX), height = Math.abs(e.clientY - startY);
    updateRectangle(width, height, Math.min(startX, e.clientX), Math.min(startY, e.clientY));
}

function stopDrawing(e) {
    if (!isDragging) return;
    isDragging = false;
    let width = Math.abs(e.clientX - startX);
    let height = Math.abs(e.clientY - startY);

    // Remove overlay immediately after drawing the rectangle
    removeOverlayImmediately();

    // Use the browser's setTimeout to ensure the removal of the overlay has time to propagate
    setTimeout(() => {
        captureRectangleArea(startX + window.scrollX, startY + window.scrollY, width, height);
    }, 100); // 100ms timeout
}

function removeOverlayImmediately() {
    if (overlay) {
        overlay.style.display = 'none';
    }
    if (rectangle) {
        rectangle.style.display = 'none';
    }
}

function captureRectangleArea(x, y, width, height) {
    // Use a delay to wait for the browser to complete rendering after scroll and overlay removal
    setTimeout(() => {
        chrome.runtime.sendMessage({ action: "captureVisibleTab" }, function(response) {
            if (response && response.image) {
                cropImage(response.image, x, y, width, height);
            } else {
                console.error("Failed to capture the page.");
                // If it fails, the overlay should already be removed so no need to call removeOverlay here
            }
        });
    }, 100); // Adjust as needed
}

// ... [rest of the code]

function cropImage(dataUrl, x, y, width, height) {
    const img = new Image();
    img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const devicePixelRatio = window.devicePixelRatio || 1;
        canvas.width = width * devicePixelRatio;
        canvas.height = height * devicePixelRatio;

        // Subtract the scroll position from the coordinates
        x = x * devicePixelRatio - window.scrollX * devicePixelRatio;
        y = y * devicePixelRatio - window.scrollY * devicePixelRatio;

        ctx.drawImage(img, x, y, width * devicePixelRatio, height * devicePixelRatio,
                      0, 0, width * devicePixelRatio, height * devicePixelRatio);

        const croppedDataUrl = canvas.toDataURL('image/jpeg', 0.5); // Adjust the quality as needed

        sendCroppedImage({ screenshotDataUrl: croppedDataUrl });
    };
    img.src = dataUrl;
}

function sendCroppedImage(croppedData) {
    let dataToStore = {
        url: window.location.href,
        screenshotDataUrl: croppedData.screenshotDataUrl
    };

    if (globalFeatures.captureTitle) {
        dataToStore.title = document.title;
    }

    if (globalFeatures.captureDescription) {
        const metaDescription = document.querySelector('meta[name="description"]');
        if (metaDescription) {
            dataToStore.description = metaDescription.content;
        }
    }

    sendPageData(dataToStore);
}


function updateRectangle(width, height, left, top) {
    Object.assign(rectangle.style, {
        width: `${width}px`,
        height: `${height}px`,
        left: `${left}px`,
        top: `${top}px`
    });
}

function removeOverlay() {
    if (overlay) {
        document.body.removeChild(overlay);
        overlay = null;
    }
    if (rectangle) {
        rectangle.remove();
        rectangle = null;
    }
    // Ensures the overlay and rectangle are fully cleaned up
}