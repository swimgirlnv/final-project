import { vs, fs } from "./shellsShaders.js";
import { TANK_X_HALF, TANK_Z_HALF } from "../../tank/tankFloor.js";

const MAX_SCALLOPS = 8;
const MAX_AUGERS   = 4;
const MAX_MOONS    = 4;

// --- GL helpers -----------------------------------------------------------
function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(sh) || "shell shader fail");
  }
  return sh;
}
function makeProgram(gl, vsSrc, fsSrc, bindings) {
  const p = gl.createProgram();
  const v = compile(gl, gl.VERTEX_SHADER, vsSrc);
  const f = compile(gl, gl.FRAGMENT_SHADER, fsSrc);
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  for (const [name, loc] of Object.entries(bindings)) {
    gl.bindAttribLocation(p, loc, name);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(p) || "shell link fail");
  }
  gl.deleteShader(v);
  gl.deleteShader(f);
  return p;
}

function makeMesh(gl, positions, normals, uvs, indices) {
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

  vbuf(positions, 0, 3); // a_pos
  vbuf(normals,   1, 3); // a_normal
  vbuf(uvs,       2, 2); // a_uv

  const ib = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
  gl.bufferData(
    gl.ELEMENT_ARRAY_BUFFER,
    new Uint16Array(indices),
    gl.STATIC_DRAW
  );

  return { vao, count: indices.length };
}

// --- Geometry: scallop fan shell -----------------------------------------
function makeScallopMesh(gl, stacks = 12, slices = 20) {
  const pos = [];
  const norm = [];
  const uv = [];
  const idx = [];

  for (let i = 0; i <= stacks; i++) {
    const v = i / stacks;      // hinge(0) -> rim(1)
    const r = v;

    // gentle dome height
    const height = 0.08 * (1 - Math.cos(v * Math.PI));

    for (let j = 0; j <= slices; j++) {
      const u = j / slices;    // left-right
      const angle = (u - 0.5) * Math.PI; // -pi/2..pi/2

      const x = r * Math.sin(angle);
      const z = r * Math.cos(angle);

      pos.push(x, height, z);

      // approximate normal from position (slightly lifted)
      let nx = x;
      let ny = height * 2.0;
      let nz = z;
      const len = Math.hypot(nx, ny, nz) || 1.0;
      nx /= len; ny /= len; nz /= len;
      norm.push(nx, ny, nz);

      uv.push(u, v);
    }
  }

  const stride = slices + 1;
  for (let i = 0; i < stacks; i++) {
    for (let j = 0; j < slices; j++) {
      const a = i * stride + j;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }

  return makeMesh(gl, pos, norm, uv, idx);
}

// --- Geometry: long tapered spiral-ish shell ------------------------------
function makeAugerMesh(gl, stacks = 18, slices = 16) {
  const pos = [];
  const norm = [];
  const uv = [];
  const idx = [];

  const baseR = 0.35;

  for (let i = 0; i <= stacks; i++) {
    const v = i / stacks;      // 0 base, 1 tip
    const y = v;
    const radius = baseR * (1 - v) + 0.05;

    for (let j = 0; j <= slices; j++) {
      const u = j / slices;
      const angle = u * Math.PI * 2.0;

      const x = radius * Math.cos(angle);
      const z = radius * Math.sin(angle);

      pos.push(x, y, z);

      // normals mostly radial with slight upward bias
      let nx = Math.cos(angle);
      let ny = 0.25;
      let nz = Math.sin(angle);
      const len = Math.hypot(nx, ny, nz) || 1.0;
      nx /= len; ny /= len; nz /= len;
      norm.push(nx, ny, nz);

      uv.push(u, v);
    }
  }

  const stride = slices + 1;
  for (let i = 0; i < stacks; i++) {
    for (let j = 0; j < slices; j++) {
      const a = i * stride + j;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }

  return makeMesh(gl, pos, norm, uv, idx);
}

// --- Geometry: round “moon” shell (hemisphere cap) ------------------------
function makeMoonMesh(gl, stacks = 14, slices = 22) {
  const pos = [];
  const norm = [];
  const uv = [];
  const idx = [];

  for (let i = 0; i <= stacks; i++) {
    const v = i / stacks;              // bottom edge -> apex
    const theta = v * (Math.PI * 0.9); // mostly hemisphere

    const y = Math.cos(theta);         // -1..1
    const r = Math.sin(theta);

    for (let j = 0; j <= slices; j++) {
      const u = j / slices;
      const phi = u * Math.PI * 2.0;

      const x = r * Math.cos(phi);
      const z = r * Math.sin(phi);

      // shift so it sits nicely on sand: slightly flattened bottom
      const yy = (y + 1.0) * 0.25; // 0..0.5
      pos.push(x * 0.95, yy, z * 0.95);

      let nx = x;
      let ny = y;
      let nz = z;
      const len = Math.hypot(nx, ny, nz) || 1.0;
      nx /= len; ny /= len; nz /= len;
      norm.push(nx, ny, nz);

      uv.push(u, v);
    }
  }

  const stride = slices + 1;
  for (let i = 0; i < stacks; i++) {
    for (let j = 0; j < slices; j++) {
      const a = i * stride + j;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }

  return makeMesh(gl, pos, norm, uv, idx);
}

// --- Instanced attributes --------------------------------------------------
function makeInstBuffers(gl, maxCount) {
  function mk(loc, comps) {
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, maxCount * comps * 4, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, comps, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(loc, 1);
    return b;
  }
  return {
    offset: mk(3, 3), // i_offset
    scale:  mk(4, 1), // i_scale
    hue:    mk(5, 1), // i_hue
    count:  0,
    update(gl, offsets, scales, hues, count) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.offset);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, offsets);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.scale);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, scales);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.hue);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, hues);
      this.count = count;
    },
  };
}

