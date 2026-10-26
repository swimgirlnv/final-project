// src/main.js
import { createEgeriaLayer } from "./plants/egeriaDensa/egeriaDensa.js";
import { createGrassLayer } from "./plants/grass/grass.js";
import {
  createFloorLayer,
  setTankSize,
  setTankHeight,
  decorCeiling,
  TANK_X_HALF,
  TANK_Z_HALF,
  TANK_HEIGHT,
} from "./tank/tankFloor.js";
import { createBarclayaLayer } from "./plants/barclayaLongifolia/barclayaLongifolia.js";
import { createCoralReefLayer } from "./plants/coralReef/coralReef.js";
import { createFanCoralLayer } from "./plants/coralReef/fan.js";
import { createStaghornCoralLayer } from "./plants/coralReef/staghorn.js";
import { createDriftwoodLayer } from "./decorations/driftwood/driftwood.js";
import { createBoulderLayer } from "./decorations/boulder/boulder.js";
import { createFishHouseLayer } from "./decorations/fishHouse/fishHouse.js";
import {
  resetCollisionState,
  updateTankBounds,
  findValidPosition,
  registerObject,
  clearObjectsByType,
} from "./sceneCollision.js";
import { createGoldfish, regenerateGoldfishGeometry } from "./fish/goldfish.js";
import { createBubbleLayer } from "./decorations/bubbles/bubbles.js";
import { createTreasureChestLayer } from "./decorations/treasureChest/treasureChest.js";
import { createWaterSurfaceLayer } from "./tank/water.js";
import { createTankGlassLayer } from "./tank/glass.js";
import { createShellLayer } from "./decorations/shells/shells.js";
import { createDiscoLights, DISCO_GLOW_HUE_RATE } from "./discoLights.js";
import { createDiscoPass } from "./disco/discoPass.js";
import { createSunLayer } from "./sky/sun.js";
import { createCrabLayer } from "./critters/crab/crab.js";
import { BoidSystem } from "./boids/boidSystem.js";
import { createSimpleCube } from "./boids/debugObjects/simpleCube.js";

/* ---------- Helpers ---------- */
function createGL(canvas) {
  const gl = canvas.getContext("webgl2", { antialias: true, alpha: false });
  if (!gl) throw new Error("WebGL2 not supported");
  return gl;
}
function resizeCanvasToDisplaySize(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.floor(canvas.clientWidth * dpr);
  const h = Math.floor(canvas.clientHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
    return true;
  }
  return false;
}
function makePerspective(fovDeg, aspect, near, far) {
  const f = 1 / Math.tan((fovDeg * Math.PI) / 180 / 2);
  return new Float32Array([
    f / aspect,
    0,
    0,
    0,
    0,
    f,
    0,
    0,
    0,
    0,
    (far + near) / (near - far),
    -1,
    0,
    0,
    (2 * far * near) / (near - far),
    0,
  ]);
}
function lookAt(eye, center, up) {
  const [ex, ey, ez] = eye,
    [cx, cy, cz] = center,
    [ux, uy, uz] = up;
  let zx = ex - cx,
    zy = ey - cy,
    zz = ez - cz;
  const zlen = Math.hypot(zx, zy, zz);
  zx /= zlen;
  zy /= zlen;
  zz /= zlen;
  let xx = uy * zz - uz * zy,
    xy = uz * zx - ux * zz,
    xz = ux * zy - uy * zx;
  const xlen = Math.hypot(xx, xy, xz);
  xx /= xlen;
  xy /= xlen;
  xz /= xlen;
  const yx = zy * xz - zz * xy,
    yy = zz * xx - zx * xz,
    yz = zx * xy - zy * xx;
  return new Float32Array([
    xx,
    yx,
    zx,
    0,
    xy,
    yy,
    zy,
    0,
    xz,
    yz,
    zz,
    0,
    -(xx * ex + xy * ey + xz * ez),
    -(yx * ex + yy * ey + yz * ez),
    -(zx * ex + zy * ey + zz * ez),
    1,
  ]);
}

/* ---------- DOM ---------- */
const canvas = document.getElementById("gl");
const fpsEl = document.getElementById("fps");
const showGrass = document.getElementById("showGrass");
const showEgeria = document.getElementById("showEgeria");
const showBarclaya = document.getElementById("showBarclaya");
const showCoral = document.getElementById("showCoral");
const showWood = document.getElementById("showWood");
const showBoulders = document.getElementById("showBoulders");
const showFishHouse = document.getElementById("showFishHouse");
const showChest = document.getElementById("showChest");
const showShells = document.getElementById("showShells");
const showCrab = document.getElementById("showCrab");
const discoModeToggle = document.getElementById("discoMode");

const currentStrength = 0;
const currentAngle = -3.14;
const FOV_DEG = 45;

// grass controls
const plantCount = document.getElementById("plantCount"); // not actually plant count, changes everything put in main settings
const plantCountLabel = document.getElementById("plantCountLabel");
const flex = document.getElementById("flex");
const heightAvg = document.getElementById("height");

// egeria controls
const egCount = document.getElementById("egeriaCount");
const egeriaCountLabel = document.getElementById("egeriaCountLabel");
const egWidth = document.getElementById("egeriaLeafWidth");
const egNodes = document.getElementById("egeriaNodes");
const egeriaNodesLabel = document.getElementById("egeriaNodesLabel");
const egBranch = document.getElementById("egeriaBranch");

// barclaya controls
const barclayaCount = document.getElementById("barclayaCount");
const barclayaCountLabel = document.getElementById("barclayaCountLabel");
const barclayaMinLeaves = document.getElementById("barclayaMinLeaves");
const barclayaMinLeavesLabel = document.getElementById("barclayaMinLeavesLabel");
const barclayaMaxLeaves = document.getElementById("barclayaMaxLeaves");
const barclayaMaxLeavesLabel = document.getElementById("barclayaMaxLeavesLabel");
const barclayaRedProb = document.getElementById("barclayaRedProb");
const barclayaUndulFreq = document.getElementById("barclayaUndulFreq");
const barclayaUndulFreqLabel = document.getElementById("barclayaUndulFreqLabel");
const barclayaRegenerate = document.getElementById("barclayaRegenerate");

const scatterBtn = document.getElementById("scatter");
const regenBtn = document.getElementById("regenerate");

// coral controls
const coralCount = document.getElementById("coralCount");
const coralCountLabel = document.getElementById("coralCountLabel");
const coralMinRadius = document.getElementById("coralMinRadius");
const coralMaxRadius = document.getElementById("coralMaxRadius");
const coralRegenerate = document.getElementById("coralRegenerate");

// fan coral controls
const fanCount = document.getElementById("fanCount");
const fanCountLabel = document.getElementById("fanCountLabel");

// staghorn coral controls
const staghornColonies = document.getElementById("staghornColonies");
const staghornColoniesLabel = document.getElementById("staghornColoniesLabel");
const staghornBranches = document.getElementById("staghornBranches");
const staghornBranchesLabel = document.getElementById("staghornBranchesLabel");

