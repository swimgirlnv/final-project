// plants/barclayaLongifolia.js
import { vs, fs } from "./barclayaLongifoliaShaders.js";
import { checkCollision2D, isInsideTank } from "../../sceneCollision.js";

// ---- Noise + clump field ---------------------------------------------------
const TANK = { xHalf: 1.6, zHalf: 1.2 }; // overall footprint used for clump cells
const CLUMP = {
  cell: 0.9,        // grid cell size → spacing between possible Barclaya clumps
  radius: 0.35,     // how far rosettes spread from a clump center
  noiseScale: 0.7,  // FBM frequency for clump presence
  threshold: 0.55,  // higher = fewer clumps
};

function fract1(x) {
  return x - Math.floor(x);
}
function hash2(i, j) {
  return fract1(Math.sin(i * 127.1 + j * 311.7) * 43758.5453);
}
function noise2(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const a = hash2(ix,     iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix,     iy + 1);
  const d = hash2(ix + 1, iy + 1);
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const ab = a * (1 - u) + b * u;
  const cd = c * (1 - u) + d * u;
  return ab * (1 - v) + cd * v; // 0..1
}
function fbm2(x, y, oct = 4) {
  let f = 0.0, amp = 0.5, freq = 1.0;
  for (let k = 0; k < oct; k++) {
    f += amp * noise2(x * freq, y * freq);
    amp *= 0.5;
    freq *= 2.0;
  }
  return f; // ~0..1
}

// ---- Non-intersection + spatial hashing ------------------------------------
const T_SAMPLES = [0.25, 0.45, 0.65, 0.85];
const SAFETY = 1.05;

// width profile at t (matches VS shape)
function widthAtMid(wHalf, undulAmp, t) {
  const mid = Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, t))), 0.8);
  return (wHalf * mid + undulAmp) * 2.0; // full width
}

function rOnGround(len, pitch, t) {
  const cosP = Math.cos(Math.min(1, Math.max(0, pitch)) * 1.2);
  return t * len * Math.max(0.0, cosP);
}

function angWrap(a) {
  return ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
}
function angDiff(a, b) {
  let d = Math.abs(angWrap(a) - angWrap(b));
  return d > Math.PI ? 2 * Math.PI - d : d;
}

// local (same-rosette) quick angular guard
function minAngularGap(lenA, wA, pitchA, lenB, wB, pitchB) {
  const rA = rOnGround(lenA, pitchA, 0.55);
  const rB = rOnGround(lenB, pitchB, 0.55);
  const r = Math.max(0.08, 0.5 * (rA + rB));
  const WA = widthAtMid(wA, 0.0, 0.55);
  const WB = widthAtMid(wB, 0.0, 0.55);
  return SAFETY * ((WA + WB) / r); // radians
}

function collidesLocal(c, others, cx, cz) {
  const dirC = [Math.cos(c.yaw), Math.sin(c.yaw)];
  for (const o of others) {
    const dirO = [Math.cos(o.yaw), Math.sin(o.yaw)];
    if (
      angDiff(c.yaw, o.yaw) <
      minAngularGap(c.len, c.wid, c.pitch, o.len, o.wid, o.pitch)
    )
      return true;
    for (const tt of T_SAMPLES) {
      const rC = rOnGround(c.len, c.pitch, tt);
      const rO = rOnGround(o.len, o.pitch, tt);
      const pC = [cx + dirC[0] * rC, cz + dirC[1] * rC];
      const pO = [cx + dirO[0] * rO, cz + dirO[1] * rO];
      const dist = Math.hypot(pC[0] - pO[0], pC[1] - pO[1]);
      const sum =
        SAFETY *
        0.5 *
        (widthAtMid(c.wid, c.undul, tt) + widthAtMid(o.wid, o.undul, tt));
      if (dist < sum) return true;
    }
  }
  return false;
}

