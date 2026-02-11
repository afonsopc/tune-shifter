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

      const response = await queryContentScript(tabIdRef.current, {
        action: "getMedia",
      });
      if (response?.media) {
        setMedia(response.media);
        setError(null);
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
