// tank/glass.js
import { vs, fs } from "./glassShaders.js";
import { TANK_X_HALF, TANK_Z_HALF, TANK_HEIGHT, SAND_DEPTH } from "./tankFloor.js";
import { makeSandUniforms } from "./sandHeight.js";

export function createTankGlassLayer(gl) {
  function compile(type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(sh) || "glass shader fail");
    }
    return sh;
  }

  function program(vsSrc, fsSrc, bindings) {
    const p = gl.createProgram();
    const v = compile(gl.VERTEX_SHADER, vsSrc);
    const f = compile(gl.FRAGMENT_SHADER, fsSrc);
    gl.attachShader(p, v);
    gl.attachShader(p, f);
    for (const [name, loc] of Object.entries(bindings)) {
      gl.bindAttribLocation(p, loc, name);
    }
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(p) || "glass link fail");
    }
    gl.deleteShader(v);
    gl.deleteShader(f);
    return p;
  }

  function makeWalls() {
    const pos = [];
    const norm = [];
    const idx = [];
    const faces = []; // {offsetBytes, count}

    let indexCursor = 0;

    // Wall from (xA,zA) to (xB,zB), split along its length so the
    // bottom edge can follow the sand. Bottom vertices use y = -1 as a marker.
    function addWall(xA, zA, xB, zB, nx, ny, nz) {
      const base = pos.length / 3;
      const len = Math.hypot(xB - xA, zB - zA);
      const segs = Math.max(1, Math.min(200, Math.ceil(len / 0.05)));

      for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        const x = xA + (xB - xA) * t;
        const z = zA + (zB - zA) * t;
        pos.push(x, -1.0, z, x, yTop, z);
        norm.push(nx, ny, nz, nx, ny, nz);
      }

      for (let i = 0; i < segs; i++) {
        const a = base + i * 2;
        idx.push(a, a + 2, a + 3, a, a + 3, a + 1);
      }

      faces.push({
        offsetBytes: indexCursor * 2, // UNSIGNED_SHORT indices → 2 bytes each
        count: segs * 6,
      });
      indexCursor += segs * 6;
    }

    const x0 = -TANK_X_HALF;
    const x1 =  TANK_X_HALF;
    const z0 = -TANK_Z_HALF;
    const z1 =  TANK_Z_HALF;

    // Bottom follows the sand in the shader, top sits slightly above the water
    const yBottom = -0.2; // used for the colour gradient only
    const yTop    = TANK_HEIGHT + 0.12;

    // Order: front(+Z), back(-Z), right(+X), left(-X)
    addWall(x0, z1, x1, z1, 0, 0, 1);
    addWall(x1, z0, x0, z0, 0, 0, -1);
    addWall(x1, z1, x1, z0, 1, 0, 0);
    addWall(x0, z0, x0, z1, -1, 0, 0);

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

    const posBuf = vbuf(pos, 0, 3);   // a_pos
    const normBuf = vbuf(norm, 1, 3); // a_normal

    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(
      gl.ELEMENT_ARRAY_BUFFER,
      new Uint16Array(idx),
      gl.STATIC_DRAW
    );

    return { vao, buffers: [posBuf, normBuf, ib], faces, yBottom, yTop };
  }

  const prog = program(vs, fs, {
    a_pos:    0,
    a_normal: 1,
  });

  let walls = makeWalls();
  const setSandUniforms = makeSandUniforms(gl, prog);

  const U = (n) => gl.getUniformLocation(prog, n);
  const u_proj       = U("u_proj");
  const u_view       = U("u_view");
  const u_glassColor = U("u_glassColor");
  const u_alpha      = U("u_alpha");
  const u_fogColor   = U("u_fogColor");
  const u_fogNear    = U("u_fogNear");
  const u_fogFar     = U("u_fogFar");
  const u_yMin       = U("u_yMin");
  const u_yMax       = U("u_yMax");
  const u_sandDepth  = U("u_sandDepth");
  const u_bright     = U("u_bright");

  // nice soft blue-grey glass
  const state = {
    color: [0.55, 0.72, 0.86],
    alpha: 0.27,
  };

  return {
    regenerate() {
      gl.deleteVertexArray(walls.vao);
      walls.buffers.forEach((b) => gl.deleteBuffer(b));
      walls = makeWalls();
    },

    draw(shared) {
      gl.useProgram(prog);
      gl.bindVertexArray(walls.vao);

      // --- decide which sides to draw, based on camera position ----
      const cam = shared.camPos || [0, 0, 5];

      // Distances from camera to each outside plane
      const dFront = cam[2] - TANK_Z_HALF;   // +Z
      const dBack  = -TANK_Z_HALF - cam[2];  // -Z
      const dRight = cam[0] - TANK_X_HALF;   // +X
      const dLeft  = -TANK_X_HALF - cam[0];  // -X

      // 0=front,1=back,2=right,3=left
      // Hide every wall the camera is outside of. A wall only switches when the
      // camera crosses its plane, where it is seen edge on, so the change is invisible.
      const show = [true, true, true, true];

      [dFront, dBack, dRight, dLeft].forEach((d, i) => {
        if (d > 0) show[i] = false;
      });

      // --- GL state for translucent glass --------------------------
      const hadBlend = gl.isEnabled(gl.BLEND);
      const hadCull  = gl.isEnabled(gl.CULL_FACE);
      const prevDepthMask = gl.getParameter(gl.DEPTH_WRITEMASK);

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      if (hadCull) gl.disable(gl.CULL_FACE);
      gl.depthMask(false);

      // uniforms common to all faces
      gl.uniformMatrix4fv(u_proj, false, shared.proj);
      gl.uniformMatrix4fv(u_view, false, shared.view);
      setSandUniforms(shared);
      gl.uniform1f(u_sandDepth, SAND_DEPTH);
      gl.uniform1f(u_bright, shared.sceneBright ?? 1.0);

      gl.uniform3f(
        u_glassColor,
        state.color[0],
        state.color[1],
        state.color[2]
      );
      gl.uniform1f(u_alpha, state.alpha);

      gl.uniform3f(
        u_fogColor,
        shared.fogColor[0],
        shared.fogColor[1],
        shared.fogColor[2]
      );
      gl.uniform1f(u_fogNear, shared.fogNear);
      gl.uniform1f(u_fogFar,  shared.fogFar);

      gl.uniform1f(u_yMin, walls.yBottom);
      gl.uniform1f(u_yMax, walls.yTop);

      // draw visible faces
      for (let i = 0; i < walls.faces.length; i++) {
        if (!show[i]) continue;
        const f = walls.faces[i];
        gl.drawElements(
          gl.TRIANGLES,
          f.count,
          gl.UNSIGNED_SHORT,
          f.offsetBytes
        );
      }

      // restore GL state
      gl.depthMask(prevDepthMask);
      if (!hadBlend) gl.disable(gl.BLEND);
      if (hadCull) gl.enable(gl.CULL_FACE);
    },
  };
}