// --- spatial hash for cross-rosette checks
const GRID = { cell: 0.35 }; // tune: ~ half a typical leaf length
function keyFor(x, z) {
  return Math.floor(x / GRID.cell) + "," + Math.floor(z / GRID.cell);
}
function cellsForCircle(cx, cz, r) {
  const i0 = Math.floor((cx - r) / GRID.cell),
    i1 = Math.floor((cx + r) / GRID.cell);
  const j0 = Math.floor((cz - r) / GRID.cell),
    j1 = Math.floor((cz + r) / GRID.cell);
  const keys = [];
  for (let i = i0; i <= i1; i++)
    for (let j = j0; j <= j1; j++) keys.push(i + "," + j);
  return keys;
}
function getNeighbors(grid, cx, cz, r) {
  const out = [];
  for (const k of cellsForCircle(cx, cz, r)) {
    const a = grid.get(k);
    if (a) out.push(...a);
  }
  return out;
}
function addToGrid(grid, rec, r) {
  for (const k of cellsForCircle(rec.cx, rec.cz, r)) {
    let a = grid.get(k);
    if (!a) {
      a = [];
      grid.set(k, a);
    }
    a.push(rec);
  }
}

// global collision test (between different rosettes)
function collidesGlobal(c, cx, cz, neighbors) {
  const dirC = [Math.cos(c.yaw), Math.sin(c.yaw)];
  for (const o of neighbors) {
    const dirO = [Math.cos(o.yaw), Math.sin(o.yaw)];
    for (const tt of T_SAMPLES) {
      const rC = rOnGround(c.len, c.pitch, tt);
      const rO = rOnGround(o.len, o.pitch, tt);
      const pC = [cx + dirC[0] * rC, cz + dirC[1] * rC];
      const pO = [o.cx + dirO[0] * rO, o.cz + dirO[1] * rO];
      const dist = Math.hypot(pC[0] - pO[0], pC[1] - pO[1]);
      const sum =
        SAFETY *
        0.5 *
        (widthAtMid(c.wid, c.undul, tt) + widthAtMid(o.wid, o.undul, tt));
      if (dist < sum) return true;
    }
  }
  return false;
}

