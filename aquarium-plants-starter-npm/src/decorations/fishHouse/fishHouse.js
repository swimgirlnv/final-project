import { vs, fs } from "./fishHouseShaders";
import { registerObject, findValidPosition } from "../../sceneCollision.js";

export function createFishHouseLayer(gl) {
  function compile(type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS))
      throw new Error(gl.getShaderInfoLog(sh) || "Shader fail");
    return sh;
  }
  function program(vsSrc, fsSrc, bindings) {
    const p = gl.createProgram();
    const v = compile(gl.VERTEX_SHADER, vsSrc),
      f = compile(gl.FRAGMENT_SHADER, fsSrc);
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

  function makeHouse() {
    // Rounded tapered pineapple-like body and a crown of leaves.
    const pos = [];
    const norm = [];
    const uv = [];
    const idx = [];

    // body parameters
    const stacks = 20;
    const slices = 32;
    const height = 0.65;
    const y0 = 0.0; // bottom y
    const baseRadius = 0.24;

    // smoother bulgy profile: small at bottom/top, widest in the middle
    function radiusAt(t) {
      // t in [0,1]
      const s = Math.sin(Math.PI * t); // 0 -> 1 -> 0
      return baseRadius * (0.65 + 0.55 * s); // ~0.65R at ends, ~1.2R in middle
    }

    // build rings for body (surface of revolution)
    for (let i = 0; i <= stacks; i++) {
      const t = i / stacks;
      const y = y0 + t * height;
      const r = radiusAt(t);

      // estimate slope for normals
      const t2 = Math.min(1.0, t + 1.0 / stacks);
      const r2 = radiusAt(t2);
      const slope = (r2 - r) / (height / stacks);

      for (let j = 0; j <= slices; j++) {
        const u = j / slices;
        const a = u * Math.PI * 2.0;
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;

        pos.push(x, y, z);

        // normal: radial with vertical component from slope
        let nx = x;
        let ny = -slope;
        let nz = z;
        const len = Math.hypot(nx, ny, nz) || 1.0;
        nx /= len;
        ny /= len;
        nz /= len;
        norm.push(nx, ny, nz);

        // cylindrical UVs
        uv.push(u, t);
      }
    }

    // indices for body
    for (let i = 0; i < stacks; i++) {
      for (let j = 0; j < slices; j++) {
        const a = i * (slices + 1) + j;
        const b = a + slices + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }

    // --- crown leaves: central cluster, varied height/orientation ---

    const crownBaseY = y0 + height * 0.97;
    const crownRadius = radiusAt(0.9) * 0.3; // tighter cluster
    const leafCount = 12;
    const baseLeafLength = 0.4;

    for (let L = 0; L < leafCount; L++) {
      const phase = L / leafCount;
      const ang = phase * Math.PI * 2.0;

      // small jitter so leaves aren't perfectly even
      const jitter = 0.05 * Math.sin(phase * 13.0 + 0.7);
      const rLeaf = crownRadius * (1.0 + jitter);

      const cx = Math.cos(ang) * rLeaf;
      const cz = Math.sin(ang) * rLeaf;

      const baseIndex = pos.length / 3;

      // vary leaf length a bit
      const leafLength = baseLeafLength * (0.85 + 0.3 * Math.sin(phase * 11.0));

      // local points for a slightly curved leaf in its local Y/Z plane
      const a0 = [0.0, 0.0, 0.0];
      const a1 = [0.0, leafLength * 0.3, leafLength * 0.18];
      const a2 = [0.0, leafLength, 0.0];
      const a3 = [0.0, leafLength * 0.3, -leafLength * 0.18];

      const cosA = Math.cos(ang);
      const sinA = Math.sin(ang);

      function rot(x, y, z) {
        // tilt outward a bit as we go up the leaf
        const tilt = 0.18 * (y / leafLength);
        const xt = x + tilt;
        const wx = cx + cosA * xt - sinA * z;
        const wy = crownBaseY + y;
        const wz = cz + sinA * xt + cosA * z;
        return [wx, wy, wz];
      }

      const v0 = rot(a0[0], a0[1], a0[2]);
      const v1 = rot(a1[0], a1[1], a1[2]);
      const v2 = rot(a2[0], a2[1], a2[2]);
      const v3 = rot(a3[0], a3[1], a3[2]);

      pos.push(...v0, ...v1, ...v2, ...v3);

      // simple upward normals (vertex shader sway will still look fine)
      for (let k = 0; k < 4; k++) {
        norm.push(0.0, 1.0, 0.0);
      }

      // UVs for leaves (diamond-ish)
      uv.push(0.0, 0.0, 0.5, 0.3, 1.0, 1.0, 0.5, 0.3);

      idx.push(
        baseIndex + 0,
        baseIndex + 1,
        baseIndex + 2,
        baseIndex + 0,
        baseIndex + 2,
        baseIndex + 3
      );
    }

    return { pos, norm, uv, idx };
  }
  const mesh = makeHouse();

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  function bufAttribute(arr, loc, size) {
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    return b;
  }

  bufAttribute(mesh.pos, 0, 3);
  bufAttribute(mesh.norm, 1, 3);
  bufAttribute(mesh.uv, 2, 2);

  const ib = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
  gl.bufferData(
    gl.ELEMENT_ARRAY_BUFFER,
    new Uint16Array(mesh.idx),
    gl.STATIC_DRAW
  );

  const prog = program(vs, fs, { a_pos: 0, a_normal: 1, a_uv: 2 });

  const U = (n) => gl.getUniformLocation(prog, n);
  const u_proj = U("u_proj"),
    u_view = U("u_view"),
    u_model = U("u_model"),
    u_time = U("u_time");
  const u_fogColor = U("u_fogColor");
  const u_fogNear = U("u_fogNear");
  const u_fogFar = U("u_fogFar");

  // simple model transform state
  let model = new Float32Array([
    1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0.7, -0.02, -0.2, 1,
  ]);

  return {
    setPosition(x, y, z) {
      model[12] = x;
      model[13] = y;
      model[14] = z;
    },
    draw(shared) {
      // --- temporarily disable back-face culling for the house (body + leaves) ---
      const cullWasOn = gl.isEnabled(gl.CULL_FACE);
      if (cullWasOn) gl.disable(gl.CULL_FACE);

      gl.useProgram(prog);
      gl.bindVertexArray(vao);
      gl.uniformMatrix4fv(u_proj, false, shared.proj);
      gl.uniformMatrix4fv(u_view, false, shared.view);
      gl.uniformMatrix4fv(u_model, false, model);
      gl.uniform1f(u_time, shared.time);
      gl.uniform3f(
        u_fogColor,
        shared.fogColor[0],
        shared.fogColor[1],
        shared.fogColor[2]
      );
      gl.uniform1f(u_fogNear, shared.fogNear);
      gl.uniform1f(u_fogFar, shared.fogFar);

      gl.drawElements(gl.TRIANGLES, mesh.idx.length, gl.UNSIGNED_SHORT, 0);

      if (cullWasOn) gl.enable(gl.CULL_FACE);
    },
  };
}
