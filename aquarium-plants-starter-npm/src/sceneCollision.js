// sceneCollision.js - Spatial collision detection for aquarium scene
import { TANK_X_HALF, TANK_Z_HALF } from "./tank/tankFloor.js";

export const TANK_BOUNDS = {
  // convenient half-extents for plants / floor
  xHalf: TANK_X_HALF,
  zHalf: TANK_Z_HALF,

  // full min/max for collision + random placement
  xMin: -TANK_X_HALF,
  xMax:  TANK_X_HALF,
  zMin: -TANK_Z_HALF,
  zMax:  TANK_Z_HALF,

  // vertical range
  yMin: -0.1,
  yMax:  10.0,
};

// Update bounds when tank size changes
export function updateTankBounds(xHalf, zHalf) {
  TANK_BOUNDS.xHalf = xHalf;
  TANK_BOUNDS.zHalf = zHalf;
  TANK_BOUNDS.xMin = -xHalf;
  TANK_BOUNDS.xMax = xHalf;
  TANK_BOUNDS.zMin = -zHalf;
  TANK_BOUNDS.zMax = zHalf;
}

// Global registry of placed objects (circular footprints)
const placedObjects = [];

export function resetCollisionState() {
  placedObjects.length = 0;
}

export function registerObject(x, z, radius, type = "default") {
  placedObjects.push({ x, z, radius, type });
}

export function isInsideTank(x, z, margin = 0.05) {
  return (
    x >= TANK_BOUNDS.xMin + margin &&
    x <= TANK_BOUNDS.xMax - margin &&
    z >= TANK_BOUNDS.zMin + margin &&
    z <= TANK_BOUNDS.zMax - margin
  );
}

export function checkCollision2D(x, z, radius, minSeparation = 0.0) {
  for (const obj of placedObjects) {
    const dx = x - obj.x;
    const dz = z - obj.z;
    const distSq = dx * dx + dz * dz;
    const minDist = obj.radius + radius + minSeparation;
    if (distSq < minDist * minDist) {
      return true; // collision detected
    }
  }
  return false;
}

export function findValidPosition(
  radius,
  maxAttempts = 100,
  minSeparation = 0.02,
  xRange = [TANK_BOUNDS.xMin, TANK_BOUNDS.xMax],
  zRange = [TANK_BOUNDS.zMin, TANK_BOUNDS.zMax]
) {
  const margin = radius + 0.05;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const x =
      xRange[0] +
      margin +
      Math.random() * (xRange[1] - xRange[0] - 2 * margin);
    const z =
      zRange[0] +
      margin +
      Math.random() * (zRange[1] - zRange[0] - 2 * margin);

    if (
      isInsideTank(x, z, margin) &&
      !checkCollision2D(x, z, radius, minSeparation)
    ) {
      return { x, z };
    }
  }

  return null; // failed to find valid position
}

export function getPlacedObjects() {
  return placedObjects;
}