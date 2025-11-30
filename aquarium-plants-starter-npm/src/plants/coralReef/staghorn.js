import { vs, fs } from "./staghornShaders.js";
import { checkCollision2D, isInsideTank, registerObject } from "../../sceneCollision.js";
import { TANK_X_HALF, TANK_Z_HALF } from "../../tank/tankFloor.js";

export function createStaghornCoralLayer(gl) {
  function compile(type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(sh) || "staghorn shader fail");
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
      throw new Error(gl.getProgramInfoLog(p) || "staghorn link fail");
    }
    gl.deleteShader(v);
    gl.deleteShader(f);
    return p;
  }

  // Low-poly cylinder (axis along +Y, radius≈1)
  function makeCylinder(stacks = 6, slices = 12) {
    const pos = [];
    const norm = [];
    const uv = [];
    const idx = [];

    for (let i = 0; i <= stacks; i++) {
      const v = i / stacks;
      const y = v; // 0..1
      for (let j = 0; j <= slices; j++) {
        const u = j / slices;
        const phi = u * Math.PI * 2.0;
        const x = Math.cos(phi);
        const z = Math.sin(phi);
        pos.push(x, y, z);
        norm.push(x, 0, z);
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

  function makeInstBufs(max) {
    function mk(loc, comps) {
      const b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, max * comps * 4, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, comps, gl.FLOAT, false, 0, 0);
      gl.vertexAttribDivisor(loc, 1);
      return b;
    }
    return {
      base:   mk(3, 3), // vec3 i_base
      axis:   mk(4, 3), // vec3 i_axis (direction * length)
      radius: mk(5, 1), // float i_radius
      hue:    mk(6, 1), // float i_hue
      phase:  mk(7, 1), // float i_phase
      count:  0,
      update(data) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.base);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(data.base));
        gl.bindBuffer(gl.ARRAY_BUFFER, this.axis);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(data.axis));
        gl.bindBuffer(gl.ARRAY_BUFFER, this.radius);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(data.radius));
        gl.bindBuffer(gl.ARRAY_BUFFER, this.hue);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(data.hue));
        gl.bindBuffer(gl.ARRAY_BUFFER, this.phase);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(data.phase));
        this.count = data.count;
      },
    };
  }

  const prog = program(vs, fs, {
    a_pos: 0,
    a_normal: 1,
    a_uv: 2,
    i_base: 3,
    i_axis: 4,
    i_radius: 5,
    i_hue: 6,
    i_phase: 7,
  });

  const cyl = makeCylinder(6, 12);
  gl.bindVertexArray(cyl.vao);
  const inst = makeInstBufs(512);

  const U = (n) => gl.getUniformLocation(prog, n);
  const u_proj     = U("u_proj");
  const u_view     = U("u_view");
  const u_time     = U("u_time");
  const u_fogColor = U("u_fogColor");
  const u_fogNear  = U("u_fogNear");
  const u_fogFar   = U("u_fogFar");

  const state = {
    colonies: 6,
    branchesPerColony: 10,
    minLen: 0.25,
    maxLen: 0.6,
    minRad: 0.018,
    maxRad: 0.04,
  };

  function rand(a, b) {
    return a + Math.random() * (b - a);
  }

  function scatter() {
    const data = {
      base: [],
      axis: [],
      radius: [],
      hue: [],
      phase: [],
      count: 0,
    };

    const colonies = state.colonies;
    const colonyRadius = 0.18;

    let attempts = 0;
    const MAX_ATTEMPTS = colonies * 40;

    const colonyCenters = [];

    // place colony centers
    while (colonyCenters.length < colonies && attempts < MAX_ATTEMPTS) {
      attempts++;
      const cx = rand(-TANK_X_HALF * 0.85, TANK_X_HALF * 0.85);
      const cz = rand(-TANK_Z_HALF * 0.2, TANK_Z_HALF * 0.9);

      if (!isInsideTank(cx, cz, colonyRadius)) continue;
      if (checkCollision2D(cx, cz, colonyRadius, 0.0)) continue;
      registerObject(cx, cz, colonyRadius, "staghorn");

      colonyCenters.push({ x: cx, z: cz });
    }

    for (const c of colonyCenters) {
      const baseHue = rand(0.02, 0.15) + Math.random() * 0.5;
      const branches = state.branchesPerColony;

      for (let i = 0; i < branches; i++) {
        const len = rand(state.minLen, state.maxLen);
        const rad = rand(state.minRad, state.maxRad);

        // small random offset inside colony
        const ang0 = rand(0, Math.PI * 2);
        const r0 = rand(0, colonyRadius * 0.6);
        const bx = c.x + Math.cos(ang0) * r0;
        const bz = c.z + Math.sin(ang0) * r0;
        const by = -0.02 + rand(0.0, 0.03);

        // branch direction: mostly upward with a little sideways
        const dirHorizAng = rand(0, Math.PI * 2);
        const horizTilt = rand(0.1, 0.55);
        const dy = rand(0.7, 1.0);
        const dx = Math.cos(dirHorizAng) * horizTilt;
        const dz = Math.sin(dirHorizAng) * horizTilt;
        let ax = dx, ay = dy, az = dz;
        const lenAxis = Math.hypot(ax, ay, az) || 1.0;
        ax /= lenAxis; ay /= lenAxis; az /= lenAxis;

        // axis encodes direction * length
        data.base.push(bx, by, bz);
        data.axis.push(ax * len, ay * len, az * len);
        data.radius.push(rad);
        data.hue.push(baseHue + rand(-0.05, 0.05));
        data.phase.push(rand(0.0, 6.28318));
        data.count++;
      }
    }

    inst.update(data);
  }

  scatter();

  return {
    setColonies(n) {
      state.colonies = Math.max(1, n | 0);
    },
    setBranchesPerColony(n) {
      state.branchesPerColony = Math.max(1, n | 0);
    },
    regenerate: scatter,

        draw(shared) {
      if (inst.count === 0) return;

      gl.useProgram(prog);
      gl.bindVertexArray(cyl.vao);

      // --- disable back-face culling just for staghorn branches ---
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
        cyl.count,
        gl.UNSIGNED_SHORT,
        0,
        inst.count
      );

      // restore previous culling state
      if (hadCull) gl.enable(gl.CULL_FACE);
    },
  };
}