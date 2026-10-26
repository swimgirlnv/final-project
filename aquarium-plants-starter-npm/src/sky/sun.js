// Yellow sun above the tank that becomes a disco ball in disco mode
import { sphereVs, sphereFs, billboardVs, billboardFs } from "./sunShaders.js";

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(sh) || "sun shader fail");
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
    throw new Error(gl.getProgramInfoLog(p) || "sun link fail");
  }
  gl.deleteShader(v);
  gl.deleteShader(f);
  return p;
}

function makeSphere(gl, stacks = 32, slices = 48) {
  const pos = [];
  const idx = [];
  for (let i = 0; i <= stacks; i++) {
    const theta = (i / stacks) * Math.PI;
    for (let j = 0; j <= slices; j++) {
      const phi = (j / slices) * Math.PI * 2;
      pos.push(Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi));
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
  const vb = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vb);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pos), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  const ib = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  return { vao, count: idx.length };
}

function makeQuad(gl) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vb = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vb);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const ib = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  return vao;
}

export function createSunLayer(gl) {
  const sphereProg = makeProgram(gl, sphereVs, sphereFs, { a_pos: 0 });
  const boardProg = makeProgram(gl, billboardVs, billboardFs, { a_corner: 0 });
  const sphere = makeSphere(gl);
  const quadVao = makeQuad(gl);

  const S = (n) => gl.getUniformLocation(sphereProg, n);
  const su = {
    proj: S("u_proj"), view: S("u_view"), center: S("u_center"), radius: S("u_radius"),
    camPos: S("u_camPos"), time: S("u_time"), morph: S("u_morph"),
  };
  const B = (n) => gl.getUniformLocation(boardProg, n);
  const bu = {
    proj: B("u_proj"), view: B("u_view"), center: B("u_center"), size: B("u_size"),
    time: B("u_time"), morph: B("u_morph"),
  };

  return {
    // center is the world position, morph runs from 0 (sun) to 1 (disco ball)
    draw(shared, center, radius, morph) {
      const hadBlend = gl.isEnabled(gl.BLEND);
      const hadCull = gl.isEnabled(gl.CULL_FACE);
      gl.disable(gl.CULL_FACE);

      gl.useProgram(sphereProg);
      gl.bindVertexArray(sphere.vao);
      gl.uniformMatrix4fv(su.proj, false, shared.proj);
      gl.uniformMatrix4fv(su.view, false, shared.view);
      gl.uniform3f(su.center, center[0], center[1], center[2]);
      gl.uniform1f(su.radius, radius);
      gl.uniform3f(su.camPos, shared.camPos[0], shared.camPos[1], shared.camPos[2]);
      gl.uniform1f(su.time, shared.time);
      gl.uniform1f(su.morph, morph);
      gl.drawElements(gl.TRIANGLES, sphere.count, gl.UNSIGNED_SHORT, 0);

      // rays and sparkles sit behind the sphere, hidden where it covers them
      const prevDepthMask = gl.getParameter(gl.DEPTH_WRITEMASK);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);

      gl.useProgram(boardProg);
      gl.bindVertexArray(quadVao);
      gl.uniformMatrix4fv(bu.proj, false, shared.proj);
      gl.uniformMatrix4fv(bu.view, false, shared.view);
      gl.uniform3f(bu.center, center[0], center[1], center[2]);
      gl.uniform1f(bu.size, radius * 3.0);
      gl.uniform1f(bu.time, shared.time);
      gl.uniform1f(bu.morph, morph);
      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);

      gl.depthMask(prevDepthMask);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      if (!hadBlend) gl.disable(gl.BLEND);
      if (hadCull) gl.enable(gl.CULL_FACE);
    },
  };
}
