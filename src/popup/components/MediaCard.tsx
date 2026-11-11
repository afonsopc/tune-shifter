import { useCallback } from "react";
import type { MediaInfo } from "../../types";
import { SliderControl } from "./SliderControl";
import { ToggleSwitch } from "./ToggleSwitch";

interface MediaCardProps {
  media: MediaInfo;
  onSetVolume: (id: number, value: number) => void;
  onSetVolumeEnabled: (id: number, value: boolean) => void;
  onSetPlaybackRate: (id: number, value: number) => void;
  onSetPreservesPitch: (id: number, value: boolean) => void;
  onSetMuted: (id: number, value: boolean) => void;
  onSetReverb: (id: number, value: number) => void;
  onSetReverbEnabled: (id: number, value: boolean) => void;
}

const RATE_PRESETS = [
  { label: "0.5", value: 0.5 },
  { label: "0.8", value: 0.8 },
  { label: "1", value: 1 },
  { label: "1.25", value: 1.25 },
  { label: "1.5", value: 1.5 },
  { label: "2", value: 2 },
];

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatRate(rate: number): string {
  return `${parseFloat(rate.toFixed(2))}×`;
}

export function MediaCard({
  media,
  onSetVolume,
  onSetVolumeEnabled,
  onSetPlaybackRate,
  onSetPreservesPitch,
  onSetMuted,
  onSetReverb,
  onSetReverbEnabled,
}: MediaCardProps) {
  const id = media.id;
  const setVolume = useCallback((v: number) => onSetVolume(id, v), [id, onSetVolume]);
  const setVolumeEnabled = useCallback((v: boolean) => onSetVolumeEnabled(id, v), [id, onSetVolumeEnabled]);
  const setRate = useCallback((v: number) => onSetPlaybackRate(id, v), [id, onSetPlaybackRate]);
  const setPitch = useCallback((v: boolean) => onSetPreservesPitch(id, v), [id, onSetPreservesPitch]);
  const toggleMute = useCallback(() => onSetMuted(id, !media.muted), [id, media.muted, onSetMuted]);
  const setReverb = useCallback((v: number) => onSetReverb(id, v), [id, onSetReverb]);
  const setReverbEnabled = useCallback((v: boolean) => onSetReverbEnabled(id, v), [id, onSetReverbEnabled]);

  const time = formatTime(media.currentTime);
  const duration = formatTime(media.duration);

  return (
    <section className="media">
      <div className="media-head">
        <span className={`dot ${media.paused ? "" : "on"}`} aria-hidden />
        <span className="media-title" title={media.title}>
          {media.title}
        </span>
        {time && <span className="media-time">{duration ? `${time} / ${duration}` : time}</span>}
        <button
          className={`icon-btn ${media.muted ? "muted" : ""}`}
          onClick={toggleMute}
          title={media.muted ? "Unmute" : "Mute"}
          aria-label={media.muted ? "Unmute" : "Mute"}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            {media.muted ? (
              <>
                <line x1="22" y1="9" x2="16" y2="15" />
                <line x1="16" y1="9" x2="22" y2="15" />
              </>
            ) : (
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            )}
          </svg>
        </button>
      </div>

      <SliderControl
        label="Speed"
        value={media.playbackRate}
        min={0.25}
        max={2}
        step={0.01}
        displayValue={formatRate(media.playbackRate)}
        onChange={setRate}
        presets={RATE_PRESETS}
      />

      <ToggleSwitch label="Preserve pitch" checked={media.preservesPitch} onChange={setPitch} />

      <ToggleSwitch label="Reverb" checked={media.reverbEnabled} onChange={setReverbEnabled} />
      {media.reverbPending && <p className="hint">Tap the page once to start the reverb.</p>}
      {media.reverbEnabled && !media.reverbPending && (
        <SliderControl
          label="Mix"
          value={media.reverb}
          min={0}
          max={1}
          step={0.01}
          displayValue={`${Math.round(media.reverb * 100)}%`}
          onChange={setReverb}
          nested
        />
      )}

      {media.volumeSupported !== false && (
        <>
          <ToggleSwitch label="Override volume" checked={media.volumeEnabled} onChange={setVolumeEnabled} />
          {media.volumeEnabled && (
            <SliderControl
              label="Volume"
              value={media.volume}
              min={0}
              max={1}
              step={0.01}
              displayValue={`${Math.round(media.volume * 100)}%`}
              onChange={setVolume}
              nested
            />
          )}
        </>
      )}
    </section>
  );
}
