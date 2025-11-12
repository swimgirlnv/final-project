// src/main.js
import { createEgeriaLayer } from "./plants/egeriaDensa.js";
import { createGrassLayer } from "./plants/grass.js";
import { createFloorLayer } from "./tank/tankFloor.js";

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
const canvas = document.getElementById("gl"); // ⬅️ declare before using it
const fpsEl = document.getElementById("fps");
const showGrass = document.getElementById("showGrass");
const showEgeria = document.getElementById("showEgeria");
const currentStrength = 0;
const currentAngle = -3.14;

// grass controls
const plantCount = document.getElementById("plantCount");
const plantCountLabel = document.getElementById("plantCountLabel");
const flex = document.getElementById("flex");
const heightAvg = document.getElementById("height");

// egeria controls
const egCount = document.getElementById("egeriaCount");
const egWidth = document.getElementById("egeriaLeafWidth");
const egNodes = document.getElementById("egeriaNodes");
const egBranch = document.getElementById("egeriaBranch");

const scatterBtn = document.getElementById("scatter");
const regenBtn = document.getElementById("regenerate");

/* ---------- Orbit camera ---------- */
const cam = {
  target: [0, 0.9, 0],
  r: 3.4,
  az: Math.PI * 0.5,
  el: 0.09,
  minR: 1.1,
  maxR: 7.0,
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
canvas.addEventListener("pointerdown", (e) => {
  isDragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
  canvas.setPointerCapture(e.pointerId);
  canvas.style.cursor = "grabbing";
});
canvas.addEventListener("pointermove", (e) => {
  if (!isDragging) return;
  const dx = e.clientX - lastX,
    dy = e.clientY - lastY;
  lastX = e.clientX;
  lastY = e.clientY;
  cam.vAz += dx * ROT_SPEED;
  cam.vEl += dy * EL_SPEED;
});
canvas.addEventListener("pointerup", (e) => {
  isDragging = false;
  canvas.releasePointerCapture(e.pointerId);
  canvas.style.cursor = "grab";
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
  cam.r = 3.4;
  cam.az = Math.PI * 0.5;
  cam.el = 0.09;
  cam.vAz = cam.vEl = cam.vR = 0;
});

/* ---------- GL + layers ---------- */
const gl = createGL(canvas);
gl.enable(gl.DEPTH_TEST);
gl.clearColor(0.02, 0.07, 0.13, 1);

const floor = createFloorLayer(gl);
const grass = createGrassLayer(gl);
const egeria = createEgeriaLayer(gl);

const FOG = { color: [0.02, 0.07, 0.13], near: 2.0, far: 5.5 };
floor.setFog(FOG.color, FOG.near, FOG.far);

/* ---------- UI wiring ---------- */
function updateCountLabel() {
  if (plantCountLabel && plantCount)
    plantCountLabel.textContent = String(plantCount.value);
}
updateCountLabel();

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
    grass.regenerate();
  });

if (egCount)
  egCount.addEventListener("input", () => {
    egeria.setCount(+egCount.value);
    egeria.regenerate();
  });
if (egWidth)
  egWidth.addEventListener("input", () =>
    egeria.setLeafWidthScale(+egWidth.value)
  );
if (egNodes)
  egNodes.addEventListener("input", () => {
    egeria.setNodes(+egNodes.value);
    egeria.regenerate();
  });
if (egBranch)
  egBranch.addEventListener("input", () => {
    egeria.setBranchChance(+egBranch.value);
    egeria.regenerate();
  });

if (scatterBtn)
  scatterBtn.addEventListener("click", () => {
    grass.regenerate();
    egeria.regenerate();
  });
if (regenBtn)
  regenBtn.addEventListener("click", () => {
    grass.regenerate();
    egeria.regenerate();
  });

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
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // Projection & camera
  const proj = makePerspective(45, canvas.width / canvas.height, 0.1, 30.0);

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
  FOG.near = 0.6 * cam.r;
  FOG.far = 2.0 + 1.9 * cam.r;

  // Current direction from UI
  const ang = parseFloat(currentAngle?.value ?? "0"); // <-- define angle
  const dir = [Math.cos(ang), Math.sin(ang)];

  const shared = {
    proj,
    view,
    time: t,
    currentStrength: parseFloat(currentStrength?.value ?? "0.6"),
    currentDir: dir,
    res: [canvas.width, canvas.height],
    fogColor: FOG.color,
    fogNear: FOG.near,
    fogFar: FOG.far,
  };

  // draw
  floor.draw(shared);
  if (showGrass?.checked !== false) grass.draw(shared);
  if (showEgeria?.checked !== false) egeria.draw(shared);
})();