import type { MediaInfo } from "../../types";
import { MediaCard } from "./MediaCard";

interface MediaListProps {
  media: MediaInfo[];
  onSetVolume: (id: number, value: number) => void;
  onSetVolumeEnabled: (id: number, value: boolean) => void;
  onSetPlaybackRate: (id: number, value: number) => void;
  onSetPreservesPitch: (id: number, value: boolean) => void;
  onSetMuted: (id: number, value: boolean) => void;
  onSetReverb: (id: number, value: number) => void;
  onSetReverbEnabled: (id: number, value: boolean) => void;
}

export function MediaList({
  media,
  onSetVolume,
  onSetVolumeEnabled,
  onSetPlaybackRate,
  onSetPreservesPitch,
  onSetMuted,
  onSetReverb,
  onSetReverbEnabled,
}: MediaListProps) {
  if (media.length === 0) {
    return (
      <p className="status">
        No audio or video on this page yet. Start playing something and it shows up here.
      </p>
    );
  }

  return (
    <div className="media-list">
      {media.map((m) => (
        <MediaCard
          key={m.id}
          media={m}
          onSetVolume={onSetVolume}
          onSetVolumeEnabled={onSetVolumeEnabled}
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
