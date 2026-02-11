/**
 * Tune Shifter — Background Service Worker
 *
 * Minimal service worker for Manifest V3.
 * Handles extension lifecycle and can relay messages if needed.
 */

chrome.runtime.onInstalled.addListener(() => {
  console.log("Tune Shifter installed");
});