// wood controls
const woodPieces = document.getElementById("woodPieces");
const woodPiecesLabel = document.getElementById("woodPiecesLabel");
const woodBranches = document.getElementById("woodBranches");
const woodBranchesLabel = document.getElementById("woodBranchesLabel");
const woodGnarl = document.getElementById("woodGnarl");
const woodTwist = document.getElementById("woodTwist");
const woodDetail = document.getElementById("woodDetail");
const woodGrain = document.getElementById("woodGrain");
const woodGrainMix = document.getElementById("woodGrainMix");
const woodWarm = document.getElementById("woodWarm");

// boulder controls
const boulderCount = document.getElementById("boulderCount");
const boulderCountLabel = document.getElementById("boulderCountLabel");
const boulderRegenerate = document.getElementById("boulderRegenerate");
const chestRegenerate = document.getElementById("chestRegenerate");
const chestBubbles = document.getElementById("chestBubbles");
const chestBubblesLabel = document.getElementById("chestBubblesLabel");
const chestRotation = document.getElementById("chestRotation");
const chestRotationLabel = document.getElementById("chestRotationLabel");
const chestTreasure = document.getElementById("chestTreasure");

// fish house controls
const fishHouseHeight = document.getElementById("fishHouseHeight");
const fishHouseRadius = document.getElementById("fishHouseRadius");
const fishHouseBulge = document.getElementById("fishHouseBulge");
const fishHouseStacks = document.getElementById("fishHouseStacks");
const fishHouseStacksLabel = document.getElementById("fishHouseStacksLabel");
const fishHouseLeafCount = document.getElementById("fishHouseLeafCount");
const fishHouseLeafCountLabel = document.getElementById("fishHouseLeafCountLabel");
const fishHouseLeafLength = document.getElementById("fishHouseLeafLength");
const fishHouseRegenerate = document.getElementById("fishHouseRegenerate");

// shells controls
const scallopsCount = document.getElementById("scallopsCount");
const scallopsCountLabel = document.getElementById("scallopsCountLabel");
const augersCount = document.getElementById("augersCount");
const augersCountLabel = document.getElementById("augersCountLabel");
const moonsCount = document.getElementById("moonsCount");
const moonsCountLabel = document.getElementById("moonsCountLabel");
const shellsSpread = document.getElementById("shellsSpread");
const shellsRegenerate = document.getElementById("shellsRegenerate");

// tank floor controls
const floorGravelMix = document.getElementById("floorGravelMix");
const floorAmp = document.getElementById("floorAmp");
const floorGravelScale = document.getElementById("floorGravelScale");
const floorGravelBump = document.getElementById("floorGravelBump");
const palSand = document.getElementById("floorPalSand");
const palGrey = document.getElementById("floorPalGrey");
const palRainbow = document.getElementById("floorPalRainbow");
const tankSize = document.getElementById("tankSize");
const tankHeight = document.getElementById("tankHeight");

// goldfish controls
const bodyLength = document.getElementById("bodyLength");
const bodyHeight = document.getElementById("bodyHeight");
const bodyWidth = document.getElementById("bodyWidth");
const arch = document.getElementById("arch");
const headSize = document.getElementById("headSize");
const mouthTilt = document.getElementById("mouthTilt");
const eyeSize = document.getElementById("eyeSize");
const caudalLength = document.getElementById("caudalLength");
const caudalWidth = document.getElementById("caudalWidth");
const caudalCurve = document.getElementById("caudalCurve");
const dorsalLength = document.getElementById("dorsalLength");
const dorsalWidth = document.getElementById("dorsalWidth");
const dorsalShift = document.getElementById("dorsalShift");
const pelvicLength = document.getElementById("pelvicLength");
const pelvicWidth = document.getElementById("pelvicWidth");
const pelvicShift = document.getElementById("pelvicShift");
const pelvicAngle = document.getElementById("pelvicAngle");
const pectoralLength = document.getElementById("pectoralLength");
const pectoralWidth = document.getElementById("pectoralWidth");
const pectoralShift = document.getElementById("pectoralShift");
const pectoralAngle = document.getElementById("pectoralAngle");
const afinLength = document.getElementById("afinLength");
const afinWidth = document.getElementById("afinWidth");
const afinShift = document.getElementById("afinShift");
const fishColor = document.getElementById("fishColor");
const fishSaturation = document.getElementById("fishSaturation");
const fishValue = document.getElementById("fishValue");
const fishNoise = document.getElementById("fishNoise");
const fishSecondaryHue = document.getElementById("fishSecondaryHue");
const fishCountSlider = document.getElementById("fishCount");
const fishSpeedSlider = document.getElementById("fishSpeed");
const dropFoodBtn = document.getElementById("dropFoodBtn");
const viewModeToggle = document.getElementById("viewModeToggle");
let isFocusView = false;
let isSlidingFish = false;
let fishColorShift = +fishColor.value;
const mobileQuery = window.matchMedia("(max-width: 768px)");

// Function to read the currently checked value from a radio group
const getRadioValue = (group) => {
  for (const radio of group) {
    if (radio.checked) {
      return radio.value;
    }
  }
  // Return a default or the first value if nothing is checked (safer for initialization)
  return group[0] ? group[0].value : null;
};

function readGoldfishParams() {
  return {
    // body params (float values from sliders)
    bodyLength: parseFloat(bodyLength.value),
    bodyHeight: parseFloat(bodyHeight.value),
    bodyWidth: parseFloat(bodyWidth.value),
    arch: parseFloat(arch.value),

    // head params
    headSize: {
      x: parseFloat(headSize.value),
      y: parseFloat(headSize.value),
      z: parseFloat(headSize.value),
    }, // Assuming headSize slider affects both X and Y equally for now
    mouthTilt: parseFloat(mouthTilt.value),
    eyeSize: parseFloat(eyeSize.value),

    // caudal params
    caudalLength: parseFloat(caudalLength.value),
    caudalWidth: parseFloat(caudalWidth.value),
    caudalCurve: parseFloat(caudalCurve.value),

    // dorsal params
    dorsalLength: parseFloat(dorsalLength.value),
    dorsalWidth: parseFloat(dorsalWidth.value),
    dorsalShift: parseFloat(dorsalShift.value),

    // pelvic params
    pelvicLength: parseFloat(pelvicLength.value),
    pelvicWidth: parseFloat(pelvicWidth.value),
    pelvicShift: parseFloat(pelvicShift.value),
    pelvicAngle: parseFloat(pelvicAngle.value),

    // pectoral params
    pectoralLength: parseFloat(pectoralLength.value),
    pectoralWidth: parseFloat(pectoralWidth.value),
    pectoralShift: parseFloat(pectoralShift.value),
    pectoralAngle: parseFloat(pectoralAngle.value),

    // afin params
    afinLength: parseFloat(afinLength.value),
    afinWidth: parseFloat(afinWidth.value),
    afinShift: parseFloat(afinShift.value),
  };
}

