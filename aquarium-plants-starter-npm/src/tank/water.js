import { vs, fs } from "./waterShaders.js";
import { TANK_X_HALF, TANK_Z_HALF, TANK_HEIGHT } from "../tank/tankFloor.js";

export function createWaterSurfaceLayer(gl, opts = {}) {
  function compile(type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(sh) || "water shader fail");
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
      throw new Error(gl.getProgramInfoLog(p) || "water link fail");
    }
    gl.deleteShader(v);
    gl.deleteShader(f);
    return p;
  }

  // simple rectangle over the tank (XZ plane, centered at origin)
  function makeQuad() {
    const x = TANK_X_HALF;
    const z = TANK_Z_HALF;

    const verts = new Float32Array([
      -x, -z,
       x, -z,
       x,  z,
      -x,  z,
    ]);

    const idx = new Uint16Array([0, 1, 2, 0, 2, 3]);

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);

    return { vao, count: idx.length };
  }

  const prog = program(vs, fs, { a_xz: 0 });
  let quad = makeQuad();

  const U = (n) => gl.getUniformLocation(prog, n);
  const u_proj         = U("u_proj");
  const u_view         = U("u_view");
  const u_time         = U("u_time");
  const u_height       = U("u_height");
  const u_deepColor    = U("u_deepColor");
  const u_shallowColor = U("u_shallowColor");
  const u_fogColor     = U("u_fogColor");
  const u_fogNear      = U("u_fogNear");
  const u_fogFar       = U("u_fogFar");

  const state = {
    height: opts.height ?? TANK_HEIGHT, // y position of water surface (top of tank)
    deepColor:    opts.deepColor    || [0.02, 0.18, 0.32], // deep turquoise
    shallowColor: opts.shallowColor || [0.20, 0.85, 0.98], // bright surface
  };

  return {
    setHeight(h) {
      state.height = h;
    },
    setColors(deep, shallow) {
      if (deep)    state.deepColor    = deep;
      if (shallow) state.shallowColor = shallow;
    },

    regenerate() {
      quad = makeQuad();
    },

    draw(shared) {
      gl.useProgram(prog);
      gl.bindVertexArray(quad.vao);

      // draw last with blending, no depth write, no cull
      const hadBlend = gl.isEnabled(gl.BLEND);
      const hadCull  = gl.isEnabled(gl.CULL_FACE);
      const prevDepthMask = gl.getParameter(gl.DEPTH_WRITEMASK);

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      if (hadCull) gl.disable(gl.CULL_FACE);
      gl.depthMask(false);

      gl.uniformMatrix4fv(u_proj, false, shared.proj);
      gl.uniformMatrix4fv(u_view, false, shared.view);
      gl.uniform1f(u_time, shared.time);
      gl.uniform1f(u_height, state.height);

      gl.uniform3f(
        u_deepColor,
        state.deepColor[0],
        state.deepColor[1],
        state.deepColor[2]
      );
      gl.uniform3f(
        u_shallowColor,
        state.shallowColor[0],
        state.shallowColor[1],
        state.shallowColor[2]
      );

      gl.uniform3f(
        u_fogColor,
        shared.fogColor[0],
        shared.fogColor[1],
        shared.fogColor[2]
      );
      gl.uniform1f(u_fogNear, shared.fogNear);
      gl.uniform1f(u_fogFar,  shared.fogFar);

      gl.drawElements(gl.TRIANGLES, quad.count, gl.UNSIGNED_SHORT, 0);

      // restore state
      gl.depthMask(prevDepthMask);
      if (!hadBlend) gl.disable(gl.BLEND);
      if (hadCull)   gl.enable(gl.CULL_FACE);
    },
  };
}