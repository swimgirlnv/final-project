// tankFloor.js
import { vs, fs } from "./tankFloorShaders.js";

// Single source of truth for tank size
export let TANK_X_HALF = 2.6;
export let TANK_Z_HALF = 2.2;
export const TANK_HEIGHT = 1.8;  // Fixed height of the tank
const SAND_DEPTH = 0.15;

// Function to update tank dimensions
export function setTankSize(scale) {
  // Base size at scale=50: 2.6 x 2.2
  // Scale from 1.0 to 100.0
  const factor = scale / 50.0;
  TANK_X_HALF = 2.6 * factor;
  TANK_Z_HALF = 2.2 * factor;
}

export function createFloorLayer(gl) {
  function comp(type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(sh) || "floor shader compile fail");
    }
    return sh;
  }

  function prog(vsSrc, fsSrc) {
    const p = gl.createProgram();
    gl.attachShader(p, comp(gl.VERTEX_SHADER, vsSrc));
    gl.attachShader(p, comp(gl.FRAGMENT_SHADER, fsSrc));
    gl.bindAttribLocation(p, 0, "a_pos");
    gl.bindAttribLocation(p, 1, "a_face");
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(p) || "floor link fail");
    }
    return p;
  }

  const P = prog(vs, fs);
  const U = (n) => gl.getUniformLocation(P, n);

  let vao, ib, indexCount;

  function buildMesh() {
    const xHalf = TANK_X_HALF;
    const zHalf = TANK_Z_HALF;

    // keep your nice resolution
    const NX = 200;
    const NZ = 160;

    const pos = [];
    const face = []; // 0 = top, 1 = side, 2 = bottom
    const idx = [];

    // ---------- TOP GRID (face=0) ----------
    const topOffset = pos.length / 3;
    for (let j = 0; j <= NZ; j++) {
      const z = -zHalf + (2 * zHalf) * (j / NZ);
      for (let i = 0; i <= NX; i++) {
        const x = -xHalf + (2 * xHalf) * (i / NX);
        pos.push(x, 1.0, z); // y is a dummy for top; real height from noise
        face.push(0.0);
      }
    }
    for (let j = 0; j < NZ; j++) {
      for (let i = 0; i < NX; i++) {
        const a = topOffset + j * (NX + 1) + i;
        const b = a + 1;
        const c = a + (NX + 1);
        const d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }

    // ---------- BOTTOM GRID (face=2) ----------
    const bottomOffset = pos.length / 3;
    for (let j = 0; j <= NZ; j++) {
      const z = -zHalf + (2 * zHalf) * (j / NZ);
      for (let i = 0; i <= NX; i++) {
        const x = -xHalf + (2 * xHalf) * (i / NX);
        pos.push(x, 0.0, z); // y not used; bottom height computed in shader
        face.push(2.0);
      }
    }
    for (let j = 0; j < NZ; j++) {
      for (let i = 0; i < NX; i++) {
        const a = bottomOffset + j * (NX + 1) + i;
        const b = a + 1;
        const c = a + (NX + 1);
        const d = c + 1;
        // reversed winding so normal faces downward
        idx.push(a, b, c, b, d, c);
      }
    }

    // ---------- SIDES (face=1) ----------
    function pushSide(x0, z0, x1, z1, segments) {
      const base = pos.length / 3;
      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const x = x0 + (x1 - x0) * t;
        const z = z0 + (z1 - z0) * t;

        // top edge vertex (tSide = 1)
        pos.push(x, 1.0, z);
        face.push(1.0);

        // bottom edge vertex (tSide = 0)
        pos.push(x, 0.0, z);
        face.push(1.0);
      }
      for (let i = 0; i < segments; i++) {
        const a = base + i * 2;
        const b = a + 2;
        const c = a + 1;
        const d = b + 1;
        idx.push(a, c, b, b, c, d);
      }
    }

    const SIDE_SEG_X = NX;
    const SIDE_SEG_Z = NZ;

    // +Z edge
    pushSide(-xHalf, zHalf, xHalf, zHalf, SIDE_SEG_X);
    // -Z edge
    pushSide(xHalf, -zHalf, -xHalf, -zHalf, SIDE_SEG_X);
    // +X edge
    pushSide(xHalf, zHalf, xHalf, -zHalf, SIDE_SEG_Z);
    // -X edge
    pushSide(-xHalf, -zHalf, -xHalf, zHalf, SIDE_SEG_Z);

    // ---- upload to GL -----------------------------------------------------
    if (vao) {
      gl.deleteVertexArray(vao);
    }
    vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    // positions
    const vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pos), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

    // face flags
    const fb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, fb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(face), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 0, 0);

    if (ib) {
      gl.deleteBuffer(ib);
    }
    ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(idx), gl.STATIC_DRAW);

    indexCount = idx.length;
  }

  // Initial build
  buildMesh();

  // state (defaults)
  const state = {
    amp: 0.18, // macro height amplitude
    scale: 0.90, // macro dune frequency
    gravelMix: 0.0, // 0 sand .. 1 gravel
    gravelScale: 7.0, // pebble density
    gravelBump: 0.02, // 0..0.06 good
    palette: 0, // 0 sand, 1 grey, 2 rainbow
    sandA: [0.78, 0.72, 0.58],
    sandB: [0.90, 0.86, 0.74],
    fogColor: [0.02, 0.07, 0.13],
    fogNear: 3.0, // slightly farther now that tank is bigger
    fogFar: 7.0,
    fogStrength: 0.55,
    fogBias: 0.12,
  };

  return {
    // for driftwood "buried" effect
    getParams() {
      return { amp: state.amp, scale: state.scale, yOffset: -0.03 };
    },

    // UI setters
    setFog(color, near, far) {
      state.fogColor = color;
      state.fogNear = near;
      state.fogFar = far;
    },
    setFloorFog(strength = 0.55, bias = 0.12) {
      state.fogStrength = strength;
      state.fogBias = bias;
    },
    setAmp(a) {
      state.amp = +a;
    },
    setScale(s) {
      state.scale = +s;
    },
    setGravelMix(x) {
      state.gravelMix = Math.max(0, Math.min(1, +x));
    },
    setGravelScale(x) {
      state.gravelScale = Math.max(1.0, +x);
    },
    setGravelBump(x) {
      state.gravelBump = Math.max(0.0, +x);
    },
    setPalette(name) {
      state.palette = name === "grey" ? 1 : name === "rainbow" ? 2 : 0;
    },

    regenerate() {
      buildMesh();
    },

    draw(shared) {
      gl.useProgram(P);
      gl.bindVertexArray(vao);

      gl.uniformMatrix4fv(U("u_proj"), false, shared.proj);
      gl.uniformMatrix4fv(U("u_view"), false, shared.view);
      gl.uniform1f(U("u_time"), shared.time);

      gl.uniform1f(U("u_amp"), state.amp);
      gl.uniform1f(U("u_scale"), state.scale);

      gl.uniform1f(U("u_gravelMix"), state.gravelMix);
      gl.uniform1f(U("u_gravelScale"), state.gravelScale);
      gl.uniform1f(U("u_gravelBump"), state.gravelBump);
      gl.uniform1i(U("u_palette"), state.palette);

      gl.uniform3f(U("u_sandA"), state.sandA[0], state.sandA[1], state.sandA[2]);
      gl.uniform3f(U("u_sandB"), state.sandB[0], state.sandB[1], state.sandB[2]);

      gl.uniform3f(
        U("u_fogColor"),
        state.fogColor[0],
        state.fogColor[1],
        state.fogColor[2]
      );
      gl.uniform1f(U("u_fogNear"), state.fogNear);
      gl.uniform1f(U("u_fogFar"), state.fogFar);
      gl.uniform1f(U("u_fogStrength"), state.fogStrength);
      gl.uniform1f(U("u_fogBias"), state.fogBias);

      // new uniforms for block behavior
      gl.uniform1f(U("u_sandDepth"), SAND_DEPTH);
      gl.uniform2f(U("u_tankHalf"), TANK_X_HALF, TANK_Z_HALF);

      gl.drawElements(gl.TRIANGLES, indexCount, gl.UNSIGNED_INT, 0);
    },
  };
}