function regenerateGoldfish() {
  const params = readGoldfishParams();
  regenerateGoldfishGeometry(gl, gfish.geometry, params);
  boidSys.setBounds(fishBounds());
}

/**
 * Wires up all goldfish UI elements to the regeneration function.
 */
function initGoldfishUI() {
  // 1. Sliders (Input event fires continuously while dragging)
  const sliders = [
    bodyLength,
    bodyHeight,
    bodyWidth,
    arch,
    headSize,
    mouthTilt,
    eyeSize,
    caudalLength,
    caudalWidth,
    caudalCurve,
    dorsalLength,
    dorsalWidth,
    dorsalShift,
    pelvicLength,
    pelvicWidth,
    pelvicShift,
    pelvicAngle,
    pectoralLength,
    pectoralWidth,
    pectoralShift,
    pectoralAngle,
    afinLength,
    afinWidth,
    afinShift,
  ];
  sliders.forEach((slider) => {
    if (slider) {
      slider.addEventListener("input", regenerateGoldfish);
    }
  });

  // 2. Radio buttons (Change event fires when a new one is selected)
  /*const radioGroups = [eyeTypeGroup, caudalTypeGroup, dorsalTypeGroup, afinTypeGroup];
    radioGroups.forEach(group => {
        // group is a NodeList/HTMLCollection, we need to iterate over its elements
        Array.from(group).forEach(radio => {
            if (radio) {
                radio.addEventListener("change", regenerateGoldfish);
            }
        });
    });*/
}

// Initialize the goldfish UI handlers immediately
initGoldfishUI();

fishColor?.addEventListener("input", () => {
  fishColorShift = +fishColor.value;
});
fishSaturation?.addEventListener("input", () => gfish.setSaturation(+fishSaturation.value));
fishValue?.addEventListener("input", () => gfish.setValue(+fishValue.value));
fishNoise?.addEventListener("input", () => gfish.setNoise(+fishNoise.value));
fishSecondaryHue?.addEventListener("input", () => gfish.setSecondaryHue(+fishSecondaryHue.value));

// On mobile, show the inspect view while a fish shape slider is held
document.querySelectorAll('#section-fish input[type="range"]').forEach((slider) => {
  if (slider === fishCountSlider || slider === fishSpeedSlider) return;
  slider.addEventListener("pointerdown", () => {
    if (mobileQuery.matches) isSlidingFish = true;
  });
});
["pointerup", "pointercancel", "touchend", "touchcancel"].forEach((type) =>
  window.addEventListener(type, () => {
    isSlidingFish = false;
  })
);

// Event listeners for boid system
if (fishCountSlider) {
    fishCountSlider.addEventListener("input", () => {
        const val = parseInt(fishCountSlider.value);
        boidSys.regenerate(val);
    });
}

if (fishSpeedSlider) {
  fishSpeedSlider.addEventListener("input", () => {
      const val = parseFloat(fishSpeedSlider.value);
      boidSys.setBoidMaxSpeed(val * 0.005);
  });
}

if (viewModeToggle) {
    viewModeToggle.addEventListener("change", (e) => {
        isFocusView = e.target.checked;
    });
}

// Event listener for food
if (dropFoodBtn) {
  dropFoodBtn.addEventListener("click", () => {
    boidSys.dropFood();
  });
}

let clickStartX = 0;
let clickStartY = 0;

let interactMode = false;

window.addEventListener("keydown", (e) => {
  // press "i" to toggle interaction mode
  if (e.key === "i" || e.key === "I") {
    interactMode = !interactMode;
    console.log("Interact mode:", interactMode ? "ON" : "OFF");
  }
});


/* ---------- Orbit camera ---------- */
// Phones start further out so more of the tank fits the narrow screen
const DEFAULT_CAM_R = mobileQuery.matches ? 4.6 : 3.4;
const cam = {
  target: [0, 0.9, 0],
  r: DEFAULT_CAM_R,
  az: Math.PI * 1.5,
  el: 0.09,
  minR: 1.1,
  maxR: mobileQuery.matches ? 11.0 : 7.0, // phones can zoom out further to fit the narrow screen
  minEl: 0.02,
  maxEl: 1.25,
  vAz: 0,
  vEl: 0,
  vR: 0,
  damping: 0.12,
};
function orbitToEye({ target, r, az, el }) {
  const ce = Math.cos(el),
    se = Math.sin(el),
    ca = Math.cos(az),
    sa = Math.sin(az);
  return [target[0] + r * ca * ce, target[1] + r * se, target[2] + r * sa * ce];
}
// pointer + wheel (after canvas exists)
canvas.style.cursor = "grab";
canvas.style.touchAction = "none";
let isDragging = false,
  lastX = 0,
  lastY = 0;
const ROT_SPEED = 0.005,
  EL_SPEED = 0.003,
  ZOOM_SPEED = 0.0015;

// Fingers currently on the canvas, two of them pinch to zoom
const activePointers = new Map();
let pinching = false;
let pinchDist = 0;
let gesturePinched = false; // true once the current touch became a pinch, so lifting is never a click

function pointerSpread() {
  const [a, b] = [...activePointers.values()];
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// Forgets a finger and, if one is left after a pinch, goes back to rotating with it
function releasePointer(e) {
  activePointers.delete(e.pointerId);
  if (pinching && activePointers.size === 1) {
    const [rest] = activePointers.values();
    lastX = rest.x;
    lastY = rest.y;
    isDragging = true;
  }
  if (activePointers.size < 2) pinching = false;
  if (activePointers.size === 0) isDragging = false;
}

canvas.addEventListener("pointerdown", (e) => {
  // the first finger of a new touch means no others are down, so drop any the browser never released
  if (e.isPrimary) {
    activePointers.clear();
    pinching = false;
    gesturePinched = false;
  }
  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (activePointers.size === 2) {
    // a second finger turns the drag into a pinch
    pinching = true;
    gesturePinched = true;
    isDragging = false;
    pinchDist = pointerSpread();
  }
  canvas.setPointerCapture(e.pointerId);
  if (pinching) return;

  isDragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
  clickStartX = e.clientX;
  clickStartY = e.clientY;
  canvas.setPointerCapture(e.pointerId);
  canvas.style.cursor = "grabbing";
});
canvas.addEventListener("pointermove", (e) => {
  if (activePointers.has(e.pointerId)) {
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  }
  if (pinching && activePointers.size === 2) {
    // fingers moving apart zoom in, together zoom out
    const d = pointerSpread();
    if (pinchDist > 0 && d > 0) {
      cam.r = Math.max(cam.minR, Math.min(cam.maxR, cam.r * (pinchDist / d)));
      cam.vR = 0;
    }
    pinchDist = d;
    return;
  }
  if (!isDragging) return;
  const dx = e.clientX - lastX,
    dy = e.clientY - lastY;
  lastX = e.clientX;
  lastY = e.clientY;
  cam.vAz += dx * ROT_SPEED;
  cam.vEl += dy * EL_SPEED;
});
// browsers sometimes end a touch with only one of these, so both release the finger
for (const type of ["pointercancel", "lostpointercapture"]) {
  canvas.addEventListener(type, (e) => {
    if (!activePointers.has(e.pointerId)) return;
    releasePointer(e);
    canvas.style.cursor = "grab";
  });
}
canvas.addEventListener("pointerup", (e) => {
  releasePointer(e);
  if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
  canvas.style.cursor = "grab";

  // lifting a finger after a pinch is not a click
  if (gesturePinched || activePointers.size > 0) return;

  const dx = e.clientX - clickStartX;
  const dy = e.clientY - clickStartY;
  const dist = Math.hypot(dx, dy);

  const hasModifier =
    e.ctrlKey || e.metaKey || e.shiftKey || e.altKey;
  const allowInteraction = hasModifier || interactMode;

  // If it's a small click *and* interaction is allowed, treat as scene click
  if (dist < 5 && allowInteraction && lastShared) {
    const rect = canvas.getBoundingClientRect();
    // convert to drawingBuffer pixel coords
    const px =
      ((e.clientX - rect.left) / rect.width) * canvas.width;
    const py =
      ((e.clientY - rect.top) / rect.height) * canvas.height;

    const ray = makeRayFromCamera(px, py, lastShared, canvas);
    const hit = rayPlaneY(ray.origin, ray.dir, lastShared.floorYOffset);
    if (hit) {
      handleWorldClick(hit);
    }
  }
});
canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    cam.vR += e.deltaY * ZOOM_SPEED;
  },
  { passive: false }
);
document.getElementById("resetCam")?.addEventListener("click", () => {
  cam.r = DEFAULT_CAM_R;
  cam.az = Math.PI * 1.5;
  cam.el = 0.09;
  cam.vAz = cam.vEl = cam.vR = 0;
});

