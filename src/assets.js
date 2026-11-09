// assets.js — preloadable texture cache for the renderer (CATS-74).
//
// SVGs are static files: decode once at startup, reuse the same HTMLImageElement every frame as
// a createPattern() source. A missed/failed load resolves to null so render() can no-op the
// overlay (the base fills stay the visual floor) — a missing asset never breaks the loop.
const cache = new Map();

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Resolve a texture to an HTMLImageElement (cached), or null if it failed to load. Lazy on first
// call and safe to call every frame: the in-flight promise is memoized so the load fires once.
export function getTexture(src) {
  let entry = cache.get(src);
  if (entry) return entry;
  const p = loadImage(src)
    .then((img) => {
      cache.set(src, img);
      return img;
    })
    .catch(() => {
      cache.set(src, null);
      return null;
    });
  cache.set(src, p);
  return p;
}

// Kick off loading at startup so the first painted frames already have the image. Non-fatal.
export function preloadTextures(srcs) {
  for (const s of srcs) getTexture(s);
}
