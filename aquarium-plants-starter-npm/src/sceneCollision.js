// sceneCollision.js - Spatial collision detection for aquarium scene
import { TANK_X_HALF, TANK_Z_HALF } from "./tank/tankFloor.js";

/**
 * Tank bounds in world space.
 * xHalf / zHalf are convenient for render code,
 * xMin..zMax are used for placement & collision.
 */
export const TANK_BOUNDS = {
  xHalf: TANK_X_HALF,
  zHalf: TANK_Z_HALF,

  xMin: -TANK_X_HALF,
  xMax:  TANK_X_HALF,
  zMin: -TANK_Z_HALF,
  zMax:  TANK_Z_HALF,

  // vertical range (mostly informational)
  yMin: -0.1,
  yMax:  10.0,
};

/**
 * Called whenever the tank size slider changes.
 * Keeps all code using TANK_BOUNDS in sync with tankFloor.js.
 */
export function updateTankBounds(xHalf, zHalf) {
  TANK_BOUNDS.xHalf = xHalf;
  TANK_BOUNDS.zHalf = zHalf;
  TANK_BOUNDS.xMin  = -xHalf;
  TANK_BOUNDS.xMax  =  xHalf;
  TANK_BOUNDS.zMin  = -zHalf;
  TANK_BOUNDS.zMax  =  zHalf;
}

/* ------------------------------------------------------------------ */
/*                      GLOBAL COLLISION REGISTRY                      */
/* ------------------------------------------------------------------ */

// Array of circular footprints on the tank floor:
// { x, z, radius, type }
const placedObjects = [];

/** Clear all registered objects (call before a full re-scatter). */
export function resetCollisionState() {
  placedObjects.length = 0;
}

/** Clear only objects of a specific type (call before regenerating a single layer). */
export function clearObjectsByType(type) {
  for (let i = placedObjects.length - 1; i >= 0; i--) {
    if (placedObjects[i].type === type) {
      placedObjects.splice(i, 1);
    }
  }
}

/**
 * Register a solid object so later placements can avoid it.
 * `radius` should roughly match its footprint in XZ.
 */
export function registerObject(x, z, radius, type = "default") {
  placedObjects.push({ x, z, radius: Math.max(0, radius), type });
}

/**
 * Check if a circle centered at (x,z) with the given radius
 * fits entirely inside the tank.
 */
export function isInsideTank(x, z, radius = 0.0) {
  return (
    x - radius >= TANK_BOUNDS.xMin &&
    x + radius <= TANK_BOUNDS.xMax &&
    z - radius >= TANK_BOUNDS.zMin &&
    z + radius <= TANK_BOUNDS.zMax
  );
}

/**
 * Test whether a circle at (x,z) with `radius` overlaps any
 * previously registered object. `minSeparation` is extra padding
 * beyond the sum of the two radii.
 */
export function checkCollision2D(x, z, radius, minSeparation = 0.0) {
  const r = Math.max(0, radius);
  for (const obj of placedObjects) {
    const dx = x - obj.x;
    const dz = z - obj.z;
    const distSq = dx * dx + dz * dz;
    const minDist = obj.radius + r + minSeparation;
    if (distSq < minDist * minDist) {
      return true; // collision detected
    }
  }
  return false;
}

/**
 * Try to find a random non-overlapping position inside the tank.
 * Returns {x,z} on success, or null if no spot is found.
 *
 * `radius`       – footprint of the object to place
 * `maxAttempts`  – how many random tries before giving up
 * `minSeparation`– extra padding vs existing objects
 * `xRange/zRange`– optional sub-region within the tank
 */
export function findValidPosition(
  radius,
  maxAttempts = 100,
  minSeparation = 0.02,
  xRange = [TANK_BOUNDS.xMin, TANK_BOUNDS.xMax],
  zRange = [TANK_BOUNDS.zMin, TANK_BOUNDS.zMax]
) {
  const r = Math.max(0, radius);
  const edgePadding = 0.05;             // keep a tiny gap from glass
  const margin = r + edgePadding;

  const xMin = xRange[0] + margin;
  const xMax = xRange[1] - margin;
  const zMin = zRange[0] + margin;
  const zMax = zRange[1] - margin;

  if (xMax <= xMin || zMax <= zMin) {
    // range is too small for this radius; bail out early
    return null;
  }

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const x = xMin + Math.random() * (xMax - xMin);
    const z = zMin + Math.random() * (zMax - zMin);

    if (!isInsideTank(x, z, r)) continue;
    if (checkCollision2D(x, z, r, minSeparation)) continue;

    return { x, z };
  }

  // Failed to find a spot
  return null;
}

/** Read-only access (useful for debugging / visualization). */
export function getPlacedObjects() {
  return placedObjects;
}