import { useCallback } from "react";
import { useMediaList } from "./hooks/useMediaList";
import { MediaList } from "./components/MediaList";

export default function App() {
  const { media, error, loading, sendCommand } = useMediaList();

  const handleSetVolume = useCallback(
    (id: number, value: number) => sendCommand("setVolume", id, value),
    [sendCommand]
  );

  const handleSetPlaybackRate = useCallback(
    (id: number, value: number) => sendCommand("setPlaybackRate", id, value),
    [sendCommand]
  );

  const handleSetPreservesPitch = useCallback(
    (id: number, value: boolean) =>
      sendCommand("setPreservesPitch", id, value),
    [sendCommand]
  );

  const handleSetMuted = useCallback(
    (id: number, value: boolean) => sendCommand("setMuted", id, value),
    [sendCommand]
  );

  const handleSetReverb = useCallback(
    (id: number, value: number) => sendCommand("setReverb", id, value),
    [sendCommand]
  );

  const handleSetReverbEnabled = useCallback(
    (id: number, value: boolean) => sendCommand("setReverbEnabled", id, value),
    [sendCommand]
  );

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-logo">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M9 18V5l12-2v13" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="16" r="3" />
          </svg>
          <h1>Tune Shifter</h1>
        </div>
        {!loading && !error && (
          <span className="media-count">
            {media.length} {media.length === 1 ? "source" : "sources"}
          </span>
        )}
      </header>

      <main className="app-content">
        {loading ? (
          <div className="loading">
            <div className="spinner" />
            <p>Scanning page...</p>
          </div>
        ) : error ? (
          <div className="error-state">
            <p>{error}</p>
          </div>
        ) : (
          <MediaList
            media={media}
            onSetVolume={handleSetVolume}
            onSetPlaybackRate={handleSetPlaybackRate}
            onSetPreservesPitch={handleSetPreservesPitch}
            onSetMuted={handleSetMuted}
            onSetReverb={handleSetReverb}
            onSetReverbEnabled={handleSetReverbEnabled}
          />
        )}
      </main>
    </div>
  );
}
