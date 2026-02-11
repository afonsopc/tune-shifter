/**
 * Tune Shifter — Content Script
 *
 * Injected into every page to detect <audio> and <video> elements,
 * track dynamically created ones, and respond to popup commands.
 * 
 * Features: Volume, PlaybackRate, PreservesPitch, Mute, Reverb (Web Audio API)
 * Persistence: Settings are saved to chrome.storage and restored on new media
 */

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
  reverb: number;
}

export interface PersistedSettings {
  volume: number;
  playbackRate: number;
  preservesPitch: boolean;
  muted: boolean;
  reverb: number;
}

export type MessageRequest =
  | { action: "getMedia" }
  | { action: "setVolume"; id: number; value: number }
  | { action: "setPlaybackRate"; id: number; value: number }
  | { action: "setPreservesPitch"; id: number; value: boolean }
  | { action: "setMuted"; id: number; value: boolean }
  | { action: "setReverb"; id: number; value: number };

const DEFAULT_SETTINGS: PersistedSettings = {
  volume: 1,
  playbackRate: 1,
  preservesPitch: true,
  muted: false,
  reverb: 0,
};

// Current settings (loaded from storage or defaults)
let currentSettings: PersistedSettings = { ...DEFAULT_SETTINGS };

// Load settings from storage on startup
async function loadSettings(): Promise<void> {
  try {
    const result = await chrome.storage.local.get(['tuneShifterSettings']);
    if (result.tuneShifterSettings) {
      currentSettings = { ...DEFAULT_SETTINGS, ...result.tuneShifterSettings };
    }
  } catch (e) {
    console.log('Tune Shifter: Could not load settings, using defaults');
  }
}

// Save settings to storage
async function saveSettings(): Promise<void> {
  try {
    await chrome.storage.local.set({ tuneShifterSettings: currentSettings });
  } catch (e) {
    console.log('Tune Shifter: Could not save settings');
  }
}

// Audio context singleton
let audioContext: AudioContext | null = null;
let impulseResponseBuffer: AudioBuffer | null = null;

// Media audio graph registry
interface MediaAudioGraph {
  sourceNode: MediaElementAudioSourceNode;
  dryGain: GainNode;
  wetGain: GainNode;
  convolver: ConvolverNode;
  reverbMix: number;
}
const audioGraphRegistry = new Map<number, MediaAudioGraph>();

// Element registry
const mediaRegistry = new Map<number, HTMLMediaElement>();
let nextId = 1;

function getMediaId(el: HTMLMediaElement): number {
  for (const [id, registered] of mediaRegistry) {
    if (registered === el) return id;
  }
  const id = nextId++;
  mediaRegistry.set(id, el);
  return id;
}

/** Apply persisted settings to a media element */
function applyPersistedSettings(el: HTMLMediaElement, id: number): void {
  el.volume = currentSettings.volume;
  el.playbackRate = currentSettings.playbackRate;
  (el as any).preservesPitch = currentSettings.preservesPitch;
  (el as any).mozPreservesPitch = currentSettings.preservesPitch;
  el.muted = currentSettings.muted;
  
  // Apply reverb if audio graph exists
  if (audioGraphRegistry.has(id)) {
    updateReverbMix(id, currentSettings.reverb);
  }
}

/** Initialize Web Audio context */
async function initAudioContext(): Promise<AudioContext> {
  if (audioContext) return audioContext;
  
  audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  impulseResponseBuffer = await createImpulseResponse(audioContext);
  return audioContext;
}

/** Create white noise buffer */
function createWhiteNoiseBuffer(ctx: AudioContext | OfflineAudioContext): AudioBuffer {
  const decayTime = 3;
  const preDelay = 0.03;
  const bufferLength = (decayTime + preDelay) * ctx.sampleRate;
  const buffer = ctx.createBuffer(2, bufferLength, ctx.sampleRate);
  
  for (let channel = 0; channel < 2; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < bufferLength; i++) {
      channelData[i] = Math.random() * 2 - 1;
    }
  }
  
  return buffer;
}

/** Create impulse response for reverb */
async function createImpulseResponse(audioContext: AudioContext): Promise<AudioBuffer> {
  const decayTime = 3;
  const preDelay = 0.03;
  const sampleRate = audioContext.sampleRate;
  
  const offlineContext = new OfflineAudioContext(
    2,
    (decayTime + preDelay) * sampleRate,
    sampleRate
  );
  
  const bufferSource = offlineContext.createBufferSource();
  bufferSource.buffer = createWhiteNoiseBuffer(offlineContext);
  
  const gain = offlineContext.createGain();
  gain.gain.setValueAtTime(0, 0);
  gain.gain.setValueAtTime(0.8, preDelay);
  gain.gain.exponentialRampToValueAtTime(0.00001, decayTime + preDelay);
  
  bufferSource.connect(gain);
  gain.connect(offlineContext.destination);
  bufferSource.start(0);
  
  return await offlineContext.startRendering();
}