// ---------------------------------------------------------------------------

export function createShellLayer(gl) {
  const prog = makeProgram(gl, vs, fs, {
    a_pos:    0,
    a_normal: 1,
    a_uv:     2,
    i_offset: 3,
    i_scale:  4,
    i_hue:    5,
  });

  const scallopMesh = makeScallopMesh(gl);
  const augerMesh   = makeAugerMesh(gl);
  const moonMesh    = makeMoonMesh(gl);

  gl.bindVertexArray(scallopMesh.vao);
  const instScallop = makeInstBuffers(gl, MAX_SCALLOPS);
  gl.bindVertexArray(augerMesh.vao);
  const instAuger   = makeInstBuffers(gl, MAX_AUGERS);
  gl.bindVertexArray(moonMesh.vao);
  const instMoon    = makeInstBuffers(gl, MAX_MOONS);

  const U = (n) => gl.getUniformLocation(prog, n);
  const u_proj     = U("u_proj");
  const u_view     = U("u_view");
  const u_time     = U("u_time");
  const u_fogColor = U("u_fogColor");
  const u_fogNear  = U("u_fogNear");
  const u_fogFar   = U("u_fogFar");
  const u_kind     = U("u_kind");

  // ---- place a little cluster of shells near the front of the tank -------
  function initInstances() {
    const y = -0.02; // slightly buried into sand

    // fan scallops (two or three)
    {
      const shells = [
        { x: -0.28, z: -TANK_Z_HALF * 0.55, s: 0.16, hue: 0.03 },
        { x: -0.06, z: -TANK_Z_HALF * 0.58, s: 0.15, hue: 0.04 },
        { x: -0.18, z: -TANK_Z_HALF * 0.50, s: 0.14, hue: 0.02 },
      ];
      const count = shells.length;
      const offsets = new Float32Array(count * 3);
      const scales  = new Float32Array(count);
      const hues    = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        const s = shells[i];
        const j = i * 3;
        offsets[j]     = s.x;
        offsets[j + 1] = y;
        offsets[j + 2] = s.z;
        scales[i]      = s.s;
        hues[i]        = s.hue;
      }
      instScallop.update(gl, offsets, scales, hues, count);
    }

    // long auger shell
    {
      const shells = [
        { x: -0.45, z: -TANK_Z_HALF * 0.45, s: 0.20, hue: 0.08 },
      ];
      const count = shells.length;
      const offsets = new Float32Array(count * 3);
      const scales  = new Float32Array(count);
      const hues    = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        const s = shells[i];
        const j = i * 3;
        offsets[j]     = s.x;
        offsets[j + 1] = y;
        offsets[j + 2] = s.z;
        scales[i]      = s.s;
        hues[i]        = s.hue;
      }
      instAuger.update(gl, offsets, scales, hues, count);
    }

    // round moon shell
    {
      const shells = [
        { x: 0.18, z: -TANK_Z_HALF * 0.52, s: 0.22, hue: 0.10 },
      ];
      const count = shells.length;
      const offsets = new Float32Array(count * 3);
      const scales  = new Float32Array(count);
      const hues    = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        const s = shells[i];
        const j = i * 3;
        offsets[j]     = s.x;
        offsets[j + 1] = y;
        offsets[j + 2] = s.z;
        scales[i]      = s.s;
        hues[i]        = s.hue;
      }
      instMoon.update(gl, offsets, scales, hues, count);
    }
  }

  initInstances();

  function drawType(mesh, inst, kind, shared) {
    if (inst.count === 0) return;
    gl.bindVertexArray(mesh.vao);
    gl.uniform1f(u_kind, kind);
    gl.drawElementsInstanced(
      gl.TRIANGLES,
      mesh.count,
      gl.UNSIGNED_SHORT,
      0,
      inst.count
    );
  }

  function draw(shared) {
    gl.useProgram(prog);

    gl.uniformMatrix4fv(u_proj, false, shared.proj);
    gl.uniformMatrix4fv(u_view, false, shared.view);
    gl.uniform1f(u_time, shared.time);
    gl.uniform3f(
      u_fogColor,
      shared.fogColor[0],
      shared.fogColor[1],
      shared.fogColor[2]
    );
    gl.uniform1f(u_fogNear, shared.fogNear);
    gl.uniform1f(u_fogFar,  shared.fogFar);

    drawType(scallopMesh, instScallop, 0.0, shared);
    drawType(augerMesh,   instAuger,   1.0, shared);
    drawType(moonMesh,    instMoon,    2.0, shared);
  }

  return {
    draw,
    _instScallop: instScallop,
    _instAuger:   instAuger,
    _instMoon:    instMoon,
  };
}