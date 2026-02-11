/**
 * Tune Shifter — Content Script
 *
 * Features: Volume, PlaybackRate, PreservesPitch, Mute, Reverb (Web Audio API)
 * Persistence: Settings saved per domain
 * Reverb: Only initialized when explicitly enabled
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
  reverbEnabled: boolean;
}

// Settings that are persisted per site
export interface PersistedSettings {
  volume: number;
  playbackRate: number;
  preservesPitch: boolean;
  muted: boolean;
  reverb: number;
}

// Full settings including non-persisted state
export interface SiteSettings extends PersistedSettings {
  reverbEnabled: boolean;
}

export type MessageRequest =
  | { action: "ping" }
  | { action: "getMedia" }
  | { action: "setVolume"; id: number; value: number }
  | { action: "setPlaybackRate"; id: number; value: number }
  | { action: "setPreservesPitch"; id: number; value: boolean }
  | { action: "setMuted"; id: number; value: boolean }
  | { action: "setReverb"; id: number; value: number }
  | { action: "setReverbEnabled"; id: number; value: boolean };

const DEFAULT_SETTINGS: SiteSettings = {
  volume: 1,
  playbackRate: 1,
  preservesPitch: true,
  muted: false,
  reverb: 0,
  reverbEnabled: false,
};

// Get current domain for per-site storage
function getCurrentDomain(): string {
  return window.location.hostname || 'default';
}

// Current site settings
let currentSettings: SiteSettings = { ...DEFAULT_SETTINGS };
let settingsLoaded = false;

// Audio context - only created when reverb is enabled
let audioContext: AudioContext | null = null;
let impulseResponseBuffer: AudioBuffer | null = null;

// Media registry
interface MediaAudioGraph {
  sourceNode: MediaElementAudioSourceNode;
  dryGain: GainNode;
  wetGain: GainNode;
  convolver: ConvolverNode;
  reverbMix: number;
  reverbEnabled: boolean;
}
const audioGraphRegistry = new Map<number, MediaAudioGraph>();
const mediaRegistry = new Map<number, HTMLMediaElement>();
let nextId = 1;

// Load settings for current site (reverbEnabled always starts as false)
async function loadSettings(): Promise<void> {
  try {
    const domain = getCurrentDomain();
    const storageKey = `tuneShifter_${domain}`;
    const result = await chrome.storage.local.get([storageKey]);
    const siteSettings = result[storageKey];
    if (siteSettings && typeof siteSettings === 'object') {
      currentSettings = { ...DEFAULT_SETTINGS, ...siteSettings, reverbEnabled: false };
    } else {
      currentSettings = { ...DEFAULT_SETTINGS };
    }
    settingsLoaded = true;
  } catch (e) {
    currentSettings = { ...DEFAULT_SETTINGS };
    settingsLoaded = true;
  }
}

// Save settings for current site (reverbEnabled is NOT persisted)
async function saveSettings(): Promise<void> {
  try {
    const domain = getCurrentDomain();
    const settingsToSave: PersistedSettings = {
      volume: currentSettings.volume,
      playbackRate: currentSettings.playbackRate,
      preservesPitch: currentSettings.preservesPitch,
      muted: currentSettings.muted,
      reverb: currentSettings.reverb,
    };
    await chrome.storage.local.set({ [`tuneShifter_${domain}`]: settingsToSave });
  } catch (e) {
    // Ignore storage errors
  }
}

function getMediaId(el: HTMLMediaElement): number {
  for (const [id, registered] of mediaRegistry) {
    if (registered === el) return id;
  }
  const id = nextId++;
  mediaRegistry.set(id, el);
  return id;
}

/** Apply settings to media element - only Web Audio if reverb enabled */
function applySettingsToElement(el: HTMLMediaElement, id: number): void {
  // Basic settings always apply
  el.volume = currentSettings.volume;
  el.playbackRate = currentSettings.playbackRate;
  (el as any).preservesPitch = currentSettings.preservesPitch;
  (el as any).mozPreservesPitch = currentSettings.preservesPitch;
  el.muted = currentSettings.muted;
  
  // Only init audio graph if reverb is enabled
  if (currentSettings.reverbEnabled) {
    ensureAudioGraph(id, el).then(() => {
      updateReverbMix(id, currentSettings.reverb);
    });
  }
}

/** Initialize Web Audio context - only when needed */
async function initAudioContext(): Promise<AudioContext> {
  if (audioContext) return audioContext;
  
  audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  impulseResponseBuffer = await createImpulseResponse(audioContext);
  return audioContext;
}

/** Create white noise buffer for impulse response */
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

