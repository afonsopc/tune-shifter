/**
 * Tune Shifter — Background Service Worker
 *
 * Injects content script when user clicks the extension icon.
 */

chrome.runtime.onInstalled.addListener(() => {
  console.log("Tune Shifter installed");
});

// Inject content script when user clicks the extension icon
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  
  try {
    // Check if content script is already injected
    await chrome.tabs.sendMessage(tab.id, { action: "ping" });
  } catch {
    // Content script not injected, inject it now
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content/content.js"]
      });
    } catch (e) {
      console.error("Failed to inject content script:", e);
    }
  }
});
