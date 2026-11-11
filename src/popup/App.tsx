import { useCallback } from "react";
import { useMediaList } from "./hooks/useMediaList";
import { MediaList } from "./components/MediaList";

export default function App() {
  const { media, error, loading, sendCommand } = useMediaList();

  const handleSetVolume = useCallback(
    (id: number, value: number) => sendCommand("setVolume", id, value),
    [sendCommand]
  );

  const handleSetVolumeEnabled = useCallback(
    (id: number, value: boolean) => sendCommand("setVolumeEnabled", id, value),
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
      {loading ? (
        <p className="status">Looking for audio and video…</p>
      ) : error ? (
        <p className="status error">{error}</p>
      ) : (
        <MediaList
          media={media}
          onSetVolume={handleSetVolume}
          onSetVolumeEnabled={handleSetVolumeEnabled}
          onSetPlaybackRate={handleSetPlaybackRate}
          onSetPreservesPitch={handleSetPreservesPitch}
          onSetMuted={handleSetMuted}
          onSetReverb={handleSetReverb}
          onSetReverbEnabled={handleSetReverbEnabled}
        />
      )}
    </div>
  );
}
