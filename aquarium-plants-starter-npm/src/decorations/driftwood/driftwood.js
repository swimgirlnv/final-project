// decorations/driftwood/driftwood.js
import { vs, fs } from "./driftwoodShaders.js";

export function createDriftwoodLayer(gl) {
  // --- compile/link
  function sh(t, s) {
    const h = gl.createShader(t);
    gl.shaderSource(h, s);
    gl.compileShader(h);
    if (!gl.getShaderParameter(h, gl.COMPILE_STATUS))
      throw new Error(gl.getShaderInfoLog(h));
    return h;
  }
  function program(vsSrc, fsSrc, bindings) {
    const p = gl.createProgram(),
      v = sh(gl.VERTEX_SHADER, vsSrc),
      f = sh(gl.FRAGMENT_SHADER, fsSrc);
    gl.attachShader(p, v);
    gl.attachShader(p, f);
    for (const [name, loc] of Object.entries(bindings))
      gl.bindAttribLocation(p, loc, name);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(p));
    gl.deleteShader(v);
    gl.deleteShader(f);
    return p;
  }

  const TAU = Math.PI * 2;
  const TANK = { xHalf: 1.6, zHalf: 1.2, margin: 0.08 }; // confines

  function rand(a, b) {
    return a + Math.random() * (b - a);
  }
  function nrand() {
    return (
      (Math.random() + Math.random() + Math.random() + Math.random() - 2.0) *
      0.5
    );
  }

  // ---- vector helpers
  function norm(v) {
    const L = Math.hypot(v.x, v.y, v.z) || 1;
    v.x /= L;
    v.y /= L;
    v.z /= L;
    return v;
  }
  function cross(a, b) {
    return {
      x: a.y * b.z - a.z * b.y,
      y: a.z * b.x - a.x * b.z,
      z: a.x * b.y - a.y * b.x,
    };
  }
  function dot(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
  }
  function rotateAroundAxis(v, a, cosA, sinA) {
    // Rodrigues: v*cos + (a×v)*sin + a*(a·v)*(1-cos)
    const axv = cross(a, v),
      adv = dot(a, v),
      oneMinus = 1.0 - cosA;
    return {
      x: v.x * cosA + axv.x * sinA + a.x * adv * oneMinus,
      y: v.y * cosA + axv.y * sinA + a.y * adv * oneMinus,
      z: v.z * cosA + axv.z * sinA + a.z * adv * oneMinus,
    };
  }

  // clamp & bounce to keep inside tank on X/Z
  function confine(pt, dir) {
    if (pt.x < -TANK.xHalf + TANK.margin) {
      pt.x = -TANK.xHalf + TANK.margin;
      dir.x = Math.abs(dir.x);
    }
    if (pt.x > TANK.xHalf - TANK.margin) {
      pt.x = TANK.xHalf - TANK.margin;
      dir.x = -Math.abs(dir.x);
    }
    if (pt.z < -TANK.zHalf + TANK.margin) {
      pt.z = -TANK.zHalf + TANK.margin;
      dir.z = Math.abs(dir.z);
    }
    if (pt.z > TANK.zHalf - TANK.margin) {
      pt.z = TANK.zHalf - TANK.margin;
      dir.z = -Math.abs(dir.z);
    }
  }

  // path builder with jitter + tank bounce; skips degenerate steps
  function makePath(start, dir, segs, stepLen, upBias, gnarl) {
    const pts = [start];
    let d = { ...dir };
    for (let i = 1; i <= segs; i++) {
      d.x += gnarl * nrand() * 0.35;
      d.y += gnarl * nrand() * 0.22 + upBias * 0.08;
      d.z += gnarl * nrand() * 0.35;
      const dl = Math.hypot(d.x, d.y, d.z) || 1.0;
      d.x /= dl;
      d.y /= dl;
      d.z /= dl;

      const p = pts[pts.length - 1];
      const nx = p.x + d.x * stepLen * (0.75 + Math.random() * 0.5);
      const ny = Math.max(
        0.02,
        p.y + d.y * stepLen * (0.75 + Math.random() * 0.5)
      );
      const nz = p.z + d.z * stepLen * (0.75 + Math.random() * 0.5);
      const np = { x: nx, y: ny, z: nz };
      confine(np, d);

      if (Math.hypot(np.x - p.x, np.y - p.y, np.z - p.z) < 1e-4) {
        i--;
        continue;
      }
      pts.push(np);
    }
    return pts;
  }

  // Resample path so segments are short and turns are gentle
  function resamplePath(path, maxSegLen, maxTurnRad) {
    if (path.length < 2) return path.slice();
    const out = [path[0]];
    let prev = path[0];
    let Tprev = null;
    for (let i = 1; i < path.length; i++) {
      const cur = path[i];
      let dx = cur.x - prev.x,
        dy = cur.y - prev.y,
        dz = cur.z - prev.z;
      let len = Math.hypot(dx, dy, dz);
      if (len < 1e-6) {
        continue;
      }
      const Tcur = { x: dx / len, y: dy / len, z: dz / len };
      let steps = Math.max(1, Math.ceil(len / maxSegLen));
      if (Tprev) {
        const c = Math.max(-1, Math.min(1, dot(Tprev, Tcur)));
        const ang = Math.acos(c);
        steps = Math.max(steps, Math.ceil(ang / maxTurnRad));
      }
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        out.push({
          x: prev.x + dx * t,
          y: prev.y + dy * t,
          z: prev.z + dz * t,
        });
      }
      prev = cur;
      Tprev = Tcur;
    }
    return out;
  }

  function addCap(out, ringVertsStart, sides, centerPos, nrm, uCenter, vVal) {
    const cIdx = out.pos.length / 3;
    out.pos.push(centerPos.x, centerPos.y, centerPos.z);
    out.nrm.push(nrm.x, nrm.y, nrm.z);
    out.uv.push(uCenter, vVal);
    out.hue.push(out.currentHue);
    for (let s = 0; s < sides; s++) {
      const i0 = ringVertsStart + s;
      const i1 = ringVertsStart + ((s + 1) % sides);
      if (vVal < 0.5) out.idx.push(cIdx, i0, i1);
      else out.idx.push(cIdx, i1, i0);
    }
  }

  function extrudeTube(out, path, baseRadius, sides, twist, gnarl) {
    const ringCount = path.length;
    const ringStart = out.vertBase; // anchor for all indices

    // stable moving frame
    let Tprev = null,
      Nprev = null,
      Bprev = null;
    let rPrev = null; // for gentle radius change

    for (let i = 0; i < ringCount; i++) {
      const p = path[i];
      const pPrev = path[Math.max(0, i - 1)];
      const pNext = path[Math.min(ringCount - 1, i + 1)];

      // tangent
      const tx = pNext.x - pPrev.x,
        ty = pNext.y - pPrev.y,
        tz = pNext.z - pPrev.z;
      const tl = Math.hypot(tx, ty, tz) || 1.0;
      const T = { x: tx / tl, y: ty / tl, z: tz / tl };

      // parallel-transport N,B along the path
      let N, B;
      if (!Tprev) {
        const up =
          Math.abs(T.y) > 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
        B = norm(cross(T, up));
        N = norm(cross(B, T));
      } else {
        const axis = cross(Tprev, T);
        const axisLen = Math.hypot(axis.x, axis.y, axis.z);
        if (axisLen > 1e-7) {
          const a = {
            x: axis.x / axisLen,
            y: axis.y / axisLen,
            z: axis.z / axisLen,
          };
          const c = Math.max(-1.0, Math.min(1.0, dot(Tprev, T))); // cosθ
          const s = Math.sqrt(Math.max(0.0, 1.0 - c * c)); // sinθ
          N = rotateAroundAxis(Nprev, a, c, s);
          B = rotateAroundAxis(Bprev, a, c, s);
        } else {
          N = Nprev;
          B = Bprev;
        }
      }

      // --- Orthonormalize frame (kills drift) ---
      const tDotN = T.x * N.x + T.y * N.y + T.z * N.z;
      N = { x: N.x - T.x * tDotN, y: N.y - T.y * tDotN, z: N.z - T.z * tDotN };
      let nL = Math.hypot(N.x, N.y, N.z) || 1.0;
      N.x /= nL;
      N.y /= nL;
      N.z /= nL;
      B = {
        x: T.y * N.z - T.z * N.y,
        y: T.z * N.x - T.x * N.z,
        z: T.x * N.y - T.y * N.x,
      };

      Tprev = T;
      Nprev = N;
      Bprev = B;

      // radius & twist along length
      const t = ringCount > 1 ? i / (ringCount - 1) : 0.0;
      const rNoise =
        0.25 * Math.sin(12.0 * t + twist * 0.5) +
        0.15 * Math.sin(5.0 * t + twist * 1.3);
      let r = Math.max(
        0.008,
        baseRadius * (1.0 - Math.pow(t, 1.25)) * (0.85 + gnarl * 0.25 * rNoise)
      );

      // --- Gentle radius limiter (prevents spiky slices) ---
      if (rPrev != null) {
        const maxDelta = 0.45 * Math.max(baseRadius, rPrev); // ~45% step limit
        const lo = Math.max(0.008, rPrev - maxDelta);
        const hi = rPrev + maxDelta;
        r = Math.min(Math.max(r, lo), hi);
        r = 0.7 * r + 0.3 * rPrev; // small smoothing
      }
      rPrev = r;

      const theta0 = twist * t;

      // emit ring
      for (let s = 0; s < sides; s++) {
        const a = theta0 + (s / sides) * TAU;
        const ca = Math.cos(a),
          sa = Math.sin(a);
        const dx = N.x * ca + B.x * sa;
        const dy = N.y * ca + B.y * sa;
        const dz = N.z * ca + B.z * sa;

        out.pos.push(p.x + dx * r, p.y + dy * r, p.z + dz * r);
        out.nrm.push(dx, dy, dz);
        out.uv.push(s / sides, t);
        out.hue.push(out.currentHue);
      }
    }

    // --- side quads (index from ringStart, never from out.vertBase) ---
    for (let i = 0; i < ringCount - 1; i++) {
      const r0 = ringStart + i * sides;
      const r1 = ringStart + (i + 1) * sides;
      for (let s = 0; s < sides; s++) {
        const s0 = r0 + s;
        const s1 = r0 + ((s + 1) % sides);
        const s2 = r1 + s;
        const s3 = r1 + ((s + 1) % sides);
        out.idx.push(s0, s2, s1, s1, s2, s3);
      }
    }

    // --- caps ---
    const p0 = path[0],
      p1 = path[1];
    const pn = path[ringCount - 1],
      pn_1 = path[ringCount - 2];
    const t0 = { x: p1.x - p0.x, y: p1.y - p0.y, z: p1.z - p0.z };
    const tn = { x: pn.x - pn_1.x, y: pn.y - pn_1.y, z: pn.z - pn_1.z };
    const tl0 = Math.hypot(t0.x, t0.y, t0.z) || 1.0;
    t0.x /= tl0;
    t0.y /= tl0;
    t0.z /= tl0;
    const tln = Math.hypot(tn.x, tn.y, tn.z) || 1.0;
    tn.x /= tln;
    tn.y /= tln;
    tn.z /= tln;

    addCap(
      out,
      ringStart,
      sides,
      p0,
      { x: -t0.x, y: -t0.y, z: -t0.z },
      0.5,
      0.0
    );
    addCap(
      out,
      ringStart + (ringCount - 1) * sides,
      sides,
      pn,
      { x: tn.x, y: tn.y, z: tn.z },
      0.5,
      1.0
    );

    // advance by rings + 2 cap centers (prevents cross-tube “wings”)
    out.vertBase = ringStart + ringCount * sides + 2;
  }

  // -------- mesh builder (procedural)
  function buildMesh() {
    const pos = [],
      nrm = [],
      uv = [],
      hue = [],
      idx = [];
    const out = { pos, nrm, uv, hue, idx, vertBase: 0, currentHue: 0.0 };

    const SIDES = Math.max(10, Math.min(24, Math.round(6 + state.detail * 18)));

    for (let k = 0; k < state.pieces; k++) {
      const base = {
        x: rand(-TANK.xHalf + 0.2, TANK.xHalf - 0.2),
        y: rand(0.03, 0.06),
        z: rand(-TANK.zHalf + 0.2, TANK.zHalf - 0.2),
      };
      const yaw = rand(0, TAU);
      const dir = { x: Math.cos(yaw), y: 0.15, z: Math.sin(yaw) };

      const trunkSegs = Math.floor(
        rand(state.trunkSegs[0], state.trunkSegs[1])
      );
      const trunkStep = rand(state.trunkStep[0], state.trunkStep[1]);

      // Raw path -> resampled (bounded step & turn)
      const trunkRaw = makePath(
        base,
        dir,
        trunkSegs,
        trunkStep,
        state.upBias,
        state.gnarl
      );
      const trunk = resamplePath(trunkRaw, trunkStep * 0.5, 0.25); // ~20° max turn

      out.currentHue = rand(-0.5, 0.5);
      extrudeTube(
        out,
        trunk,
        rand(state.trunkRadius[0], state.trunkRadius[1]),
        SIDES,
        rand(-state.twist, state.twist),
        state.gnarl
      );

      const branches = Math.floor(
        rand(state.branches[0], state.branches[1] + 1)
      );
      for (let b = 0; b < branches; b++) {
        const at = Math.floor(rand(2, Math.max(3, trunk.length - 3)));
        const p = trunk[at];
        const yawB = yaw + rand(-1.2, 1.2);
        const dirB = {
          x: Math.cos(yawB),
          y: rand(0.0, 0.6),
          z: Math.sin(yawB),
        };
        const segsB = Math.floor(
          rand(state.branchSegs[0], state.branchSegs[1])
        );
        const stepB = trunkStep * rand(0.7, 0.95);

        const branchRaw = makePath(
          p,
          dirB,
          segsB,
          stepB,
          state.upBias * 0.6,
          state.gnarl
        );
        const branch = resamplePath(branchRaw, stepB * 0.5, 0.25);

        extrudeTube(
          out,
          branch,
          rand(state.branchRadius[0], state.branchRadius[1]),
          SIDES,
          rand(-state.twist, state.twist),
          state.gnarl
        );
      }
    }

    // --- upload
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    function vbo(data, loc, comps) {
      const b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, comps, gl.FLOAT, false, 0, 0);
      return b;
    }
    vbo(pos, 0, 3);
    vbo(nrm, 1, 3);
    vbo(uv, 2, 2);
    vbo(hue, 3, 1);

    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);

    // Pick an index type that’s always supported on this device
    const hasUint32 =
      gl instanceof WebGL2RenderingContext ||
      !!gl.getExtension("OES_element_index_uint");
    let indexType = hasUint32 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;

    // If we don't have uint32 but the mesh would exceed 16-bit indices, reduce detail and rebuild once.
    const vertCount = pos.length / 3;
    if (!hasUint32 && vertCount > 65535) {
      console.warn(
        "[driftwood] Falling back to 16-bit indices → reducing detail"
      );
      state.detail = Math.max(0.2, state.detail * 0.7);
      state.pieces = Math.min(state.pieces, 2);
      state.trunkSegs = [
        Math.max(8, state.trunkSegs[0] - 2),
        Math.max(10, state.trunkSegs[1] - 2),
      ];
      state.branchSegs = [
        Math.max(4, state.branchSegs[0] - 2),
        Math.max(6, state.branchSegs[1] - 2),
      ];
      return buildMesh(); // rebuild once with lower detail
    }

    const indexArray = hasUint32 ? new Uint32Array(idx) : new Uint16Array(idx);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indexArray, gl.STATIC_DRAW);

    return { vao, count: idx.length, indexType };
  }

  const prog = program(vs, fs, { a_pos: 0, a_nrm: 1, a_uv: 2, a_hue: 3 });

  // ---- procedural state (exposed to UI)
  const state = {
    pieces: 3,
    branches: [2, 4], // per piece (inclusive range)
    trunkSegs: [10, 16],
    branchSegs: [6, 11],
    trunkStep: [0.12, 0.18],
    trunkRadius: [0.06, 0.1],
    branchRadius: [0.035, 0.07],
    gnarl: 0.25, // jitter & knobbiness 0..1
    twist: 2.5, // max twist amount
    upBias: 0.18, // tendency to rise
    detail: 0.6, // 0..1 -> SIDES
    grainFreq: 28.0,
    grainMix: 0.45,
    colorWarm: 0.65,
  };

  let mesh = buildMesh();

  const U = (n) => gl.getUniformLocation(prog, n);
  const u_proj = U("u_proj"),
    u_view = U("u_view");
  const u_lightDir = U("u_lightDir"),
    u_ambient = U("u_ambient");
  const u_fogColor = U("u_fogColor"),
    u_fogNear = U("u_fogNear"),
    u_fogFar = U("u_fogFar");
  const u_grainFreq = U("u_grainFreq"),
    u_grainMix = U("u_grainMix"),
    u_colorWarm = U("u_colorWarm");
  const u_floorAmp = U("u_floorAmp"),
    u_floorScale = U("u_floorScale"),
    u_floorYOffset = U("u_floorYOffset");

  function regenerate() {
    mesh = buildMesh();
  }

  return {
    // --- setters for UI
    setPieces(n) {
      state.pieces = Math.max(1, n | 0);
    },
    setBranches(n) {
      state.branches = [Math.max(0, Math.floor(n * 0.5)), Math.max(1, n | 0)];
    },
    setGnarl(x) {
      state.gnarl = Math.max(0, Math.min(1, +x));
    },
    setTwist(x) {
      state.twist = 1.0 + 10.0 * +x;
    }, // slider 0..1 -> 1..11
    setDetail(x) {
      state.detail = Math.max(0, Math.min(1, +x));
    },
    setGrainFreq(f) {
      state.grainFreq = Math.max(10, +f);
    },
    setGrainMix(x) {
      state.grainMix = Math.max(0, Math.min(1, +x));
    },
    setWarm(x) {
      state.colorWarm = Math.max(0, Math.min(1, +x));
    },
    regenerate,

    draw(shared) {
      gl.useProgram(prog);
      gl.bindVertexArray(mesh.vao);

      gl.uniformMatrix4fv(u_proj, false, shared.proj);
      gl.uniformMatrix4fv(u_view, false, shared.view);

      gl.uniform3f(u_lightDir, -0.2, 1.0, 0.3);
      gl.uniform3f(u_ambient, 0.35, 0.4, 0.42);

      gl.uniform3f(
        u_fogColor,
        shared.fogColor[0],
        shared.fogColor[1],
        shared.fogColor[2]
      );
      gl.uniform1f(u_fogNear, shared.fogNear);
      gl.uniform1f(u_fogFar, shared.fogFar);

      gl.uniform1f(u_grainFreq, state.grainFreq);
      gl.uniform1f(u_grainMix, state.grainMix);
      gl.uniform1f(u_colorWarm, state.colorWarm);

      gl.uniform1f(u_floorAmp, shared.floorAmp ?? 0.18);
      gl.uniform1f(u_floorScale, shared.floorScale ?? 0.9);
      gl.uniform1f(u_floorYOffset, shared.floorYOffset ?? -0.03);

      gl.drawElements(gl.TRIANGLES, mesh.count, mesh.indexType, 0);
    },
  };
}