/* ---------- GL + layers ---------- */
const gl = createGL(canvas);
gl.enable(gl.DEPTH_TEST);
gl.cullFace(gl.BACK);
gl.clearColor(0.02, 0.07, 0.13, 1);

const floor = createFloorLayer(gl);
floor.setFloorFog(0.55, 0.12);

// Create layers in collision order: large decorations first, then plants
const driftwood = createDriftwoodLayer(gl);
const fishHouse = createFishHouseLayer(gl);
const boulders = createBoulderLayer(gl);
const egeria = createEgeriaLayer(gl);
const barclaya = createBarclayaLayer(gl);
const coral = createCoralReefLayer(gl);
const fanCoral = createFanCoralLayer(gl);
const staghornCoral = createStaghornCoralLayer(gl);
const grass = createGrassLayer(gl);
const gfish = createGoldfish(gl);
const bubbles = createBubbleLayer(gl);
const waterSurface = createWaterSurfaceLayer(gl);
const tankGlass = createTankGlassLayer(gl);
const shells = createShellLayer(gl);
const crab = createCrabLayer(gl);
const discoLights = createDiscoLights();
const discoPass = createDiscoPass(gl);
const sun = createSunLayer(gl);

// Sun floats above a back corner of the tank, away from the default camera
const SUN_RADIUS = 0.26;
function sunPosition() {
  return [TANK_X_HALF * 0.7, TANK_HEIGHT + 0.85, TANK_Z_HALF * 0.7];
}

// Generate random position for treasure chest, or null if it cannot fit
function generateChestPosition() {
  const chestRadius = 0.42; // covers the chest at any rotation with the lid open
  clearObjectsByType("chest");
  const pos = findValidPosition(chestRadius, 100, 0.1);
  if (pos) {
    registerObject(pos.x, pos.z, chestRadius, "chest");
    return [pos.x, -0.05, pos.z];
  }
  return null;
}

const initialChestPos = generateChestPosition();
let chestVisible = !!initialChestPos;
const chestPos = initialChestPos || [0, -0.05, 0];

const chestLayer = createTreasureChestLayer(gl, {
  position: chestPos,
  spawnBubble: bubbles.spawnBubble,
});
// Move the chest to a new free spot, hiding it when none exists
function placeChest() {
  const newChestPos = generateChestPosition();
  chestVisible = !!newChestPos;
  if (!newChestPos) return;
  chestPos[0] = newChestPos[0];
  chestPos[1] = newChestPos[1];
  chestPos[2] = newChestPos[2];
  chestLayer.setPosition(newChestPos[0], newChestPos[1], newChestPos[2]);
}

const FOG = { color: [0.02, 0.07, 0.13], near: 2.0, far: 5.5 };
const BASE_FOG = [...FOG.color];
const DISCO_FOG = [0.005, 0.01, 0.02];

// 0 normal scene, 1 full disco look, eased so the switch fades
let discoMorph = 0;
let discoGlowHue = 0;
floor.setFog(FOG.color, FOG.near, FOG.far);

/* ---------- UI wiring ---------- */
function updateCountLabel() {
  if (plantCountLabel && plantCount)
    plantCountLabel.textContent = String(plantCount.value);
}
updateCountLabel();

function updateCoralCountLabel() {
  if (coralCountLabel && coralCount)
    coralCountLabel.textContent = String(coralCount.value);
}
updateCoralCountLabel();

function updateFanCountLabel() {
  if (fanCountLabel && fanCount)
    fanCountLabel.textContent = String(fanCount.value);
}
updateFanCountLabel();

function updateBoulderCountLabel() {
  if (boulderCountLabel && boulderCount)
    boulderCountLabel.textContent = String(boulderCount.value);
}
updateBoulderCountLabel();
updateFanCountLabel();

if (plantCount)
  plantCount.addEventListener("input", () => {
    grass.setCount(+plantCount.value);
    updateCountLabel();
    grass.regenerate();
  });
if (flex) flex.addEventListener("input", () => grass.setFlex(+flex.value));
if (heightAvg)
  heightAvg.addEventListener("input", () => {
    grass.setAvgHeight(+heightAvg.value);
    resetCollisionState();
    driftwood.regenerate();
    boulders.regenerate();
    barclaya.regenerate();
    egeria.regenerate();
    grass.regenerate();
  });

if (egCount)
  egCount.addEventListener("input", () => {
    if (egeriaCountLabel) egeriaCountLabel.textContent = String(egCount.value);
    egeria.setCount(+egCount.value);
    egeria.regenerate();
  });
if (egWidth)
  egWidth.addEventListener("input", () =>
    egeria.setLeafWidthScale(+egWidth.value)
  );
if (egNodes)
  egNodes.addEventListener("input", () => {
    if (egeriaNodesLabel) egeriaNodesLabel.textContent = String(egNodes.value);
    egeria.setNodes(+egNodes.value);
    resetCollisionState();
    driftwood.regenerate();
    boulders.regenerate();
    barclaya.regenerate();
    egeria.regenerate();
    grass.regenerate();
  });
if (egBranch)
  egBranch.addEventListener("input", () => {
    egeria.setBranchChance(+egBranch.value);
    resetCollisionState();
    driftwood.regenerate();
    boulders.regenerate();
    barclaya.regenerate();
    egeria.regenerate();
    grass.regenerate();
  });

