// Egeria densa as a layer: expose {draw, regenerate, set*}

import { vs, fs } from "./egeriaDensaShaders.js";

const TANK = { xHalf: 1.6, zHalf: 1.2 }; // world half-extents in X/Z
const CLUMP = {
  cell: 0.6, // grid cell size -> spacing between possible clumps
  radius: 0.18, // how wide a clump spreads
  noiseScale: 0.9, // fbm frequency for clump presence
  threshold: 0.58, // higher = sparser clumps
};

// ------- FBM noise helpers
function fract(x) {
  return x - Math.floor(x);
}
function hash2(i, j) {
  return fract(Math.sin(i * 127.1 + j * 311.7) * 43758.5453);
}
function noise2(x, y) {
  const i = Math.floor(x),
    j = Math.floor(y);
  const fx = x - i,
    fy = y - j;
  const a = hash2(i, j);
  const b = hash2(i + 1, j);
  const c = hash2(i, j + 1);
  const d = hash2(i + 1, j + 1);
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v; // 0..1
}
function fbm2(x, y, oct = 4) {
  let f = 0,
    amp = 0.5,
    freq = 1.0;
  for (let k = 0; k < oct; k++) {
    f += amp * noise2(x * freq, y * freq);
    amp *= 0.5;
    freq *= 2.0;
  }
  return f; // ~0..1
}

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS))
    throw new Error(gl.getShaderInfoLog(sh) || "Shader compile failed");
  return sh;
}
function makeProgram(gl, vsSrc, fsSrc, bindings) {
  const p = gl.createProgram();
  const v = compile(gl, gl.VERTEX_SHADER, vsSrc);
  const f = compile(gl, gl.FRAGMENT_SHADER, fsSrc);
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  for (const [name, loc] of Object.entries(bindings))
    gl.bindAttribLocation(p, loc, name);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS))
    throw new Error(gl.getProgramInfoLog(p) || "Link error");
  gl.deleteShader(v);
  gl.deleteShader(f);
  return p;
}
function rand(a, b) {
  return a + Math.random() * (b - a);
}

function createRibbon(gl, segments = 28) {
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
  const ibo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
  return {
    vao,
    count: idx.length,
    attribs: {
      i_originXZ: 3,
      i_originYLen: 4,
      i_phiTilt: 5,
      i_curveWidth: 6,
      i_hueKind: 7,
    },
  };
}
function makeInstBufs(gl, attribs, maxCount) {
  function mk(loc, comps = 2) {
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, maxCount * comps * 4, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, comps, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(loc, 1);
    return b;
  }
  return {
    originXZ: mk(attribs.i_originXZ, 2),
    originYLen: mk(attribs.i_originYLen, 2),
    phiTilt: mk(attribs.i_phiTilt, 2),
    curveWidth: mk(attribs.i_curveWidth, 2),
    hueKind: mk(attribs.i_hueKind, 2),
    count: 0,
    update(gl, data) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.originXZ);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(data.originXZ));
      gl.bindBuffer(gl.ARRAY_BUFFER, this.originYLen);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(data.originYLen));
      gl.bindBuffer(gl.ARRAY_BUFFER, this.phiTilt);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(data.phiTilt));
      gl.bindBuffer(gl.ARRAY_BUFFER, this.curveWidth);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(data.curveWidth));
      gl.bindBuffer(gl.ARRAY_BUFFER, this.hueKind);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(data.hueKind));
      this.count = data.count;
    },
  };
}

// tiny parametric L-system utilities
function pushStem(inst, base, y0, len, hue) {
  inst.originXZ.push(base[0], base[1]);
  inst.originYLen.push(y0, len);
  inst.phiTilt.push(0, 1);
  inst.curveWidth.push(0.015, 0.006);
  inst.hueKind.push(hue, 1.0); // stem
  inst.count++;
}

