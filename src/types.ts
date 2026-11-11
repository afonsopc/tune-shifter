export interface MediaInfo {
  id: number;
  type: "audio" | "video";
  src: string;
  title: string;
  paused: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  volumeEnabled: boolean;
  playbackRate: number;
  preservesPitch: boolean;
  muted: boolean;
  reverb: number;
  reverbEnabled: boolean;
  /** Reverb is on but Safari (iOS) waits for a tap on the page to start audio. */
  reverbPending?: boolean;
  reverbSupported?: boolean;
  volumeSupported: boolean;
}