// Barclaya controls
if (barclayaCount)
  barclayaCount.addEventListener("input", () => {
    if (barclayaCountLabel) barclayaCountLabel.textContent = String(barclayaCount.value);
    barclaya.setPlantCount(+barclayaCount.value);
    barclaya.regenerate();
  });
if (barclayaMinLeaves)
  barclayaMinLeaves.addEventListener("input", () => {
    if (barclayaMinLeavesLabel) barclayaMinLeavesLabel.textContent = String(barclayaMinLeaves.value);
    barclaya.setMinLeaves(+barclayaMinLeaves.value);
  });
if (barclayaMaxLeaves)
  barclayaMaxLeaves.addEventListener("input", () => {
    if (barclayaMaxLeavesLabel) barclayaMaxLeavesLabel.textContent = String(barclayaMaxLeaves.value);
    barclaya.setMaxLeaves(+barclayaMaxLeaves.value);
  });
if (barclayaRedProb)
  barclayaRedProb.addEventListener("input", () => {
    barclaya.setRedProbability(+barclayaRedProb.value);
  });
if (barclayaUndulFreq)
  barclayaUndulFreq.addEventListener("input", () => {
    if (barclayaUndulFreqLabel) barclayaUndulFreqLabel.textContent = String(barclayaUndulFreq.value);
    barclaya.setUndulFreq(+barclayaUndulFreq.value);
  });
if (barclayaRegenerate)
  barclayaRegenerate.addEventListener("click", () => {
    resetCollisionState();
    driftwood.regenerate();
    boulders.regenerate();
    barclaya.regenerate();
    egeria.regenerate();
    grass.regenerate();
  });

// Coral controls
if (coralCount)
  coralCount.addEventListener("input", () => {
    coral.setCount(+coralCount.value);
    updateCoralCountLabel();
    coral.regenerate();
  });
if (coralMinRadius)
  coralMinRadius.addEventListener("input", () => {
    coral.setMinRadius(+coralMinRadius.value);
  });
if (coralMaxRadius)
  coralMaxRadius.addEventListener("input", () => {
    coral.setMaxRadius(+coralMaxRadius.value);
  });
if (coralRegenerate)
  coralRegenerate.addEventListener("click", () => {
    resetCollisionState();
    driftwood.regenerate();
    boulders.regenerate();
    barclaya.regenerate();
    egeria.regenerate();
    coral.regenerate();
    fanCoral.regenerate();
    staghornCoral.regenerate();
    grass.regenerate();
  });

// Fan coral controls
if (fanCount)
  fanCount.addEventListener("input", () => {
    fanCoral.setFanCount(+fanCount.value);
    updateFanCountLabel();
    fanCoral.regenerate();
  });

// Staghorn coral controls
if (staghornColonies)
  staghornColonies.addEventListener("input", () => {
    if (staghornColoniesLabel) staghornColoniesLabel.textContent = String(staghornColonies.value);
    staghornCoral.setColonies(+staghornColonies.value);
    staghornCoral.regenerate();
  });

if (staghornBranches)
  staghornBranches.addEventListener("input", () => {
    if (staghornBranchesLabel) staghornBranchesLabel.textContent = String(staghornBranches.value);
    staghornCoral.setBranchesPerColony(+staghornBranches.value);
    staghornCoral.regenerate();
  });

if (scatterBtn)
  scatterBtn.addEventListener("click", () => {
    resetCollisionState();
    driftwood.regenerate();
    boulders.regenerate();
    barclaya.regenerate();
    coral.regenerate();
    egeria.regenerate();
    grass.regenerate();
  });
if (regenBtn)
  regenBtn.addEventListener("click", () => {
    resetCollisionState();
    placeChest();
    driftwood.regenerate();
    fishHouse.regenerate();
    boulders.regenerate();
    barclaya.regenerate();
    coral.regenerate();
    fanCoral.regenerate();
    staghornCoral.regenerate();
    egeria.regenerate();
    grass.regenerate();
    shells.regenerate();
  });

woodPieces?.addEventListener("input", () => {
  if (woodPiecesLabel) woodPiecesLabel.textContent = String(woodPieces.value);
  driftwood.setPieces(+woodPieces.value);
  resetCollisionState();
  driftwood.regenerate();
  boulders.regenerate();
  barclaya.regenerate();
  egeria.regenerate();
  grass.regenerate();
});
woodBranches?.addEventListener("input", () => {
  if (woodBranchesLabel) woodBranchesLabel.textContent = String(woodBranches.value);
  driftwood.setBranches(+woodBranches.value);
  resetCollisionState();
  driftwood.regenerate();
  boulders.regenerate();
  barclaya.regenerate();
  egeria.regenerate();
  grass.regenerate();
});
woodGnarl?.addEventListener("input", () => {
  driftwood.setGnarl(+woodGnarl.value);
  resetCollisionState();
  driftwood.regenerate();
  boulders.regenerate();
  barclaya.regenerate();
  egeria.regenerate();
  grass.regenerate();
});
woodTwist?.addEventListener("input", () => {
  driftwood.setTwist(+woodTwist.value);
  resetCollisionState();
  driftwood.regenerate();
  boulders.regenerate();
  barclaya.regenerate();
  egeria.regenerate();
  grass.regenerate();
});
woodDetail?.addEventListener("input", () => {
  driftwood.setDetail(+woodDetail.value);
  resetCollisionState();
  driftwood.regenerate();
  boulders.regenerate();
  barclaya.regenerate();
  egeria.regenerate();
  grass.regenerate();
});
woodGrain?.addEventListener("input", () =>
  driftwood.setGrainFreq(+woodGrain.value)
);
woodGrainMix?.addEventListener("input", () =>
  driftwood.setGrainMix(+woodGrainMix.value)
);
woodWarm?.addEventListener("input", () => driftwood.setWarm(+woodWarm.value));

if (boulderCountLabel && boulderCount)
  boulderCountLabel.textContent = String(boulderCount.value);
if (boulderCount)
  boulderCount.addEventListener("input", () => {
    boulderCountLabel.textContent = String(boulderCount.value);
    boulders.setCount(+boulderCount.value);
    boulders.regenerate();
  });
if (boulderRegenerate)
  boulderRegenerate.addEventListener("click", () => {
    resetCollisionState();
    driftwood.regenerate();
    boulders.regenerate();
    barclaya.regenerate();
    egeria.regenerate();
    grass.regenerate();
  });

if (chestRegenerate)
  chestRegenerate.addEventListener("click", () => {
    resetCollisionState();
    placeChest();
    driftwood.regenerate();
    boulders.regenerate();
    barclaya.regenerate();
    egeria.regenerate();
    grass.regenerate();
  });

if (chestBubbles)
  chestBubbles.addEventListener("input", () => {
    if (chestBubblesLabel) chestBubblesLabel.textContent = String(chestBubbles.value);
    chestLayer.setBubbleCount(+chestBubbles.value);
  });

