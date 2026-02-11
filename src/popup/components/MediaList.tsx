import type { MediaInfo } from "../../types";
import { MediaCard } from "./MediaCard";

interface MediaListProps {
  media: MediaInfo[];
  onSetVolume: (id: number, value: number) => void;
  onSetPlaybackRate: (id: number, value: number) => void;
  onSetPreservesPitch: (id: number, value: boolean) => void;
  onSetMuted: (id: number, value: boolean) => void;
  onSetReverb: (id: number, value: number) => void;
  onSetReverbEnabled: (id: number, value: boolean) => void;
}

export function MediaList({
  media,
  onSetVolume,
  onSetPlaybackRate,
  onSetPreservesPitch,
  onSetMuted,
  onSetReverb,
  onSetReverbEnabled,
}: MediaListProps) {
  if (media.length === 0) {
    return (
      <div className="empty-state">
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="empty-icon"
        >
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </svg>
        <p className="empty-title">No media found</p>
        <p className="empty-subtitle">
          Play audio or video on this page and it will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="media-list">
      {media.map((m) => (
        <MediaCard
          key={m.id}
          media={m}
          onSetVolume={onSetVolume}
          onSetPlaybackRate={onSetPlaybackRate}
          onSetPreservesPitch={onSetPreservesPitch}
          onSetMuted={onSetMuted}
          onSetReverb={onSetReverb}
          onSetReverbEnabled={onSetReverbEnabled}
        />
      ))}
    </div>
  );
}
