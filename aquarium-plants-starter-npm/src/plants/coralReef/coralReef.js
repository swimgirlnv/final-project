// plants/coralReef.js
import { vs, fs } from "./coralReefShaders.js";
import { checkCollision2D, isInsideTank, registerObject } from "../../sceneCollision.js";
import { TANK_X_HALF, TANK_Z_HALF } from "../../tank/tankFloor.js";

export function createCoralReefLayer(gl) {
  // ---------- helpers ----------
  function compile(type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(sh) || "coral shader fail");
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
      throw new Error(gl.getProgramInfoLog(p) || "coral link fail");
    }
    gl.deleteShader(v);
    gl.deleteShader(f);
    return p;
  }

  // ---------- base coral mesh (lumpy squashed sphere) ----------
  function makeCoralMesh(stacks = 14, slices = 22) {
    const pos = [];
    const norm = [];
    const uv   = [];
    const idx  = [];

    for (let i = 0; i <= stacks; i++) {
      const v = i / stacks;
      const theta = v * Math.PI; // 0..pi

      // base radius profile: bulgy near equator, pinched at poles
      const baseR = Math.sin(theta);
      const bulge = 0.65 + 0.35 * Math.sin(theta * 2.0);
      const r = baseR * bulge;

      const y = Math.cos(theta); // -1..1

      for (let j = 0; j <= slices; j++) {
        const u = j / slices;
        const phi = u * Math.PI * 2.0;

        const x = Math.cos(phi) * r;
        const z = Math.sin(phi) * r;

        // slightly squashed vertically in model space
        const squashY = 0.75;
        pos.push(x, y * squashY, z);

        // approximate normals as from unsquashed sphere
        norm.push(
          Math.cos(phi) * baseR,
          y,
          Math.sin(phi) * baseR
        );

        uv.push(u, v);
      }
    }

    for (let i = 0; i < stacks; i++) {
      for (let j = 0; j < slices; j++) {
        const a = i * (slices + 1) + j;
        const b = a + 1;
        const c = a + (slices + 1);
        const d = c + 1;
        idx.push(a, c, b, b, c, d);
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

    vbuf(pos, 0, 3);   // a_pos
    vbuf(norm, 1, 3);  // a_normal
    vbuf(uv, 2, 2);    // a_uv

    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(
      gl.ELEMENT_ARRAY_BUFFER,
      new Uint16Array(idx),
      gl.STATIC_DRAW
    );

    return { vao, count: idx.length };
  }

  // ---------- instancing ----------
  function makeInstBufs(maxCount) {
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
      offset: mk(3, 3),   // vec3 i_offset
      scale:  mk(4, 2),   // vec2 i_scale (radius, heightScale)
      hue:    mk(5, 1),   // float i_hue
      wobble: mk(6, 1),   // float i_wobblePhase
      count:  0,
      update(data) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.offset);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(data.offset));
        gl.bindBuffer(gl.ARRAY_BUFFER, this.scale);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(data.scale));
        gl.bindBuffer(gl.ARRAY_BUFFER, this.hue);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(data.hue));
        gl.bindBuffer(gl.ARRAY_BUFFER, this.wobble);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(data.wobble));
        this.count = data.count;
      },
    };
  }

  const prog = program(vs, fs, {
    a_pos:     0,
    a_normal:  1,
    a_uv:      2,
    i_offset:  3,
    i_scale:   4,
    i_hue:     5,
    i_wobble:  6,
  });

  const coralMesh = makeCoralMesh(14, 22);
  gl.bindVertexArray(coralMesh.vao);
  const inst = makeInstBufs(256);

  const U = (n) => gl.getUniformLocation(prog, n);
  const u_proj     = U("u_proj");
  const u_view     = U("u_view");
  const u_time     = U("u_time");
  const u_fogColor = U("u_fogColor");
  const u_fogNear  = U("u_fogNear");
  const u_fogFar   = U("u_fogFar");

  // ---------- state & scattering ----------
  const state = {
    count: 22,             // number of coral heads
    minRadius: 0.12,
    maxRadius: 0.28,
  };

  function rand(a, b) {
    return a + Math.random() * (b - a);
  }

  function scatter() {
    const data = {
      offset: [],
      scale: [],
      hue: [],
      wobble: [],
      count: 0,
    };

    let attempts = 0;
    const MAX_ATTEMPTS = state.count * 20;

    while (data.count < state.count && attempts < MAX_ATTEMPTS) {
      attempts++;

      // bias towards the back half of the tank
      const x = rand(-TANK_X_HALF * 0.9, TANK_X_HALF * 0.9);
      const z = rand(-TANK_Z_HALF * 0.1, TANK_Z_HALF * 0.95);
      const r = rand(state.minRadius, state.maxRadius);
      const radiusForCollision = r * 1.3;

      if (!isInsideTank(x, z, radiusForCollision)) continue;
      if (checkCollision2D(x, z, radiusForCollision, 0.0)) continue;
      registerObject(x, z, radiusForCollision, "coral");

      const y = -0.02; // slightly buried into sand
      const heightScale = rand(0.8, 1.4);

      data.offset.push(x, y, z);
      data.scale.push(r, heightScale);
      data.hue.push(rand(0.02, 0.12) + Math.random() * 0.6); // colorful
      data.wobble.push(rand(0.0, 6.28318)); // random phase

      data.count++;
    }

    inst.update(data);
  }

  scatter();

  return {
    setCount(n) {
      state.count = Math.max(1, n | 0);
    },
    setMinRadius(r) {
      state.minRadius = Math.max(0.05, r);
    },
    setMaxRadius(r) {
      state.maxRadius = Math.max(state.minRadius, r);
    },
    regenerate: scatter,

        draw(shared) {
      if (inst.count === 0) return;

      gl.useProgram(prog);
      gl.bindVertexArray(coralMesh.vao);

      // --- disable back-face culling just for coral reef ---
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

      gl.drawElementsInstanced(
        gl.TRIANGLES,
        coralMesh.count,
        gl.UNSIGNED_SHORT,
        0,
        inst.count
      );

      // restore previous culling state
      if (hadCull) gl.enable(gl.CULL_FACE);
    },
  };
}