if (chestRotation)
  chestRotation.addEventListener("input", () => {
    if (chestRotationLabel) chestRotationLabel.textContent = String(chestRotation.value);
    // Convert degrees to radians
    chestLayer.setRotation((+chestRotation.value * Math.PI) / 180);
  });

if (chestTreasure)
  chestTreasure.addEventListener("input", () => {
    chestLayer.setTreasureAmount(+chestTreasure.value);
  });

// Fish house controls
if (fishHouseHeight)
  fishHouseHeight.addEventListener("input", () => {
    fishHouse.setHeight(+fishHouseHeight.value);
    fishHouse.regenerate();
  });
if (fishHouseRadius)
  fishHouseRadius.addEventListener("input", () => {
    fishHouse.setBaseRadius(+fishHouseRadius.value);
    fishHouse.regenerate();
  });
if (fishHouseBulge)
  fishHouseBulge.addEventListener("input", () => {
    fishHouse.setBulge(+fishHouseBulge.value);
    fishHouse.regenerate();
  });
if (fishHouseStacks)
  fishHouseStacks.addEventListener("input", () => {
    if (fishHouseStacksLabel) fishHouseStacksLabel.textContent = String(fishHouseStacks.value);
    fishHouse.setStacks(+fishHouseStacks.value);
    fishHouse.regenerate();
  });
if (fishHouseLeafCount)
  fishHouseLeafCount.addEventListener("input", () => {
    if (fishHouseLeafCountLabel) fishHouseLeafCountLabel.textContent = String(fishHouseLeafCount.value);
    fishHouse.setLeafCount(+fishHouseLeafCount.value);
    fishHouse.regenerate();
  });
if (fishHouseLeafLength)
  fishHouseLeafLength.addEventListener("input", () => {
    fishHouse.setLeafLength(+fishHouseLeafLength.value);
    fishHouse.regenerate();
  });
if (fishHouseRegenerate)
  fishHouseRegenerate.addEventListener("click", () => {
    fishHouse.regenerate();
  });

// Shells controls
if (scallopsCount)
  scallopsCount.addEventListener("input", () => {
    if (scallopsCountLabel) scallopsCountLabel.textContent = String(scallopsCount.value);
    shells.setScallopsCount(+scallopsCount.value);
    shells.regenerate();
  });
if (augersCount)
  augersCount.addEventListener("input", () => {
    if (augersCountLabel) augersCountLabel.textContent = String(augersCount.value);
    shells.setAugersCount(+augersCount.value);
    shells.regenerate();
  });
if (moonsCount)
  moonsCount.addEventListener("input", () => {
    if (moonsCountLabel) moonsCountLabel.textContent = String(moonsCount.value);
    shells.setMoonsCount(+moonsCount.value);
    shells.regenerate();
  });
if (shellsSpread)
  shellsSpread.addEventListener("input", () => {
    shells.setSpread(+shellsSpread.value);
    shells.regenerate();
  });
if (shellsRegenerate)
  shellsRegenerate.addEventListener("click", () => {
    shells.regenerate();
  });

// Disco mode toggle
if (discoModeToggle)
  discoModeToggle.addEventListener("change", () => {
    discoLights.setEnabled(discoModeToggle.checked);
    boidSys.stuntsEnabled = discoModeToggle.checked;
  });

floorGravelMix?.addEventListener("input", () =>
  floor.setGravelMix(+floorGravelMix.value)
);
floorAmp?.addEventListener("input", () => floor.setAmp(+floorAmp.value));
floorGravelScale?.addEventListener("input", () =>
  floor.setGravelScale(+floorGravelScale.value)
);
floorGravelBump?.addEventListener("input", () =>
  floor.setGravelBump(+floorGravelBump.value)
);

palSand?.addEventListener(
  "change",
  () => palSand.checked && floor.setPalette("sand")
);
palGrey?.addEventListener(
  "change",
  () => palGrey.checked && floor.setPalette("grey")
);
palRainbow?.addEventListener(
  "change",
  () => palRainbow.checked && floor.setPalette("rainbow")
);

// Rebuilding the tank is expensive, so slider events are applied once per frame
let tankResizePending = false;
function scheduleTankResize() {
  if (tankResizePending) return;
  tankResizePending = true;
  requestAnimationFrame(() => {
    tankResizePending = false;
    applyTankSize();
  });
}
tankSize?.addEventListener("input", scheduleTankResize);
tankHeight?.addEventListener("input", scheduleTankResize);

function applyTankSize() {
  setTankSize(+tankSize.value);
  setTankHeight(+(tankHeight?.value ?? 1.8));
  waterSurface.setHeight(TANK_HEIGHT);
  boidSys.waterY = TANK_HEIGHT;
  cam.target[1] = TANK_HEIGHT * 0.5;
  
  boidSys.setBounds(fishBounds());
  updateLeapRoom();
  floor.regenerate();
  waterSurface.regenerate();
  tankGlass.regenerate();
  // Update tank bounds with the new dimensions from tankFloor
  updateTankBounds(TANK_X_HALF, TANK_Z_HALF);
  resetCollisionState();
  placeChest();
  driftwood.regenerate();
  boulders.regenerate();
  fishHouse.regenerate();
  barclaya.regenerate();
  egeria.regenerate();
  grass.regenerate();
  coral.regenerate();
  fanCoral.regenerate();
  staghornCoral.regenerate();
  shells.regenerate();
}

// last frame's shared data so click handler can use camera + floor height
let lastShared = null;

// Easter egg state: clicking same sand area 3x → rainbow gravel for a bit
let lastClickPos = null;
let sameSpotClicks = 0;
let rainbowTimeout = null;

// helper: spawn a cluster of bubbles at a given floor position
function spawnBubbleBurstAt(x, z, yFloor, count, radius) {
  for (let i = 0; i < count; i++) {
    const ox = x + randRange(-radius, radius);
    const oz = z + randRange(-radius, radius);
    const oy = yFloor + randRange(0.01, 0.06);
    bubbles.spawnBubble(ox, oy, oz);
  }
}

// decide what happens when user clicks world space
function handleWorldClick(worldPos) {
  if (!lastShared) return;

  const [x, y, z] = worldPos;
  const floorY = lastShared.floorYOffset;

  // 1) Check if near treasure chest
  const dxC = x - chestPos[0];
  const dzC = z - chestPos[2];
  const distChest = Math.hypot(dxC, dzC);
  if (chestVisible && distChest < 0.45) {
    // chest click: big bubble burst + random treasure
    spawnBubbleBurstAt(chestPos[0], chestPos[2], chestPos[1] + 0.05, 16, 0.06);
    chestLayer.setTreasureAmount(Math.random()); // 0..1 tweak
    return;
  }

  // 2) Sand click: small bubble puff
  spawnBubbleBurstAt(x, z, floorY, 6, 0.04);

  // 3) Easter egg: 3 clicks ~same spot ⇒ rainbow gravel mode for a bit
  const CLICK_RADIUS = 0.25;
  if (
    lastClickPos &&
    Math.hypot(x - lastClickPos[0], z - lastClickPos[1]) < CLICK_RADIUS
  ) {
    sameSpotClicks++;
  } else {
    sameSpotClicks = 1;
    lastClickPos = [x, z];
  }

  if (sameSpotClicks >= 3) {
    sameSpotClicks = 0;

    // switch to rainbow palette temporarily
    floor.setPalette("rainbow");

    if (rainbowTimeout) clearTimeout(rainbowTimeout);
    rainbowTimeout = setTimeout(() => {
      floor.setPalette("sand");
    }, 8000); // 8 seconds of secret rainbow sand
  }
}

