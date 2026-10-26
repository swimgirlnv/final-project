import { vs, fs } from "./fanShaders.js";
import { checkCollision2D, isInsideTank, registerObject, clearObjectsByType } from "../../sceneCollision.js";
import { TANK_X_HALF, TANK_Z_HALF } from "../../tank/tankFloor.js";
import { makeSandUniforms } from "../../tank/sandHeight.js";

export function createFanCoralLayer(gl) {
  function compile(type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(sh) || "fan coral shader fail");
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
      throw new Error(gl.getProgramInfoLog(p) || "fan coral link fail");
    }
    gl.deleteShader(v);
    gl.deleteShader(f);
    return p;
  }

  // ---------------------------------------------------------------------------
  // L-system → segments → quads
  // ---------------------------------------------------------------------------

  const state = {
    count: +document.getElementById("fanCount")?.value || 6, // how many separate fans
  };
  const ITER = 4;           // L-system iterations
  const BASE_SEG_LEN = 0.075;
  const FAN_HEIGHT = 0.55;  // used to normalize "height" attribute
  const SWAY_PAD = 0.05;    // extra room for the tip sway in the vertex shader

  function rand(a, b) {
    return a + Math.random() * (b - a);
  }

  function rewriteLSystem(iterations) {
    // Axiom
    let s = "F";

    for (let it = 0; it < iterations; it++) {
      let next = "";
      for (let k = 0; k < s.length; k++) {
        const ch = s[k];
        if (ch === "F") {
          const r = Math.random();
          if (r < 0.33) {
            // fork left
            next += "F[+F]F";
          } else if (r < 0.66) {
            // fork right
            next += "F[-F]F";
          } else {
            // both sides
            next += "F[+F][-F]";
          }
        } else {
          next += ch;
        }
      }
      s = next;
    }
    return s;
  }

  function addSegment(mesh, x0, y0, z0, x1, y1, z1, depth, baseY, hue) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    if (len < 1e-5) return;

    const nx = -dy / len;
    const ny = dx / len;

    const width = 0.04 * Math.pow(0.72, depth);
    const hw = width * 0.5;

    const px = nx * hw;
    const py = ny * hw;

    const h0 = Math.max(
      0.0,
      Math.min(1.0, (y0 - baseY) / FAN_HEIGHT)
    );
    const h1 = Math.max(
      0.0,
      Math.min(1.0, (y1 - baseY) / FAN_HEIGHT)
    );

    const baseIndex = mesh.pos.length / 3;

    // 4 verts: p0+, p0-, p1-, p1+
    mesh.pos.push(
      x0 + px, y0 + py, z0,
      x0 - px, y0 - py, z0,
      x1 - px, y1 - py, z1,
      x1 + px, y1 + py, z1
    );

    // normals: pointing "front" (0,0,1) – we disable culling so ok
    for (let i = 0; i < 4; i++) {
      mesh.norm.push(0, 0, 1);
      mesh.hue.push(hue);
    }

    mesh.height.push(h0, h0, h1, h1);

    mesh.idx.push(
      baseIndex, baseIndex + 1, baseIndex + 2,
      baseIndex, baseIndex + 2, baseIndex + 3
    );
  }

  function addFan(mesh, baseX, baseY, baseZ, hue) {
    const str = rewriteLSystem(ITER);

    let angle = 1.25 + rand(-0.25, 0.25); // ~straight up with a little lean
    const stack = [];

    // depth = stack size
    let x = baseX;
    let y = baseY;
    let z = baseZ;

    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (ch === "F") {
        const depth = stack.length;
        const segLen = BASE_SEG_LEN * Math.pow(0.82, depth);
        const nx = Math.cos(angle);
        const ny = Math.sin(angle);
        const x1 = x + nx * segLen;
        const y1 = y + ny * segLen;
        const z1 = z;

        addSegment(mesh, x, y, z, x1, y1, z1, depth, baseY, hue);

        x = x1;
        y = y1;
      } else if (ch === "+") {
        angle += 0.40 + rand(-0.10, 0.10);
      } else if (ch === "-") {
        angle -= 0.40 + rand(-0.10, 0.10);
      } else if (ch === "[") {
        stack.push({ x, y, z, angle });
      } else if (ch === "]") {
        const st = stack.pop();
        if (st) {
          x = st.x;
          y = st.y;
          z = st.z;
          angle = st.angle;
        }
      }
    }
  }

  function emptyMesh() {
    return { pos: [], norm: [], height: [], hue: [], base: [], idx: [] };
  }

  // Warm reds, oranges and purples that stand out against the sand
  function pickHue() {
    const r = Math.random();
    if (r < 0.4) return rand(0.95, 1.03);
    if (r < 0.75) return rand(0.03, 0.08);
    return rand(0.78, 0.86);
  }

  // Copy a fan built at the origin into the scene, turned by yaw around its base
  function appendFan(mesh, local, baseX, baseY, baseZ, yaw) {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const offset = mesh.pos.length / 3;
    for (let i = 0; i < local.pos.length; i += 3) {
      const x = local.pos[i];
      mesh.pos.push(baseX + x * c, baseY + local.pos[i + 1], baseZ + x * s);
      mesh.norm.push(-s, 0, c);
      mesh.base.push(baseX, baseZ);
    }
    mesh.height.push(...local.height);
    mesh.hue.push(...local.hue);
    for (const i of local.idx) mesh.idx.push(offset + i);
  }

  function buildMesh() {
    // Clear only fan coral objects from collision registry
    clearObjectsByType("fanCoral");
    
    const mesh = emptyMesh();
    const fanRadius = 0.22; // footprint used against other objects

    for (let f = 0; f < state.count; f++) {
      const local = emptyMesh();
      addFan(local, 0, 0, 0, pickHue());

      // widest reach from the base, which is the footprint at any yaw
      let extent = 0;
      for (let i = 0; i < local.pos.length; i += 3) {
        extent = Math.max(extent, Math.abs(local.pos[i]));
      }
      extent += SWAY_PAD;

      for (let attempt = 0; attempt < 100; attempt++) {
        const baseX = rand(-TANK_X_HALF, TANK_X_HALF);
        const baseZ = rand(-TANK_Z_HALF, TANK_Z_HALF);

        if (!isInsideTank(baseX, baseZ, extent)) continue;
        if (checkCollision2D(baseX, baseZ, fanRadius, 0.0)) continue;
        registerObject(baseX, baseZ, fanRadius, "fanCoral");

        const baseY = -0.02; // just above sand
        appendFan(mesh, local, baseX, baseY, baseZ, rand(0, Math.PI * 2));
        break;
      }
    }

    return mesh;
  }

  let mesh = buildMesh();

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  let posBuffer, normBuffer, heightBuffer, hueBuffer, baseBuffer, indexBuffer;

  function rebuildBuffers() {
    function vbuf(data, loc, size, buffer) {
      const b = buffer || gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
      return b;
    }

    posBuffer = vbuf(mesh.pos, 0, 3, posBuffer);
    normBuffer = vbuf(mesh.norm, 1, 3, normBuffer);
    heightBuffer = vbuf(mesh.height, 2, 1, heightBuffer);
    hueBuffer = vbuf(mesh.hue, 3, 1, hueBuffer);
    baseBuffer = vbuf(mesh.base, 4, 2, baseBuffer);

    if (!indexBuffer) indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(
      gl.ELEMENT_ARRAY_BUFFER,
      new Uint16Array(mesh.idx),
      gl.STATIC_DRAW
    );
  }

  rebuildBuffers();

  const prog = program(vs, fs, {
    a_pos:    0,
    a_normal: 1,
    a_height: 2,
    a_hue:    3,
    a_base:   4,
  });

  const setSandUniforms = makeSandUniforms(gl, prog);
  const U = (n) => gl.getUniformLocation(prog, n);
  const u_proj     = U("u_proj");
  const u_view     = U("u_view");
  const u_time     = U("u_time");
  const u_fogColor = U("u_fogColor");
  const u_fogNear  = U("u_fogNear");
  const u_fogFar   = U("u_fogFar");

  return {
    setFanCount(n) {
      state.count = Math.max(0, n | 0);
    },
    
    regenerate() {
      mesh = buildMesh();
      gl.bindVertexArray(vao);
      rebuildBuffers();
    },

    draw(shared) {
      if (!mesh || !mesh.idx || !mesh.idx.length) return;

      gl.useProgram(prog);
      // tallest point of the fans, measured once per mesh
      if (mesh.top === undefined) {
        mesh.top = 0;
        for (let i = 1; i < mesh.pos.length; i += 3) mesh.top = Math.max(mesh.top, mesh.pos[i]);
      }
      setSandUniforms(shared, mesh.top);
      gl.bindVertexArray(vao);

      // make fan visible from both sides
      const hadCull = gl.isEnabled(gl.CULL_FACE);
      if (hadCull) gl.disable(gl.CULL_FACE);

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

      gl.drawElements(gl.TRIANGLES, mesh.idx.length, gl.UNSIGNED_SHORT, 0);

      if (hadCull) gl.enable(gl.CULL_FACE);
    },
  };
}