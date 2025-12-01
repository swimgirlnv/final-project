import { vs, fs } from "./boulderShader.js";
import { findValidPosition, registerObject, clearObjectsByType } from "../../sceneCollision.js";

export function createBoulderLayer(gl) {
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

  function makeSphere(stacks = 16, slices = 24) {
    const pos = [];
    const norm = [];
    const uv = [];
    const idx = [];
    for (let i = 0; i <= stacks; i++) {
      const v = i / stacks;
      const theta = v * Math.PI;
      for (let j = 0; j <= slices; j++) {
        const u = j / slices;
        const phi = u * Math.PI * 2;
        const x = Math.sin(theta) * Math.cos(phi);
        const y = Math.cos(theta);
        const z = Math.sin(theta) * Math.sin(phi);
        pos.push(x, y, z);
        norm.push(x, y, z);
        uv.push(u, v);
      }
    }
    for (let i = 0; i < stacks; i++) {
      for (let j = 0; j < slices; j++) {
        const a = i * (slices + 1) + j;
        const b = a + slices + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
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

    vbuf(pos, 0, 3); // a_pos
    vbuf(norm, 1, 3); // a_normal
    vbuf(uv, 2, 2); // a_uv

    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(
      gl.ELEMENT_ARRAY_BUFFER,
      new Uint16Array(idx),
      gl.STATIC_DRAW
    );

    return { vao, count: idx.length };
  }

  function mkInstBufs(max) {
    function mk(loc, comps = 1) {
      const b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, max * comps * 4, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, comps, gl.FLOAT, false, 0, 0);
      gl.vertexAttribDivisor(loc, 1);
      return b;
    }
    return {
      offset: mk(3, 3),
      scale: mk(4, 1),
      hue: mk(5, 1),
      count: 0,
      update(data) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.offset);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(data.offset));
        gl.bindBuffer(gl.ARRAY_BUFFER, this.scale);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(data.scale));
        gl.bindBuffer(gl.ARRAY_BUFFER, this.hue);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(data.hue));
        this.count = data.count;
      },
    };
  }

  const prog = program(vs, fs, {
    a_pos: 0,
    a_normal: 1,
    a_uv: 2,
    i_offset: 3,
    i_scale: 4,
    i_hue: 5,
  });

  const sph = makeSphere(14, 24);
  gl.bindVertexArray(sph.vao);
  const inst = mkInstBufs(128);

  const U = (n) => gl.getUniformLocation(prog, n);
  const u_proj = U("u_proj"),
    u_view = U("u_view"),
    u_time = U("u_time");
  const u_lightDir = U("u_lightDir");
  const u_fogColor = U("u_fogColor");
  const u_fogNear = U("u_fogNear");
  const u_fogFar = U("u_fogFar");

  const state = { count: 6 };

  function rand(a, b) {
    return a + Math.random() * (b - a);
  }

  function scatter() {
    // Clear only boulder objects from collision registry
    clearObjectsByType("boulder");
    
    const d = { offset: [], scale: [], hue: [], count: 0 };
    for (let i = 0; i < state.count; i++) {
      const scale = rand(0.08, 0.28);
      const radius = scale * 1.2; // slightly larger footprint
      const pos = findValidPosition(radius, 100, 0.03);
      if (!pos) continue; // skip if can't find valid position

      const y = rand(-0.08, -0.03);
      d.offset.push(pos.x, y, pos.z);
      d.scale.push(scale);
      d.hue.push(rand(0.05, 0.15));
      registerObject(pos.x, pos.z, radius, "boulder");
      d.count++;
    }
    inst.update(d);
  }
  scatter();

  return {
    setCount(n) {
      state.count = n | 0;
    },
    regenerate: scatter,
    draw(shared) {
      if (inst.count === 0) return;

      // --- temporarily disable back-face culling for boulders ---
      const cullWasOn = gl.isEnabled(gl.CULL_FACE);
      if (cullWasOn) gl.disable(gl.CULL_FACE);

      gl.useProgram(prog);
      gl.bindVertexArray(sph.vao);
      gl.uniformMatrix4fv(u_proj, false, shared.proj);
      gl.uniformMatrix4fv(u_view, false, shared.view);
      gl.uniform1f(u_time, shared.time);
      gl.uniform3f(u_lightDir, 0.5, 1.0, 0.3);
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
        sph.count,
        gl.UNSIGNED_SHORT,
        0,
        inst.count
      );

      // --- restore previous culling state ---
      if (cullWasOn) gl.enable(gl.CULL_FACE);
    },
  };
}
