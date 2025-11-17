import { vs, fs } from "./grassShaders";

export function createGrassLayer(gl) {
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

  // ribbon geometry
  function makeRibbon(segments = 28) {
    const pos = [],
      a_t = [],
      uv = [],
      idx = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      pos.push(-0.5, t, +0.5, t);
      a_t.push(t, t);
      uv.push(0, t, 1, t);
      if (i < segments) {
        const b = i * 2;
        idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
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
    vbuf(pos, 0, 2);
    vbuf(a_t, 1, 1);
    vbuf(uv, 2, 2);
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(
      gl.ELEMENT_ARRAY_BUFFER,
      new Uint16Array(idx),
      gl.STATIC_DRAW
    );
    return {
      vao,
      count: idx.length,
      attribs: { i_base: 3, i_height: 4, i_phase: 5, i_amp: 6, i_hue: 7 },
    };
  }
  function mkInstBufs(attribs, max) {
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
      base: mk(3, 2),
      height: mk(4, 1),
      phase: mk(5, 1),
      amp: mk(6, 1),
      hue: mk(7, 1),
      yaw: mk(8,1),
      count: 0,
      update(data) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.base);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(data.base));
        gl.bindBuffer(gl.ARRAY_BUFFER, this.height);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(data.height));
        gl.bindBuffer(gl.ARRAY_BUFFER, this.phase);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(data.phase));
        gl.bindBuffer(gl.ARRAY_BUFFER, this.amp);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(data.amp));
        gl.bindBuffer(gl.ARRAY_BUFFER, this.hue);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(data.hue));
        gl.bindBuffer(gl.ARRAY_BUFFER,this.yaw);    gl.bufferSubData(gl.ARRAY_BUFFER,0,new Float32Array(data.yaw)); // NEW
        this.count = data.count;
      },
    };
  }

  const prog = program(vs, fs, {
    a_pos: 0,
    a_t: 1,
    a_uv: 2,
    i_base: 3,
    i_height: 4,
    i_phase: 5,
    i_amp: 6,
    i_hue: 7,
    i_yaw: 8,
  });
  const ribbon = makeRibbon(28);
  gl.bindVertexArray(ribbon.vao);
  const inst = mkInstBufs(ribbon.attribs, 20000);

  const U = (n) => gl.getUniformLocation(prog, n);
  const u_proj = U("u_proj"),
    u_view = U("u_view"),
    u_time = U("u_time");
  const u_currentStrength = U("u_currentStrength"),
    u_currentDir = U("u_currentDir"),
    u_flex = U("u_flex");

  const u_fogColor = U("u_fogColor");
  const u_fogNear = U("u_fogNear");
  const u_fogFar = U("u_fogFar");

  const state = {
    count: +document.getElementById("plantCount")?.value || 200,
    avgH: 1.0,
    flex: 1.4,
  };

  function rand(a, b) {
    return a + Math.random() * (b - a);
  }
  function scatter() {
    const d = { base: [], height: [], phase: [], amp: [], hue: [], yaw: [], count: 0 };
    for (let i = 0; i < state.count; i++) {
      const x = rand(-1.35, 1.35),
        z = rand(-0.62, 0.62);
      d.base.push(x, z);
      d.height.push(rand(0.6 * state.avgH, 1.5 * state.avgH));
      d.phase.push(Math.random() * Math.PI * 2);
      d.amp.push(rand(0.05, 0.2));
      d.hue.push(rand(0.26, 0.34));
      d.yaw.push(rand(0, Math.PI*2));
      d.count++;
    }
    inst.update(d);
  }
  scatter();

  return {
    setCount(n) {
      state.count = n | 0;
    },
    setAvgHeight(h) {
      state.avgH = +h;
    },
    setFlex(f) {
      state.flex = +f;
    },
    regenerate: scatter,
    draw(shared) {
      if (inst.count === 0) return;
      gl.useProgram(prog);
      gl.bindVertexArray(ribbon.vao);
      gl.uniformMatrix4fv(u_proj, false, shared.proj);
      gl.uniformMatrix4fv(u_view, false, shared.view);
      gl.uniform1f(u_time, shared.time);
      gl.uniform1f(u_currentStrength, shared.currentStrength);
      gl.uniform2f(u_currentDir, shared.currentDir[0], shared.currentDir[1]);
      gl.uniform1f(u_flex, state.flex);
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
        ribbon.count,
        gl.UNSIGNED_SHORT,
        0,
        inst.count
      );
    },
  };
}
