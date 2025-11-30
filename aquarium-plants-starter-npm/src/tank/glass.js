// tank/glass.js
import { vs, fs } from "./glassShaders.js";
import { TANK_X_HALF, TANK_Z_HALF, TANK_HEIGHT } from "./tankFloor.js";

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

    function addWall(
      x0, y0, z0,
      x1, y1, z1,
      x2, y2, z2,
      x3, y3, z3,
      nx, ny, nz
    ) {
      const base = pos.length / 3;

      pos.push(
        x0, y0, z0,
        x1, y1, z1,
        x2, y2, z2,
        x3, y3, z3
      );

      for (let i = 0; i < 4; i++) {
        norm.push(nx, ny, nz);
      }

      idx.push(
        base, base + 1, base + 2,
        base, base + 2, base + 3
      );

      faces.push({
        offsetBytes: indexCursor * 2, // UNSIGNED_SHORT indices → 2 bytes each
        count: 6,
      });
      indexCursor += 6;
    }

    const x0 = -TANK_X_HALF;
    const x1 =  TANK_X_HALF;
    const z0 = -TANK_Z_HALF;
    const z1 =  TANK_Z_HALF;

    // Slightly below floor & slightly above water for nicer look
    const yBottom = -0.10;
    const yTop    = TANK_HEIGHT + 0.12;

    // Order: front(+Z), back(-Z), right(+X), left(-X)
    // front
    addWall(
      x0, yBottom, z1,
      x1, yBottom, z1,
      x1, yTop,    z1,
      x0, yTop,    z1,
      0, 0, 1
    );
    // back
    addWall(
      x1, yBottom, z0,
      x0, yBottom, z0,
      x0, yTop,    z0,
      x1, yTop,    z0,
      0, 0,-1
    );
    // right
    addWall(
      x1, yBottom, z1,
      x1, yBottom, z0,
      x1, yTop,    z0,
      x1, yTop,    z1,
      1, 0, 0
    );
    // left
    addWall(
      x0, yBottom, z0,
      x0, yBottom, z1,
      x0, yTop,    z1,
      x0, yTop,    z0,
      -1, 0, 0
    );

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

    vbuf(pos, 0, 3);   // a_pos
    vbuf(norm, 1, 3);  // a_normal

    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(
      gl.ELEMENT_ARRAY_BUFFER,
      new Uint16Array(idx),
      gl.STATIC_DRAW
    );

    return { vao, faces, yBottom, yTop };
  }

  const prog = program(vs, fs, {
    a_pos:    0,
    a_normal: 1,
  });

  const walls = makeWalls();

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

  // nice soft blue-grey glass
  const state = {
    color: [0.55, 0.72, 0.86],
    alpha: 0.27,
  };

  return {
    draw(shared) {
      gl.useProgram(prog);
      gl.bindVertexArray(walls.vao);

      // --- decide which sides to draw, based on camera position ----
      const cam = shared.camPos || [0, 0, 5];

      const margin = 0.05;
      const above = cam[1] > TANK_HEIGHT + 0.12;

      // Distances from camera to each outside plane
      const dFront = cam[2] - TANK_Z_HALF;   // +Z
      const dBack  = -TANK_Z_HALF - cam[2];  // -Z
      const dRight = cam[0] - TANK_X_HALF;   // +X
      const dLeft  = -TANK_X_HALF - cam[0];  // -X

      // 0=front,1=back,2=right,3=left
      const show = [true, true, true, true];

      if (!above) {
        let nearest = -1;
        let nearestDist = 1e9;

        function consider(dist, id) {
          if (dist > margin && dist < nearestDist) {
            nearestDist = dist;
            nearest = id;
          }
        }
        consider(dFront, 0);
        consider(dBack,  1);
        consider(dRight, 2);
        consider(dLeft,  3);

        if (nearest >= 0) {
          show[nearest] = false; // hide only the nearest side
        }
      }

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