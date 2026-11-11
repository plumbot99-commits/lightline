/**
 * The film's own video in the player or a part of it: never the Suite room's loop, a muted video of its own that
 * comes before the film's in the DOM (src/video/suite/suite.tsx).
 */
export const filmVideo = (root: ParentNode | null | undefined) =>
  root?.querySelector<HTMLVideoElement>('video:not(.lightline-room-loop)') ?? null;
