import { useState, useEffect, useCallback, useRef } from "react";
import type { MediaInfo } from "../../types";

const POLL_INTERVAL = 500;

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

const IS_SAFARI = /^((?!chrome|android|crios|fxios|edg).)*safari/i.test(
  navigator.userAgent
);

/**
 * Safari only runs manifest content scripts on sites the user has allowed.
 * Opening the popup grants activeTab, so inject the script ourselves when it
 * isn't there yet. (`scripting` is only requested by the Safari build.)
 */
async function injectContentScript(tabId: number): Promise<boolean> {
  if (!chrome.scripting?.executeScript) return false;
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: false },
      files: ["content/content.js"],
    });
    return true;
  } catch {
    return false;
  }
}

export function useMediaList() {
  const [media, setMedia] = useState<MediaInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const tabIdRef = useRef<number | null>(null);
  const injectTriedRef = useRef(false);

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

      let response;
      try {
        response = await queryContentScript(tabIdRef.current, {
          action: "getMedia",
        });
      } catch (err) {
        if (injectTriedRef.current) throw err;
        injectTriedRef.current = true;
        if (!(await injectContentScript(tabIdRef.current))) throw err;
        response = await queryContentScript(tabIdRef.current, {
          action: "getMedia",
        });
      }

      if (response?.media) {
        setMedia(response.media);
        setError(null);
      }
    } catch (err) {
      setError(
        IS_SAFARI
          ? "Tune Shifter can't access this page yet. Allow it for this website in Safari (Always Allow on This Website), then reload the page."
          : "Cannot access this page. Try reloading or navigating to a regular webpage."
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
                // Adjusting volume implicitly takes over the page volume.
                return { ...m, volume: value as number, volumeEnabled: true };
              case "setVolumeEnabled":
                return { ...m, volumeEnabled: value as boolean };
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
