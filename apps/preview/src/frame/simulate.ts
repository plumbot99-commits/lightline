/**
 * The workbench's state simulator, frame side. It acts on the film's real network traffic, so the player meets
 * the same events it would on a bad connection; nothing in the skin knows it is here. Loaded before the player
 * so every request the stream makes passes through it.
 *
 * - `stall`: requests to Mux's stream hosts are held (not failed) until the mode changes, and the forward
 *   buffer is emptied so the film runs dry now instead of 30 seconds from now. The browser then fires its own
 *   `waiting`. hls.js does not reload media taken from under it, so turning the mode off reloads the film at
 *   the moment it stopped (the frame does that) instead of releasing the held requests.
 * - `error`: requests to the stream hosts fail at once, with the browser's own network error. The frame
 *   reloads the film on entering and leaving this mode, so the failure lands on the manifest.
 *
 * Leaving `stall` drops whatever was held, since the film reloads.
 *
 * The storyboard and stills on image.mux.com are left alone.
 */
import type { NetworkMode } from '../shell/params';

let mode: NetworkMode = 'normal';
let held: (() => void)[] = [];

const isStream = (url: string | URL) => {
  try {
    const { hostname } = new URL(url, location.href);
    return hostname.endsWith('mux.com') && hostname !== 'image.mux.com';
  } catch {
    return false;
  }
};

/** A port the browser refuses to connect to, so a request sent there fails at once with a network error. */
const REFUSED = 'http://127.0.0.1:9/';

const xhrUrls = new WeakMap<XMLHttpRequest, string>();
const open = XMLHttpRequest.prototype.open;
const send = XMLHttpRequest.prototype.send;
const abort = XMLHttpRequest.prototype.abort;

XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
  xhrUrls.set(this, String(url));
  return (open as (...args: unknown[]) => void).call(this, method, url, ...rest);
} as typeof XMLHttpRequest.prototype.open;

XMLHttpRequest.prototype.send = function (this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
  const url = xhrUrls.get(this);
  if (url && isStream(url) && mode === 'error') {
    (open as (method: string, url: string) => void).call(this, 'GET', REFUSED);
    return send.call(this);
  }
  if (url && isStream(url) && mode === 'stall') {
    const request = () => send.call(this, body);
    held.push(request);
    // The player gives up on a request it waited too long for; an aborted request is never sent.
    this.abort = function (this: XMLHttpRequest) {
      held = held.filter((r) => r !== request);
      return abort.call(this);
    };
    return;
  }
  return send.call(this, body);
};

const realFetch = window.fetch.bind(window);

window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = input instanceof Request ? input.url : String(input);
  if (isStream(url) && mode === 'error') throw new TypeError('Failed to fetch');
  if (isStream(url) && mode === 'stall') await new Promise<void>((resume) => held.push(resume));
  return realFetch(input, init);
};

/** The media's source buffers, so a stall can drop what is buffered ahead. */
const sourceBuffers = new Set<SourceBuffer>();

for (const MediaSourceClass of [window.MediaSource, (window as { ManagedMediaSource?: typeof MediaSource }).ManagedMediaSource]) {
  if (!MediaSourceClass) continue;
  const add = MediaSourceClass.prototype.addSourceBuffer;
  MediaSourceClass.prototype.addSourceBuffer = function (this: MediaSource, type: string) {
    const buffer = add.call(this, type);
    sourceBuffers.add(buffer);
    return buffer;
  };
}

function dropBuffer() {
  // All of it, not only what lies ahead: hls.js rebuilds its map of loaded fragments only when the buffer is
  // empty, so a partial drop would leave it believing the film is still buffered. A buffer busy with an append
  // is emptied once it is free; the player may start its next append in the same moment, so keep trying until
  // the stall (no new data arrives while it lasts) leaves the buffer idle.
  for (const buffer of sourceBuffers) {
    const remove = () => {
      if (mode !== 'stall') return;
      try {
        if (buffer.updating) throw new Error('busy');
        if (buffer.buffered.length) buffer.remove(0, Infinity);
      } catch {
        buffer.addEventListener('updateend', remove, { once: true });
      }
    };
    remove();
  }
}

/** Set the simulated network. Returns true when the film must reload: into or out of an error, out of a stall. */
export function setNetworkMode(next: NetworkMode): boolean {
  const previous = mode;
  if (next === previous) return false;
  mode = next;

  held = [];
  if (next === 'stall') dropBuffer();

  return next === 'error' || previous !== 'normal';
}