/** Create audio graph for a media element */
async function createAudioGraph(id: number, el: HTMLMediaElement): Promise<MediaAudioGraph> {
  const ctx = await initAudioContext();
  
  if (ctx.state === "suspended") {
    await ctx.resume();
  }
  
  const sourceNode = ctx.createMediaElementSource(el);
  
  const dryGain = ctx.createGain();
  dryGain.gain.value = 1;
  
  const convolver = ctx.createConvolver();
  convolver.buffer = impulseResponseBuffer;
  
  const wetGain = ctx.createGain();
  wetGain.gain.value = 0;
  
  sourceNode.connect(dryGain);
  dryGain.connect(ctx.destination);
  
  sourceNode.connect(convolver);
  convolver.connect(wetGain);
  wetGain.connect(ctx.destination);
  
  const graph: MediaAudioGraph = {
    sourceNode,
    dryGain,
    wetGain,
    convolver,
    reverbMix: 0,
  };
  
  audioGraphRegistry.set(id, graph);
  
  // Apply persisted reverb setting
  updateReverbMix(id, currentSettings.reverb);
  
  return graph;
}

/** Update reverb mix */
function updateReverbMix(id: number, wetMix: number): void {
  const graph = audioGraphRegistry.get(id);
  if (!graph || !audioContext) return;
  
  const dryValue = Math.cos((wetMix * Math.PI) / 2);
  const wetValue = Math.sin((wetMix * Math.PI) / 2);
  
  const now = audioContext.currentTime;
  graph.dryGain.gain.setTargetAtTime(dryValue, now, 0.02);
  graph.wetGain.gain.setTargetAtTime(wetValue, now, 0.02);
  graph.reverbMix = wetMix;
}

/** Ensure audio graph exists */
async function ensureAudioGraph(id: number, el: HTMLMediaElement): Promise<void> {
  if (!audioGraphRegistry.has(id)) {
    await createAudioGraph(id, el);
  }
}

/** Clean up removed elements */
function pruneRegistry() {
  for (const [id, el] of mediaRegistry) {
    if (!document.contains(el) && !el.src && !el.currentSrc) {
      mediaRegistry.delete(id);
      audioGraphRegistry.delete(id);
    }
  }
}

/** Discover all media elements */
function discoverMediaElements(): HTMLMediaElement[] {
  return [
    ...document.querySelectorAll<HTMLAudioElement>("audio"),
    ...document.querySelectorAll<HTMLVideoElement>("video"),
  ];
}

/** Get a friendly title */
function getTitle(el: HTMLMediaElement): string {
  if (el.title) return el.title;
  
  const figure = el.closest("figure");
  if (figure) {
    const caption = figure.querySelector("figcaption");
    if (caption?.textContent) return caption.textContent.trim();
  }
  
  const ariaLabel = el.getAttribute("aria-label");
  if (ariaLabel) return ariaLabel;
  
  const src = el.currentSrc || el.src || "";
  if (src) {
    try {
      const url = new URL(src);
      const filename = url.pathname.split("/").pop();
      if (filename && filename !== "/") {
        return decodeURIComponent(filename);
      }
      return url.hostname;
    } catch {
      return src.slice(0, 60);
    }
  }
  
  const source = el.querySelector("source");
  if (source?.src) {
    try {
      const filename = new URL(source.src).pathname.split("/").pop();
      if (filename) return decodeURIComponent(filename);
    } catch {
      // ignore
    }
  }
  
  return el.tagName.toLowerCase() === "video" ? "Video" : "Audio";
}

/** Build MediaInfo snapshot */
async function buildMediaInfo(el: HTMLMediaElement): Promise<MediaInfo> {
  const id = getMediaId(el);
  
  if (el.readyState >= 1) {
    await ensureAudioGraph(id, el);
  }
  
  const graph = audioGraphRegistry.get(id);
  
  return {
    id,
    type: el.tagName.toLowerCase() === "video" ? "video" : "audio",
    src: el.currentSrc || el.src || "",
    title: getTitle(el),
    paused: el.paused,
    currentTime: el.currentTime,
    duration: el.duration || 0,
    volume: el.volume,
    playbackRate: el.playbackRate,
    preservesPitch:
      (el as any).preservesPitch !== undefined
        ? (el as any).preservesPitch
        : (el as any).mozPreservesPitch !== undefined
          ? (el as any).mozPreservesPitch
          : true,
    muted: el.muted,
    reverb: graph?.reverbMix ?? currentSettings.reverb,
  };
}