/** Create audio graph for reverb processing */
async function createAudioGraph(id: number, el: HTMLMediaElement): Promise<MediaAudioGraph | null> {
  // Only create if reverb is enabled
  if (!currentSettings.reverbEnabled) return null;
  
  // Check if already exists
  if (audioGraphRegistry.has(id)) return audioGraphRegistry.get(id)!;
  
  try {
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
      reverbEnabled: true,
    };
    
    audioGraphRegistry.set(id, graph);
    return graph;
  } catch (e) {
    // Web Audio might fail (e.g., CORS), fallback to normal playback
    return null;
  }
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
async function ensureAudioGraph(id: number, el: HTMLMediaElement): Promise<MediaAudioGraph | null> {
  return createAudioGraph(id, el);
}

/** Toggle reverb on/off for a media element */
async function toggleReverb(id: number, enabled: boolean): Promise<void> {
  const el = mediaRegistry.get(id);
  if (!el) return;
  
  if (enabled) {
    // Enable: create audio graph
    await createAudioGraph(id, el);
    updateReverbMix(id, currentSettings.reverb);
  } else {
    // Disable: disconnect and remove graph
    const graph = audioGraphRegistry.get(id);
    if (graph && audioContext) {
      // Fade out wet signal
      const now = audioContext.currentTime;
      graph.wetGain.gain.setTargetAtTime(0, now, 0.1);
      graph.dryGain.gain.setTargetAtTime(1, now, 0.1);
      
      // Cleanup after fade
      setTimeout(() => {
        try {
          graph.sourceNode.disconnect();
          graph.dryGain.disconnect();
          graph.wetGain.disconnect();
          graph.convolver.disconnect();
        } catch (e) {
          // Ignore disconnection errors
        }
        audioGraphRegistry.delete(id);
      }, 200);
    }
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
async function buildMediaInfo(el: HTMLMediaElement, id: number): Promise<MediaInfo> {
  const graph = audioGraphRegistry.get(id);
  
  return {
    id,
    type: el.tagName.toLowerCase() === "video" ? "video" : "audio",
    src: el.currentSrc || el.src || "",
    title: getTitle(el),
    paused: el.paused,
    currentTime: el.currentTime,
    duration: el.duration || 0,
    // Return saved settings instead of element's current state
    volume: currentSettings.volume,
    playbackRate: currentSettings.playbackRate,
    preservesPitch: currentSettings.preservesPitch,
    muted: currentSettings.muted,
    reverb: graph?.reverbMix ?? currentSettings.reverb,
    reverbEnabled: graph?.reverbEnabled ?? false,
  };
}

/** Get all tracked media */
async function getAllMedia(): Promise<MediaInfo[]> {
  pruneRegistry();
  const elements = discoverMediaElements();
  elements.forEach((el) => {
    const id = getMediaId(el);
    // Apply saved settings to this element
    applySettingsToElement(el, id);
  });
  
  const result: MediaInfo[] = [];
  for (const [id, el] of mediaRegistry) {
    result.push(await buildMediaInfo(el, id));
  }
  return result;
}

/** Apply a change and save */
async function applyChange(
  id: number,
  prop: keyof SiteSettings,
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
      currentSettings.reverb = Math.max(0, Math.min(1, value as number));
      if (currentSettings.reverbEnabled) {
        updateReverbMix(id, currentSettings.reverb);
      }
      break;
    case "reverbEnabled":
      currentSettings.reverbEnabled = value as boolean;
      await toggleReverb(id, currentSettings.reverbEnabled);
      break;
  }
  
  await saveSettings();
  return true;
}

// --- Intercept dynamically created elements ---

const OriginalAudio = window.Audio;
const PatchedAudio = function (this: HTMLAudioElement, src?: string) {
  const audio = new OriginalAudio(src);
  const id = getMediaId(audio);
  
  audio.addEventListener('play', () => {
    applySettingsToElement(audio, id);
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
    
    mediaEl.addEventListener('play', () => {
      applySettingsToElement(mediaEl, id);
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
        applySettingsToElement(el, id);
        
        el.addEventListener('play', () => {
          applySettingsToElement(el, id);
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

discoverMediaElements().forEach((el) => {
  const id = getMediaId(el);
  applySettingsToElement(el, id);
});

// --- Handle play events ---

document.addEventListener("play", (e) => {
  const target = e.target;
  if (target instanceof HTMLMediaElement) {
    const id = getMediaId(target);
    applySettingsToElement(target, id);
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
      // Ensure settings are loaded
      if (!settingsLoaded) {
        await loadSettings();
      }
      
      switch (request.action) {
        case "ping":
          return { pong: true };
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
        case "setReverbEnabled":
          await applyChange(request.id, "reverbEnabled", request.value);
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
  console.log('Tune Shifter: Settings loaded for', getCurrentDomain(), currentSettings);
});
