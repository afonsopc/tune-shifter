import { useCallback } from "react";
import type { MediaInfo } from "../../types";
import { SliderControl } from "./SliderControl";
import { ToggleSwitch } from "./ToggleSwitch";

interface MediaCardProps {
  media: MediaInfo;
  onSetVolume: (id: number, value: number) => void;
  onSetPlaybackRate: (id: number, value: number) => void;
  onSetPreservesPitch: (id: number, value: boolean) => void;
  onSetMuted: (id: number, value: boolean) => void;
  onSetReverb: (id: number, value: number) => void;
}

const RATE_PRESETS = [
  { label: "0.5x", value: 0.5 },
  { label: "0.8x", value: 0.8 },
  { label: "1x", value: 1 },
  { label: "1.2x", value: 1.2 },
  { label: "1.5x", value: 1.5 },
];

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function MediaCard({
  media,
  onSetVolume,
  onSetPlaybackRate,
  onSetPreservesPitch,
  onSetMuted,
  onSetReverb,
}: MediaCardProps) {
  const handleVolumeChange = useCallback(
    (v: number) => onSetVolume(media.id, v),
    [media.id, onSetVolume]
  );

  const handleRateChange = useCallback(
    (v: number) => onSetPlaybackRate(media.id, v),
    [media.id, onSetPlaybackRate]
  );

  const handlePitchToggle = useCallback(
    (v: boolean) => onSetPreservesPitch(media.id, v),
    [media.id, onSetPreservesPitch]
  );

  const handleMuteToggle = useCallback(
    () => onSetMuted(media.id, !media.muted),
    [media.id, media.muted, onSetMuted]
  );

  const handleReverbChange = useCallback(
    (v: number) => onSetReverb(media.id, v),
    [media.id, onSetReverb]
  );

  return (
    <div className={`media-card ${media.paused ? "paused" : "playing"}`}>
      <div className="media-card-header">
        <div className="media-info">
          <span className={`media-type-badge ${media.type}`}>
            {media.type === "video" ? (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="4" width="15" height="16" rx="2" />
                <path d="M17 8l5-3v14l-5-3V8z" />
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 18V5l12-2v13" />
                <circle cx="6" cy="18" r="3" />
                <circle cx="18" cy="16" r="3" />
              </svg>
            )}
            {media.type}
          </span>
          <span className={`media-status ${media.paused ? "paused" : "playing"}`}>
            {media.paused ? "Paused" : "Playing"}
          </span>
        </div>
        <button
          className={`mute-btn ${media.muted ? "muted" : ""}`}
          onClick={handleMuteToggle}
          title={media.muted ? "Unmute" : "Mute"}
        >
          {media.muted ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <line x1="23" y1="9" x2="17" y2="15" />
              <line x1="17" y1="9" x2="23" y2="15" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            </svg>
          )}
        </button>
      </div>

      <div className="media-title" title={media.title}>
        {media.title}
      </div>

      <div className="media-time">
        {formatTime(media.currentTime)} / {formatTime(media.duration)}
      </div>

      <div className="media-controls">
        <SliderControl
          label="Volume"
          value={media.volume}
          min={0}
          max={1}
          step={0.01}
          displayValue={`${Math.round(media.volume * 100)}%`}
          onChange={handleVolumeChange}
        />

        <SliderControl
          label="Speed"
          value={media.playbackRate}
          min={0.5}
          max={2}
          step={0.01}
          displayValue={`${media.playbackRate.toFixed(2)}x`}
          onChange={handleRateChange}
          presets={RATE_PRESETS}
        />

        <SliderControl
          label="Reverb"
          value={media.reverb}
          min={0}
          max={1}
          step={0.01}
          displayValue={`${Math.round(media.reverb * 100)}%`}
          onChange={handleReverbChange}
        />

        <ToggleSwitch
          label="Preserve Pitch"
          checked={media.preservesPitch}
          onChange={handlePitchToggle}
        />
      </div>
    </div>
  );
}