/** Get all tracked media */
async function getAllMedia(): Promise<MediaInfo[]> {
  pruneRegistry();
  const elements = discoverMediaElements();
  elements.forEach((el) => getMediaId(el));
  
  const result: MediaInfo[] = [];
  for (const [, el] of mediaRegistry) {
    result.push(await buildMediaInfo(el));
  }
  return result;
}

/** Apply a change to media and persist */
async function applyChange(
  id: number,
  prop: keyof PersistedSettings,
  value: number | boolean
): Promise<boolean> {
  const el = mediaRegistry.get(id);
  if (!el) return false;

  switch (prop) {
    case "volume":
      el.volume = Math.max(0, Math.min(1, value as number));
      currentSettings.volume = el.volume;
      break;
    case "playbackRate":
      el.playbackRate = value as number;
      currentSettings.playbackRate = el.playbackRate;
      break;
    case "preservesPitch":
      (el as any).preservesPitch = value as boolean;
      (el as any).mozPreservesPitch = value as boolean;
      currentSettings.preservesPitch = value as boolean;
      break;
    case "muted":
      el.muted = value as boolean;
      currentSettings.muted = el.muted;
      break;
    case "reverb":
      updateReverbMix(id, Math.max(0, Math.min(1, value as number)));
      currentSettings.reverb = value as number;
      break;
  }
  
  // Save to storage
  await saveSettings();
  return true;
}

// --- Intercept dynamically created Audio/Video elements ---

const OriginalAudio = window.Audio;
const PatchedAudio = function (this: HTMLAudioElement, src?: string) {
  const audio = new OriginalAudio(src);
  const id = getMediaId(audio);
  
  // Apply settings when audio starts playing
  audio.addEventListener('play', () => {
    applyPersistedSettings(audio, id);
    ensureAudioGraph(id, audio);
  }, { once: true });
  
  return audio;
} as unknown as typeof Audio;
PatchedAudio.prototype = OriginalAudio.prototype;
Object.defineProperty(PatchedAudio, "length", { value: 0 });
try {
  (window as any).Audio = PatchedAudio;
} catch {
  // Some environments may not allow this
}

const originalCreateElement = document.createElement.bind(document);
document.createElement = function <K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  options?: ElementCreationOptions
): HTMLElementTagNameMap[K] {
  const el = originalCreateElement(tagName, options);
  const tag = tagName.toLowerCase();
  if (tag === "audio" || tag === "video") {
    const mediaEl = el as unknown as HTMLMediaElement;
    const id = getMediaId(mediaEl);
    
    // Apply settings when element starts playing
    mediaEl.addEventListener('play', () => {
      applyPersistedSettings(mediaEl, id);
      ensureAudioGraph(id, mediaEl);
    }, { once: true });
  }
  return el;
};

// --- MutationObserver ---

const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (!(node instanceof HTMLElement)) continue;
      
      const processMedia = (el: HTMLMediaElement) => {
        const id = getMediaId(el);
        // Apply settings immediately and on play
        applyPersistedSettings(el, id);
        ensureAudioGraph(id, el);
        
        el.addEventListener('play', () => {
          applyPersistedSettings(el, id);
          ensureAudioGraph(id, el);
        }, { once: true });
      };
      
      if (node instanceof HTMLMediaElement) {
        processMedia(node);
      }
      
      const mediaElements = node.querySelectorAll<HTMLMediaElement>("audio, video");
      mediaElements.forEach(processMedia);
    }
  }
});

observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
});

// --- Handle existing elements ---

// Process elements already in the DOM
discoverMediaElements().forEach((el) => {
  const id = getMediaId(el);
  applyPersistedSettings(el, id);
  ensureAudioGraph(id, el);
});

// --- Handle play events ---

document.addEventListener("play", (e) => {
  const target = e.target;
  if (target instanceof HTMLMediaElement) {
    const id = getMediaId(target);
    applyPersistedSettings(target, id);
    ensureAudioGraph(id, target);
  }
}, true);

// --- Message handler ---

chrome.runtime.onMessage.addListener(
  (
    request: MessageRequest,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: any) => void
  ) => {
    const handleAsync = async () => {
      switch (request.action) {
        case "getMedia":
          return { media: await getAllMedia() };
        case "setVolume":
          await applyChange(request.id, "volume", request.value);
          return { ok: true };
        case "setPlaybackRate":
          await applyChange(request.id, "playbackRate", request.value);
          return { ok: true };
        case "setPreservesPitch":
          await applyChange(request.id, "preservesPitch", request.value);
          return { ok: true };
        case "setMuted":
          await applyChange(request.id, "muted", request.value);
          return { ok: true };
        case "setReverb":
          await applyChange(request.id, "reverb", request.value);
          return { ok: true };
        default:
          return { error: "Unknown action" };
      }
    };

    handleAsync().then(sendResponse);
    return true;
  }
);

// --- Initialize ---

loadSettings().then(() => {
  console.log('Tune Shifter: Settings loaded', currentSettings);
});
