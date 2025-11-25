// Bounds match tank floor
export const PLANT_BOUNDS = {
  xHalf: 2.6,
  zHalf: 2.2,
};

// --- simple 2D value noise ------------------------------------
function fract(v) { return v - Math.floor(v); }

function hash2D(x, y) {
  return fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453123);
}

function valueNoise2D(px, pz) {
  const ix = Math.floor(px);
  const iz = Math.floor(pz);
  const fx = px - ix;
  const fz = pz - iz;

  const a = hash2D(ix,     iz);
  const b = hash2D(ix + 1, iz);
  const c = hash2D(ix,     iz + 1);
  const d = hash2D(ix + 1, iz + 1);

  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);

  const ab = a + (b - a) * ux;
  const cd = c + (d - c) * ux;
  return ab + (cd - ab) * uz;  // 0..1
}

// Get one (x,z) in a "plant clump" based on noise
export function sampleClumpedPosition({
  xHalf = PLANT_BOUNDS.xHalf,
  zHalf = PLANT_BOUNDS.zHalf,
  freq = 0.6,        // lower = bigger patches, higher = smaller patches
  threshold = 0.6,   // how strong noise must be to accept a point
  maxTries = 32,
} = {}) {
  for (let tries = 0; tries < maxTries; tries++) {
    const x = (Math.random() * 2 - 1) * xHalf;
    const z = (Math.random() * 2 - 1) * zHalf;

    const n = valueNoise2D(x * freq, z * freq); // 0..1

    if (n >= threshold) {
      return { x, z, noise: n };
    }
  }

  // Fallback: random point if we somehow don't hit a clump
  const x = (Math.random() * 2 - 1) * xHalf;
  const z = (Math.random() * 2 - 1) * zHalf;
  const n = valueNoise2D(x * freq, z * freq);
  return { x, z, noise: n };
}