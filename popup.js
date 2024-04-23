document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('applySettings').addEventListener('click', function() {
        let selectedFeatures = {};
        document.querySelectorAll('#featuresForm input[type="checkbox"]').forEach(checkbox => {
            selectedFeatures[checkbox.id] = checkbox.checked;
        });

        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            chrome.tabs.sendMessage(tabs[0].id, {action: "applySettings", features: selectedFeatures});
        });
    });
});