export function createBarclayaLayer(gl) {
  // --- compile/link with explicit bindings
  function sh(t, s) {
    const h = gl.createShader(t);
    gl.shaderSource(h, s);
    gl.compileShader(h);
    if (!gl.getShaderParameter(h, gl.COMPILE_STATUS))
      throw new Error(gl.getShaderInfoLog(h));
    return h;
  }
  function prog(vsSrc, fsSrc, bind) {
    const p = gl.createProgram(),
      v = sh(gl.VERTEX_SHADER, vsSrc),
      f = sh(gl.FRAGMENT_SHADER, fsSrc);
    gl.attachShader(p, v);
    gl.attachShader(p, f);
    for (const [name, loc] of Object.entries(bind))
      gl.bindAttribLocation(p, loc, name);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(p));
    gl.deleteShader(v);
    gl.deleteShader(f);
    return p;
  }

  // --- unit ribbon
  function makeRibbon(segments = 32) {
    const pos = [],
      a_t = [],
      uv = [],
      idx = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      pos.push(-0.5, t, +0.5, t);
      a_t.push(t, t);
      uv.push(0, t, 1, t);
      if (i < segments) {
        const b = i * 2;
        idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
      }
    }
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    function vbuf(arr, loc, size) {
      const b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
      return b;
    }
    vbuf(pos, 0, 2);
    vbuf(a_t, 1, 1);
    vbuf(uv, 2, 2);
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(
      gl.ELEMENT_ARRAY_BUFFER,
      new Uint16Array(idx),
      gl.STATIC_DRAW
    );
    return {
      vao,
      count: idx.length,
      attribs: {
        i_baseXZ: 3,
        i_lenWidth: 4,
        i_yawPitch: 5,
        i_curveUndul: 6,
        i_hueVar: 7,
      },
    };
  }

  function makeInstBufs(attribs, max) {
    function mk(loc, comps = 2) {
      const b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, max * comps * 4, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, comps, gl.FLOAT, false, 0, 0);
      gl.vertexAttribDivisor(loc, 1);
      return b;
    }
    return {
      baseXZ: mk(attribs.i_baseXZ, 2),
      lenWidth: mk(attribs.i_lenWidth, 2),
      yawPitch: mk(attribs.i_yawPitch, 2),
      curveUndul: mk(attribs.i_curveUndul, 2),
      hueVar: mk(attribs.i_hueVar, 2),
      count: 0,
      update(d) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.baseXZ);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(d.baseXZ));
        gl.bindBuffer(gl.ARRAY_BUFFER, this.lenWidth);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(d.lenWidth));
        gl.bindBuffer(gl.ARRAY_BUFFER, this.yawPitch);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(d.yawPitch));
        gl.bindBuffer(gl.ARRAY_BUFFER, this.curveUndul);
        gl.bufferSubData(
          gl.ARRAY_BUFFER,
          0,
          new Float32Array(d.curveUndul)
        );
        gl.bindBuffer(gl.ARRAY_BUFFER, this.hueVar);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(d.hueVar));
        this.count = d.count;
      },
    };
  }

  const program = prog(vs, fs, {
    a_pos: 0,
    a_t: 1,
    a_uv: 2,
    i_baseXZ: 3,
    i_lenWidth: 4,
    i_yawPitch: 5,
    i_curveUndul: 6,
    i_hueVar: 7,
  });

  const ribbon = makeRibbon(36);
  gl.bindVertexArray(ribbon.vao);
  const inst = makeInstBufs(ribbon.attribs, 20000);

  // uniforms
  const U = (n) => gl.getUniformLocation(program, n);
  const u_proj = U("u_proj"),
    u_view = U("u_view"),
    u_time = U("u_time");
  const u_currentStrength = U("u_currentStrength"),
    u_currentDir = U("u_currentDir");
  const u_undulFreq = U("u_undulFreq");
  const u_fogColor = U("u_fogColor"),
    u_fogNear = U("u_fogNear"),
    u_fogFar = U("u_fogFar");

  // --- state
  const state = {
    plants: 18, // rosettes
    minLeaves: 5,
    maxLeaves: 11, // per rosette
    undulFreq: 22.0, // edge ripple frequency
    spread: { x: 1.55, z: 1.15 }, // tank footprint (used only for fallback singles)
    redProb: 0.35, // chance a leaf is magenta-leaning
  };

  function rand(a, b) {
    return a + Math.random() * (b - a);
  }

  const MAX_TRIES = 28;
  const PLANT_RADIUS = 0.18; // rosette footprint for tank / object collisions

  // Helper to place one rosette at (cx, cz) with full collision checks
  function placeRosetteAt(cx, cz, grid, d) {
    const leaves = Math.floor(
      rand(state.minLeaves, state.maxLeaves + 0.999)
    );
    const yawSeed = rand(0, Math.PI * 2);
    const localAccepted = [];

    for (let i = 0; i < leaves; i++) {
      const len = rand(0.65, 1.35);
      const wid = len * rand(0.12, 0.2); // half-width
      const pitch = rand(0.45, 0.95);
      const arch = rand(0.04, 0.11);
      const undul = rand(0.01, 0.03);
      const hueTweak = rand(-0.03, 0.03);
      const redness =
        Math.random() < state.redProb ? rand(0.55, 1.0) : rand(0.0, 0.35);

      let placed = false;
      let yawBase = yawSeed + (i / Math.max(1, leaves)) * (Math.PI * 2);

      for (let tries = 0; tries < MAX_TRIES && !placed; tries++) {
        const yaw = (yawBase + rand(-0.32, 0.32)) % (Math.PI * 2);
        const cand = { yaw, len, wid, pitch, arch, undul, hueTweak, redness };

        // bounding radius for spatial hash query
        const rBound = rOnGround(len, pitch, 1.0) + wid * 2.0 + 0.04;
        const neighbors = getNeighbors(grid, cx, cz, rBound);

        if (
          !collidesLocal(cand, localAccepted, cx, cz) &&
          !collidesGlobal(cand, cx, cz, neighbors)
        ) {
          // Accept: write instance data
          d.baseXZ.push(cx, cz);
          d.lenWidth.push(len, wid);
          d.yawPitch.push(yaw, pitch);
          d.curveUndul.push(arch, undul);
          d.hueVar.push(hueTweak, redness);
          d.count++;

          localAccepted.push(cand);
          const rec = { cx, cz, yaw, len, wid, pitch, arch, undul };
          addToGrid(grid, rec, rBound);
          placed = true;
        } else {
          yawBase += rand(0.18, 0.42) * (Math.random() < 0.5 ? 1 : -1);
        }
      }
      // if not placed after MAX_TRIES, we silently skip that leaf
    }

    return localAccepted.length > 0;
  }

  function regenerate() {
    const d = {
      baseXZ: [],
      lenWidth: [],
      yawPitch: [],
      curveUndul: [],
      hueVar: [],
      count: 0,
    };

    const grid = new Map();
    const seed = Math.random() * 1000.0;

    let plantsPlaced = 0;

    // ---------- CLUMPED ROSETTES ------------------------------------------
    const nx = Math.max(1, Math.floor((2 * TANK.xHalf) / CLUMP.cell));
    const nz = Math.max(1, Math.floor((2 * TANK.zHalf) / CLUMP.cell));
    const dx = (2 * TANK.xHalf) / nx;
    const dz = (2 * TANK.zHalf) / nz;

    for (let gx = 0; gx < nx && plantsPlaced < state.plants; gx++) {
      for (let gz = 0; gz < nz && plantsPlaced < state.plants; gz++) {
        const cxCell = -TANK.xHalf + (gx + 0.5) * dx;
        const czCell = -TANK.zHalf + (gz + 0.5) * dz;

        const n = fbm2(
          (cxCell + seed) * CLUMP.noiseScale,
          (czCell - seed) * CLUMP.noiseScale,
          4
        );
        if (n < CLUMP.threshold) continue; // no clump here

        const group = Math.min(
          1 + Math.floor(rand(0, 3)), // 1–3 rosettes per clump
          state.plants - plantsPlaced
        );

        for (let k = 0; k < group && plantsPlaced < state.plants; k++) {
          const ang = rand(0, Math.PI * 2);
          const r = rand(0.0, CLUMP.radius);
          const cx = cxCell + r * Math.cos(ang);
          const cz = czCell + r * Math.sin(ang);

          if (!isInsideTank(cx, cz, PLANT_RADIUS)) continue;
          if (checkCollision2D(cx, cz, PLANT_RADIUS, 0.0)) continue;

          if (placeRosetteAt(cx, cz, grid, d)) {
            plantsPlaced++;
          }
        }
      }
    }

    // ---------- FALLBACK SINGLES (if noise too sparse) --------------------
    const maxPlantAttempts = state.plants * 40;
    let attempts = 0;
    while (plantsPlaced < state.plants && attempts < maxPlantAttempts) {
      attempts++;
      const cx = rand(-state.spread.x, state.spread.x);
      const cz = rand(-state.spread.z, state.spread.z);

      if (!isInsideTank(cx, cz, PLANT_RADIUS)) continue;
      if (checkCollision2D(cx, cz, PLANT_RADIUS, 0.0)) continue;

      if (placeRosetteAt(cx, cz, grid, d)) {
        plantsPlaced++;
      }
    }

    inst.update(d);
  }
  regenerate();

  return {
    setPlantCount(n) {
      state.plants = Math.max(1, n | 0);
    },
    setRedProbability(p) {
      state.redProb = Math.max(0, Math.min(1, +p));
    },
    regenerate,
    draw(shared) {
      if (inst.count === 0) return;
      gl.useProgram(program);
      gl.bindVertexArray(ribbon.vao);

      gl.uniformMatrix4fv(u_proj, false, shared.proj);
      gl.uniformMatrix4fv(u_view, false, shared.view);
      gl.uniform1f(u_time, shared.time);
      gl.uniform1f(u_currentStrength, shared.currentStrength);
      gl.uniform2f(u_currentDir, shared.currentDir[0], shared.currentDir[1]);
      gl.uniform1f(u_undulFreq, state.undulFreq);

      gl.uniform3f(
        u_fogColor,
        shared.fogColor[0],
        shared.fogColor[1],
        shared.fogColor[2]
      );
      gl.uniform1f(u_fogNear, shared.fogNear);
      gl.uniform1f(u_fogFar, shared.fogFar);

      gl.drawElementsInstanced(
        gl.TRIANGLES,
        ribbon.count,
        gl.UNSIGNED_SHORT,
        0,
        inst.count
      );
    },
  };
}