// ----- simple math + ray helpers (GLOBAL) -----
function normalize3(v) {
  const len = Math.hypot(v[0], v[1], v[2]) || 1.0;
  return [v[0] / len, v[1] / len, v[2] / len];
}

function randRange(a, b) {
  return a + Math.random() * (b - a);
}

// Ray from camera through a pixel (in drawingBuffer coords)
function makeRayFromCamera(px, py, shared, canvas) {
  const width = canvas.width;
  const height = canvas.height;

  const ndcX = (px / width) * 2.0 - 1.0;
  const ndcY = 1.0 - (py / height) * 2.0; // flip Y

  const aspect = width / height;
  const fov = (FOV_DEG * Math.PI) / 180.0;
  const tanHalfFov = Math.tan(fov / 2.0);

  // direction in camera space
  const xCam = ndcX * tanHalfFov * aspect;
  const yCam = ndcY * tanHalfFov;
  const dirCam = normalize3([xCam, yCam, -1.0]);

  // transform dir from camera space to world using view matrix basis
  const m = shared.view;
  const camX = [m[0], m[1], m[2]];
  const camY = [m[4], m[5], m[6]];
  const camZ = [m[8], m[9], m[10]];

  const dirWorld = normalize3([
    dirCam[0] * camX[0] + dirCam[1] * camY[0] + dirCam[2] * camZ[0],
    dirCam[0] * camX[1] + dirCam[1] * camY[1] + dirCam[2] * camZ[1],
    dirCam[0] * camX[2] + dirCam[1] * camY[2] + dirCam[2] * camZ[2],
  ]);

  return { origin: shared.camPos, dir: dirWorld };
}

// intersect ray with horizontal plane y = yPlane
function rayPlaneY(origin, dir, yPlane) {
  const denom = dir[1];
  if (Math.abs(denom) < 1e-5) return null;
  const t = (yPlane - origin[1]) / denom;
  if (t < 0.0) return null;
  return [
    origin[0] + dir[0] * t,
    origin[1] + dir[1] * t,
    origin[2] + dir[2] * t,
  ];
}

// Largest fish size given to the swimming fish
const FISH_MAX_SIZE = 0.2;

// Swim area that keeps whole fish inside the glass, including the swimming wave
function fishBounds() {
  const reach = ((gfish.geometry.reach ?? 1.5) + 0.1) * FISH_MAX_SIZE;
  const xLim = Math.max(0, TANK_X_HALF - reach);
  const zLim = Math.max(0, TANK_Z_HALF - reach);
  return {
    minX: -xLim, maxX: xLim,
    minY: 0.0, maxY: TANK_HEIGHT + 0.2,
    minZ: -zLim, maxZ: zLim,
  };
}

// Simple hash for deterministic "random" numbers based on an index
function hash11(i) {
    return (Math.sin(i * 12.9898) * 43758.5453) % 1;
}

const boidSys = new BoidSystem(
  15,
  {
    separation: 0.09,
    alignment: 0.05,
    cohesion: 0.05,
    boundaryForce: 1.0
  },
  fishBounds(),
  {
    maxSpeed: 0.005,
    maxForce: 0.0004
  },
  {
    useSpatialHash: true, 
    hashSize: 0.01
  }
);

boidSys.waterY = TANK_HEIGHT;

// Fish only leap out of the water when the tank has room for the arc
function updateLeapRoom() {
  boidSys.leapAllowed = TANK_X_HALF >= 2.0 && TANK_Z_HALF >= 1.7;
}
updateLeapRoom();

const fishData = {
    pos: [],
    rotY: [],
    size: [],
    speed: [],
    colorVar: [],
    pitch: [],
    count: 0
};

// Halo for each fish in disco mode, reused every frame
const fishGlow = [];

// Approximate body colour of a fish, matching the palette in the fish shader
function fishGlowColor(colorVar, out) {
  const t = 0.5 + colorVar * 0.2;
  const d = [0.0, 0.33, 0.67 + colorVar * 0.1];
  for (let i = 0; i < 3; i++) out[i] = 0.5 + 0.5 * Math.cos(6.283185 * (t + d[i]));
  const lum = 0.299 * out[0] + 0.587 * out[1] + 0.114 * out[2];
  const sat = +(fishSaturation?.value ?? 1);
  const val = +(fishValue?.value ?? 1);
  for (let i = 0; i < 3; i++) out[i] = Math.min(1, Math.max(0, (lum + (out[i] - lum) * sat) * val));
}

// Ring of bubbles where a leaping fish breaks the surface
function spawnSplash(p) {
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const r = randRange(0.06, 0.12);
    bubbles.spawnBubble(p.x + Math.cos(a) * r, p.y - randRange(0.05, 0.25), p.z + Math.sin(a) * r);
  }
}

const foodCube = createSimpleCube(gl);

/* ---------- Render loop ---------- */
let last = performance.now(),
  frames = 0,
  acc = 0;