function pushWhorl(inst, base, y, k, startPhi, hue, scale = 1.0) {
  const leafLenBase = rand(0.15, 0.23) * scale;
  const width = rand(0.006, 0.011) * scale;
  const curve = rand(0.03, 0.08) * scale;
  const tiltTip = rand(0.4, 0.75);
  for (let i = 0; i < k; i++) {
    const phi = startPhi + i * ((2 * Math.PI) / k) + rand(-0.07, 0.07);
    inst.originXZ.push(base[0], base[1]);
    inst.originYLen.push(y, leafLenBase * rand(0.8, 1.2));
    inst.phiTilt.push(phi, tiltTip);
    inst.curveWidth.push(curve, width);
    inst.hueKind.push(hue + rand(-0.01, 0.02), 0.0); // leaf
    inst.count++;
  }
}

export function createEgeriaLayer(gl) {
  const bindings = {
    a_pos: 0,
    a_t: 1,
    a_uv: 2,
    i_originXZ: 3,
    i_originYLen: 4,
    i_phiTilt: 5,
    i_curveWidth: 6,
    i_hueKind: 7,
  };
  const prog = makeProgram(gl, vs, fs, bindings);
  const ribbon = createRibbon(gl, 28);
  gl.bindVertexArray(ribbon.vao); // ensure instanced attribs attach to this VAO
  const inst = makeInstBufs(gl, ribbon.attribs, 20000);

  // uniforms
  const U = (n) => gl.getUniformLocation(prog, n);
  const u_proj = U("u_proj"),
    u_view = U("u_view"),
    u_time = U("u_time");
  const u_currentStrength = U("u_currentStrength"),
    u_currentDir = U("u_currentDir"),
    u_res = U("u_res");
  // extra width scaler (multiply width0 in VS): add this uniform to your VS if you don’t have it yet
  // Just add:  `uniform float u_leafWidthScale;` and after computing width0 do `float width0 = ... * u_leafWidthScale;`
  const u_leafWidthScale = U("u_leafWidthScale");

  const u_fogColor = U("u_fogColor");
  const u_fogNear = U("u_fogNear");
  const u_fogFar = U("u_fogFar");

  const state = {
    stems: 120,
    nodes: 12,
    branchChance: 0.05,
    leafWidthScale: 0.85,
  };

  function regenerate() {
    const data = {
      originXZ: [],
      originYLen: [],
      phiTilt: [],
      curveWidth: [],
      hueKind: [],
      count: 0,
    };

    const seed = Math.random() * 1000.0;

    // Build a coarse grid of potential clump centers
    const nx = Math.max(1, Math.floor((2 * TANK.xHalf) / CLUMP.cell));
    const nz = Math.max(1, Math.floor((2 * TANK.zHalf) / CLUMP.cell));
    const dx = (2 * TANK.xHalf) / nx;
    const dz = (2 * TANK.zHalf) / nz;

    let planted = 0;

    for (let gx = 0; gx < nx && planted < state.stems; gx++) {
      for (let gz = 0; gz < nz && planted < state.stems; gz++) {
        // cell center
        const cx = -TANK.xHalf + (gx + 0.5) * dx;
        const cz = -TANK.zHalf + (gz + 0.5) * dz;

        // FBM decides if this cell contains a clump
        const n = fbm2(
          (cx + seed) * CLUMP.noiseScale,
          (cz - seed) * CLUMP.noiseScale,
          4
        );
        if (n < CLUMP.threshold) continue; // empty cell = spacing between clumps

        // Clump size 1–5 (capped by remaining stems)
        const group = Math.min(
          1 + Math.floor(rand(0, 5)),
          state.stems - planted
        );

        for (let k = 0; k < group && planted < state.stems; k++) {
          // random offset in a small disk around center
          const ang = rand(0, 2 * Math.PI);
          const r = rand(0.0, CLUMP.radius);
          const base = [cx + r * Math.cos(ang), cz + r * Math.sin(ang)];

          // Per-plant hue & height from noise
          const hue = rand(0.28, 0.36);
          const hn = fbm2(
            (base[0] + seed * 1.7) * 0.9,
            (base[1] - seed * 0.9) * 0.9,
            3
          );
          const heightScale = 0.7 + 0.6 * hn; // 0.70 .. 1.30
          const nodes = Math.max(6, Math.round(state.nodes * heightScale));

          let y = 0.0,
            twist = rand(0, 2 * Math.PI);
          for (let i = 0; i < nodes; i++) {
            const seg =
              (0.1 + 0.02 * Math.max(0, 1.0 - i / nodes)) * heightScale;
            pushStem(data, base, y, seg, hue);
            y += seg;

            const leaves = Math.floor(rand(3, 5.999)); // 3–5 thin leaves per whorl
            pushWhorl(data, base, y, leaves, twist, hue, 1.0);
            twist += 0.42;

            // Rare/short side shoots; a bit more common in taller (high-noise) plants
            const bChance = state.branchChance * 0.5 * (0.5 + hn); // generally lower than before
            if (i > 2 && i < nodes - 2 && Math.random() < bChance) {
              let y2 = y - rand(0.04, 0.1),
                tw2 = twist + rand(-0.35, 0.35);
              const sideN = Math.max(2, Math.floor(nodes * 0.25));
              for (let j = 0; j < sideN; j++) {
                const d =
                  (0.08 + 0.015 * Math.max(0, 1 - j / sideN)) *
                  0.85 *
                  heightScale;
                pushStem(data, base, y2, d, hue);
                y2 += d;
                const kLeaves = Math.floor(rand(3, 4.999));
                pushWhorl(data, base, y2, kLeaves, tw2, hue, 0.65);
                tw2 += 0.4;
              }
            }
          }

          planted++;
        }
      }
    }

    // If we under-filled (super sparse threshold), sprinkle a few singles
    while (planted < state.stems) {
      const x = rand(-TANK.xHalf, TANK.xHalf);
      const z = rand(-TANK.zHalf, TANK.zHalf);
      const hue = rand(0.28, 0.36);
      const hn = fbm2((x + seed * 1.7) * 0.9, (z - seed * 0.9) * 0.9, 3);
      const heightScale = 0.7 + 0.6 * hn;
      const nodes = Math.max(6, Math.round(state.nodes * heightScale));
      let y = 0.0,
        twist = rand(0, 2 * Math.PI);
      for (let i = 0; i < nodes; i++) {
        const seg = (0.1 + 0.02 * Math.max(0, 1.0 - i / nodes)) * heightScale;
        pushStem(data, [x, z], y, seg, hue);
        y += seg;
        const leaves = Math.floor(rand(3, 5.999));
        pushWhorl(data, [x, z], y, leaves, twist, hue, 1.0);
        twist += 0.42;
      }
      planted++;
    }

    inst.update(gl, data);
  }
  regenerate();

  return {
    setCount(n) {
      state.stems = n | 0;
    },
    setNodes(n) {
      state.nodes = n | 0;
    },
    setBranchChance(x) {
      state.branchChance = Math.max(0, +x);
    },
    setLeafWidthScale(s) {
      state.leafWidthScale = Math.max(0.1, +s);
    },
    regenerate,
    draw(shared) {
      if (inst.count === 0) return;
      gl.useProgram(prog);
      gl.bindVertexArray(ribbon.vao);
      gl.uniformMatrix4fv(u_proj, false, shared.proj);
      gl.uniformMatrix4fv(u_view, false, shared.view);
      gl.uniform1f(u_time, shared.time);
      gl.uniform1f(u_currentStrength, shared.currentStrength);
      gl.uniform2f(u_currentDir, shared.currentDir[0], shared.currentDir[1]);
      gl.uniform2f(u_res, shared.res[0], shared.res[1]);
      gl.uniform1f(u_leafWidthScale, state.leafWidthScale);
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
