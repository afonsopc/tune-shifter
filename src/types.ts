export interface MediaInfo {
  id: number;
  type: "audio" | "video";
  src: string;
  title: string;
  paused: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  playbackRate: number;
  preservesPitch: boolean;
  muted: boolean;
  reverb: number; // 0-1 wet mix
}