(function render() {
  requestAnimationFrame(render);
  const now = performance.now();
  const t = now * 0.001;
  const dt = (now - last) * 0.001;
  last = now;

  frames++;
  acc += dt;
  if (fpsEl && acc >= 0.5) {
    fpsEl.textContent = String(Math.round(frames / acc));
    frames = 0;
    acc = 0;
  }

  resizeCanvasToDisplaySize(canvas);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(FOG.color[0], FOG.color[1], FOG.color[2], 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // Projection & camera
  const proj = makePerspective(
    FOV_DEG,
    canvas.width / canvas.height,
    0.1,
    30.0
  );
  cam.az += cam.vAz;
  cam.el += cam.vEl;
  cam.r += cam.vR;
  cam.vAz *= 1 - cam.damping;
  cam.vEl *= 1 - cam.damping;
  cam.vR *= 1 - cam.damping;
  cam.el = Math.max(cam.minEl, Math.min(cam.maxEl, cam.el));
  cam.r = Math.max(cam.minR, Math.min(cam.maxR, cam.r));
  const eye = orbitToEye(cam);
  const view = lookAt(eye, cam.target, [0, 1, 0]);

  // Fog adapt (DON'T read "shared" before it's defined)
  // the fog never fully darkens the tank, even when zoomed in close
  const tankReach = Math.hypot(TANK_X_HALF, TANK_Z_HALF, TANK_HEIGHT * 0.5);
  FOG.near = Math.max(0.6 * cam.r, 2.0);
  FOG.far = Math.max(2.0 + 1.9 * cam.r, 1.25 * (cam.r + tankReach));

  // Current direction from UI
  const ang =
    typeof currentAngle === "number"
      ? currentAngle
      : parseFloat(currentAngle?.value ?? "0");
  const strength =
    typeof currentStrength === "number"
      ? currentStrength
      : parseFloat(currentStrength?.value ?? "0.6");
  const dir = [Math.cos(ang), Math.sin(ang)];

  const fp = floor.getParams
    ? floor.getParams()
    : { amp: 0.18, scale: 0.9, yOffset: -0.03 };

  // Disco look fades in and out over a moment
  const discoTarget = discoLights.isEnabled() ? 1 : 0;
  const discoStep = Math.min(Math.abs(discoTarget - discoMorph), dt / 0.8);
  discoMorph += Math.sign(discoTarget - discoMorph) * discoStep;
  if (discoLights.isEnabled()) discoGlowHue = (discoGlowHue + DISCO_GLOW_HUE_RATE * dt) % 1.0;
  for (let i = 0; i < 3; i++) FOG.color[i] = BASE_FOG[i] + (DISCO_FOG[i] - BASE_FOG[i]) * discoMorph;

  // Disco beams shine from the ball that replaces the sun
  const ballPos = sunPosition();
  discoLights.setRig(ballPos, TANK_X_HALF, TANK_Z_HALF, fp.yOffset - 0.05);

  // Update disco lights
  discoLights.update(t);
  const discoLightsArray = discoLights.getLights();
  const discoSpotlightsArray = discoLights.getSpotlights();

  const shared = {
    proj,
    view,
    time: t,
    currentStrength: strength,
    currentDir: dir,
    res: [canvas.width, canvas.height],
    fogColor: FOG.color,
    fogNear: FOG.near,
    fogFar: FOG.far,
    floorAmp: fp.amp,
    floorScale: fp.scale,
    floorYOffset: fp.yOffset,
    camPos: eye,
    discoLights: discoLightsArray,
    discoSpotlights: discoSpotlightsArray,
    decorCeiling: decorCeiling(),
    sceneBright: 1.0 - 0.75 * discoMorph,
    discoGlow: discoMorph,
    discoGlowHue,
  };

  lastShared = shared;

  // draw, into the offscreen disco target while disco is fading in or on
  const useDiscoPass = discoMorph > 0.001;
  if (useDiscoPass) discoPass.begin(canvas.width, canvas.height);
  else discoPass.release();

  floor.draw(shared);
  if (showWood?.checked !== false) driftwood.draw(shared);
  if (showBoulders?.checked !== false) boulders.draw(shared);
  if (showFishHouse?.checked !== false) fishHouse.draw(shared);
  if (showEgeria?.checked !== false) egeria.draw(shared);
  if (showBarclaya?.checked !== false) barclaya.draw(shared);
  if (showCoral?.checked !== false) {
    coral.draw(shared);
    fanCoral.draw(shared);
    staghornCoral.draw(shared);
  }
  if (showChest?.checked !== false && chestVisible) chestLayer.draw(shared);
  if (showShells?.checked !== false) shells.draw(shared);
  if (showCrab?.checked !== false) crab.draw(shared);

  boidSys.update(dt);
  const boids = boidSys.getBoidPositions();

  // splash bubbles where leaping fish cross the surface
  for (const splash of boidSys.splashes) spawnSplash(splash);
  boidSys.splashes.length = 0;

  // Reset arrays
  fishData.pos.length = 0;
  fishData.rotY.length = 0;
  fishData.size.length = 0;
  fishData.speed.length = 0;
  fishData.colorVar.length = 0;
  fishData.pitch.length = 0;

  // Disco mode cycles the fish palette
  if (discoLights.isEnabled()) {
    fishColorShift = (fishColorShift + DISCO_GLOW_HUE_RATE * dt) % 1.0;
    fishColor.value = fishColorShift;
  }

  if (isFocusView || isSlidingFish) {
    fishData.pos.push(0, 0.9, 0);
    // spin animation
    fishData.rotY.push(t * 0.2); 
    
    fishData.size.push(1.0); 
    fishData.speed.push(0.5);
    fishData.pitch.push(0.0);
    
    // uses average color
    fishData.colorVar.push(fishColorShift * 10.0 + 0.5);
    
    fishData.count = 1;
  }
  else {
    // Populate fish instance data from boids
    for (let i = 0; i < boids.length; i++) {
      const b = boids[i];
      
      // Geometry Transforms
      fishData.pos.push(b.x, b.y, b.z);
      fishData.rotY.push(b.rotY);
      fishData.pitch.push(b.pitch);
      
      const speed = (b.vx !== undefined) ? Math.hypot(b.vx, 0.0, b.vz) * 100 : 0.0;
      fishData.speed.push(Math.min(speed / 0.005, 1.0));

      // Stable Random Attributes based on Index
      const rand = Math.abs(hash11(i)); 
      fishData.size.push(0.1 + Math.abs(hash11(rand)) * (FISH_MAX_SIZE - 0.1)); // Hash again so similar color doesn't give us same size
      fishData.colorVar.push(rand + fishColorShift * 10.0);

      if (useDiscoPass) {
        if (!fishGlow[i]) fishGlow[i] = { pos: [0, 0, 0], radius: 0, color: [0, 0, 0] };
        const g = fishGlow[i];
        g.pos[0] = b.x; g.pos[1] = b.y; g.pos[2] = b.z;
        g.radius = fishData.size[i] * 2.2;
        fishGlowColor(fishData.colorVar[i], g.color);
      }
    }

    fishData.count = boids.length;
  }
  gfish.updateInstances(fishData);

  for (const food of boidSys.foods) {
      // Draw a cube at each food position
      // We pass a simple rotation that spins over time [angle, axisX, axisY, axisZ]
      foodCube.draw(shared, 
          [food.pos.x, food.pos.y, food.pos.z], 
          [t * 2.0, 1.0, 1.0, 0.0] // Spin on diagonal axis
      );
  }

  bubbles.draw(shared);

  // darken the scene and light it with the beams, then draw what glows on top
  if (useDiscoPass) discoPass.finish(shared, ballPos, discoSpotlightsArray, discoMorph);

  if (showGrass?.checked !== false) grass.draw(shared);
  gfish.draw(shared);
  sun.draw(shared, ballPos, SUN_RADIUS, discoMorph);
  if (useDiscoPass && !isFocusView && !isSlidingFish) {
    fishGlow.length = Math.min(fishGlow.length, boids.length);
    discoPass.drawGlow(shared, fishGlow, 0.35 * discoMorph);
  }
  waterSurface.draw(shared);
  tankGlass.draw(shared);
  if (useDiscoPass) discoPass.drawBeams(shared, ballPos, discoSpotlightsArray, discoMorph, fp.yOffset);
})();
