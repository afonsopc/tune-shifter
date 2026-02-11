import { useState, useEffect, useCallback, useRef } from "react";
import type { MediaInfo } from "../../types";

const POLL_INTERVAL = 500;

async function injectContentScript(tabId: number): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content/content.js"]
    });
    // Wait a bit for script to initialize
    await new Promise(resolve => setTimeout(resolve, 100));
  } catch (e) {
    throw e;
  }
}

async function queryContentScript(
  tabId: number,
  message: Record<string, unknown>
): Promise<any> {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

export function useMediaList() {
  const [media, setMedia] = useState<MediaInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const tabIdRef = useRef<number | null>(null);

  const fetchMedia = useCallback(async () => {
    try {
      if (tabIdRef.current === null) {
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        if (!tab?.id) {
          setError("No active tab found");
          setLoading(false);
          return;
        }
        tabIdRef.current = tab.id;
      }

      const tabId = tabIdRef.current;

      // Try to query, inject if needed
      try {
        const response = await queryContentScript(tabId, {
          action: "getMedia",
        });
        if (response?.media) {
          setMedia(response.media);
          setError(null);
        }
      } catch {
        // Content script not injected, try to inject it
        try {
          await injectContentScript(tabId);
          // Try again after injection
          const response = await queryContentScript(tabId, {
            action: "getMedia",
          });
          if (response?.media) {
            setMedia(response.media);
            setError(null);
          }
        } catch (injectErr) {
          setError(
            "Cannot access this page. Try reloading or navigating to a regular webpage."
          );
        }
      }
    } catch (err) {
      setError(
        "Cannot access this page. Try reloading or navigating to a regular webpage."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMedia();
    const interval = setInterval(fetchMedia, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchMedia]);

  const sendCommand = useCallback(
    async (action: string, id: number, value: number | boolean) => {
      if (tabIdRef.current === null) return;
      try {
        await queryContentScript(tabIdRef.current, { action, id, value });
        // Optimistic update
        setMedia((prev) =>
          prev.map((m) => {
            if (m.id !== id) return m;
            switch (action) {
              case "setVolume":
                return { ...m, volume: value as number };
              case "setPlaybackRate":
                return { ...m, playbackRate: value as number };
              case "setPreservesPitch":
                return { ...m, preservesPitch: value as boolean };
              case "setMuted":
                return { ...m, muted: value as boolean };
              case "setReverb":
                return { ...m, reverb: value as number };
              case "setReverbEnabled":
                return { ...m, reverbEnabled: value as boolean };
              default:
                return m;
            }
          })
        );
      } catch {
        // Will be corrected on next poll
      }
    },
    []
  );

  return { media, error, loading, sendCommand };
}
