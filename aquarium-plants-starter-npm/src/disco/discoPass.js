// Darkened disco scene with light pools, visible beams and glow sprites
import {
  compositeVs,
  compositeFs,
  beamVs,
  beamFs,
  glowVs,
  glowFs,
} from "./discoShaders.js";

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(sh) || "disco shader fail");
  }
  return sh;
}

function makeProgram(gl, vsSrc, fsSrc, bindings = {}) {
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
    throw new Error(gl.getProgramInfoLog(p) || "disco link fail");
  }
  gl.deleteShader(v);
  gl.deleteShader(f);
  return p;
}

function uniforms(gl, prog, names) {
  const out = {};
  for (const n of names) out[n] = gl.getUniformLocation(prog, n);
  return out;
}

// column major 4x4 helpers
function multiply4(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
  }
  return o;
}

function invert4(m) {
  const inv = new Float32Array(16);
  inv[0] = m[5]*m[10]*m[15] - m[5]*m[11]*m[14] - m[9]*m[6]*m[15] + m[9]*m[7]*m[14] + m[13]*m[6]*m[11] - m[13]*m[7]*m[10];
  inv[4] = -m[4]*m[10]*m[15] + m[4]*m[11]*m[14] + m[8]*m[6]*m[15] - m[8]*m[7]*m[14] - m[12]*m[6]*m[11] + m[12]*m[7]*m[10];
  inv[8] = m[4]*m[9]*m[15] - m[4]*m[11]*m[13] - m[8]*m[5]*m[15] + m[8]*m[7]*m[13] + m[12]*m[5]*m[11] - m[12]*m[7]*m[9];
  inv[12] = -m[4]*m[9]*m[14] + m[4]*m[10]*m[13] + m[8]*m[5]*m[14] - m[8]*m[6]*m[13] - m[12]*m[5]*m[10] + m[12]*m[6]*m[9];
  inv[1] = -m[1]*m[10]*m[15] + m[1]*m[11]*m[14] + m[9]*m[2]*m[15] - m[9]*m[3]*m[14] - m[13]*m[2]*m[11] + m[13]*m[3]*m[10];
  inv[5] = m[0]*m[10]*m[15] - m[0]*m[11]*m[14] - m[8]*m[2]*m[15] + m[8]*m[3]*m[14] + m[12]*m[2]*m[11] - m[12]*m[3]*m[10];
  inv[9] = -m[0]*m[9]*m[15] + m[0]*m[11]*m[13] + m[8]*m[1]*m[15] - m[8]*m[3]*m[13] - m[12]*m[1]*m[11] + m[12]*m[3]*m[9];
  inv[13] = m[0]*m[9]*m[14] - m[0]*m[10]*m[13] - m[8]*m[1]*m[14] + m[8]*m[2]*m[13] + m[12]*m[1]*m[10] - m[12]*m[2]*m[9];
  inv[2] = m[1]*m[6]*m[15] - m[1]*m[7]*m[14] - m[5]*m[2]*m[15] + m[5]*m[3]*m[14] + m[13]*m[2]*m[7] - m[13]*m[3]*m[6];
  inv[6] = -m[0]*m[6]*m[15] + m[0]*m[7]*m[14] + m[4]*m[2]*m[15] - m[4]*m[3]*m[14] - m[12]*m[2]*m[7] + m[12]*m[3]*m[6];
  inv[10] = m[0]*m[5]*m[15] - m[0]*m[7]*m[13] - m[4]*m[1]*m[15] + m[4]*m[3]*m[13] + m[12]*m[1]*m[7] - m[12]*m[3]*m[5];
  inv[14] = -m[0]*m[5]*m[14] + m[0]*m[6]*m[13] + m[4]*m[1]*m[14] - m[4]*m[2]*m[13] - m[12]*m[1]*m[6] + m[12]*m[2]*m[5];
  inv[3] = -m[1]*m[6]*m[11] + m[1]*m[7]*m[10] + m[5]*m[2]*m[11] - m[5]*m[3]*m[10] - m[9]*m[2]*m[7] + m[9]*m[3]*m[6];
  inv[7] = m[0]*m[6]*m[11] - m[0]*m[7]*m[10] - m[4]*m[2]*m[11] + m[4]*m[3]*m[10] + m[8]*m[2]*m[7] - m[8]*m[3]*m[6];
  inv[11] = -m[0]*m[5]*m[11] + m[0]*m[7]*m[9] + m[4]*m[1]*m[11] - m[4]*m[3]*m[9] - m[8]*m[1]*m[7] + m[8]*m[3]*m[5];
  inv[15] = m[0]*m[5]*m[10] - m[0]*m[6]*m[9] - m[4]*m[1]*m[10] + m[4]*m[2]*m[9] + m[8]*m[1]*m[6] - m[8]*m[2]*m[5];
  let det = m[0] * inv[0] + m[1] * inv[4] + m[2] * inv[8] + m[3] * inv[12];
  det = det === 0 ? 1 : 1 / det;
  for (let i = 0; i < 16; i++) inv[i] *= det;
  return inv;
}

export function createDiscoPass(gl) {
  /* ---------- offscreen scene target ---------- */
  const samples = Math.min(4, gl.getParameter(gl.MAX_SAMPLES));
  let target = null;

  function deleteTarget(t) {
    gl.deleteFramebuffer(t.msFbo);
    gl.deleteFramebuffer(t.resolveFbo);
    gl.deleteRenderbuffer(t.msColor);
    gl.deleteRenderbuffer(t.msDepth);
    gl.deleteTexture(t.colorTex);
    gl.deleteTexture(t.depthTex);
  }

  function makeTexture(internal, format, type, w, h) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  // Multisampled buffers to draw into, resolved into textures the composite can read
  function ensureTarget(w, h) {
    if (target && target.w === w && target.h === h) return;
    if (target) deleteTarget(target);

    const msColor = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, msColor);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.RGBA8, w, h);
    const msDepth = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, msDepth);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH_COMPONENT24, w, h);

    const msFbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, msFbo);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, msColor);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, msDepth);

    const colorTex = makeTexture(gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, w, h);
    const depthTex = makeTexture(gl.DEPTH_COMPONENT24, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, w, h);
    const resolveFbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, resolveFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, colorTex, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depthTex, 0);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);

    target = { w, h, msColor, msDepth, msFbo, colorTex, depthTex, resolveFbo };
  }

  /* ---------- programs ---------- */
  const compositeProg = makeProgram(gl, compositeVs, compositeFs);
  const cu = uniforms(gl, compositeProg, [
    "u_color", "u_depth", "u_invViewProj", "u_ballPos", "u_time", "u_dark", "u_amount", "u_numSpots",
  ]);
  const cuSpotDir = [], cuSpotColor = [], cuSpotCos = [];
  for (let i = 0; i < 4; i++) {
    cuSpotDir[i] = gl.getUniformLocation(compositeProg, `u_spotDir[${i}]`);
    cuSpotColor[i] = gl.getUniformLocation(compositeProg, `u_spotColor[${i}]`);
    cuSpotCos[i] = gl.getUniformLocation(compositeProg, `u_spotCos[${i}]`);
  }
  const emptyVao = gl.createVertexArray();

  const beamProg = makeProgram(gl, beamVs, beamFs, { a_pos: 0 });
  const bu = uniforms(gl, beamProg, [
    "u_proj", "u_view", "u_apex", "u_axis", "u_len", "u_radius", "u_camPos", "u_color", "u_strength",
  ]);

  const glowProg = makeProgram(gl, glowVs, glowFs, { a_corner: 0, i_pos: 1, i_radius: 2, i_color: 3 });
  const gu = uniforms(gl, glowProg, ["u_proj", "u_view", "u_strength"]);

  /* ---------- beam cone mesh ---------- */
  const BEAM_SEGS = 24;
  const beamVao = gl.createVertexArray();
  gl.bindVertexArray(beamVao);
  const beamVerts = [];
  const beamIdx = [];
  for (let i = 0; i <= BEAM_SEGS; i++) {
    const a = (i / BEAM_SEGS) * Math.PI * 2;
    beamVerts.push(Math.cos(a), Math.sin(a), 0.0, Math.cos(a), Math.sin(a), 1.0);
  }
  for (let i = 0; i < BEAM_SEGS; i++) {
    const a = i * 2;
    beamIdx.push(a, a + 1, a + 3, a, a + 3, a + 2);
  }
  const beamVbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, beamVbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(beamVerts), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  const beamIbo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, beamIbo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(beamIdx), gl.STATIC_DRAW);

  /* ---------- glow sprite instances ---------- */
  const MAX_GLOW = 64;
  const glowVao = gl.createVertexArray();
  gl.bindVertexArray(glowVao);
  const cornerVbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, cornerVbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  // interleaved pos(3) radius(1) color(3)
  const glowData = new Float32Array(MAX_GLOW * 7);
  const glowVbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, glowVbo);
  gl.bufferData(gl.ARRAY_BUFFER, glowData.byteLength, gl.DYNAMIC_DRAW);
  [[1, 3, 0], [2, 1, 12], [3, 3, 16]].forEach(([loc, size, offset]) => {
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 28, offset);
    gl.vertexAttribDivisor(loc, 1);
  });
  const glowIbo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, glowIbo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
  gl.bindVertexArray(null);

  /* ---------- additive blend helper ---------- */
  function withAdditive(fn) {
    const hadBlend = gl.isEnabled(gl.BLEND);
    const hadCull = gl.isEnabled(gl.CULL_FACE);
    const prevDepthMask = gl.getParameter(gl.DEPTH_WRITEMASK);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.disable(gl.CULL_FACE);
    gl.depthMask(false);
    fn();
    gl.depthMask(prevDepthMask);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    if (!hadBlend) gl.disable(gl.BLEND);
    if (hadCull) gl.enable(gl.CULL_FACE);
  }

  return {
    // Free the offscreen target while disco is off
    release() {
      if (target) deleteTarget(target);
      target = null;
    },

    // Start drawing the scene into the offscreen target
    begin(width, height) {
      ensureTarget(width, height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.msFbo);
      gl.viewport(0, 0, width, height);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    },

    // Draw the darkened, spot lit scene to the screen along with its depth
    finish(shared, ballPos, spots, amount) {
      const { w, h } = target;
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, target.msFbo);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, target.resolveFbo);
      gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT, gl.NEAREST);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, w, h);

      gl.useProgram(compositeProg);
      gl.bindVertexArray(emptyVao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, target.colorTex);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, target.depthTex);
      gl.uniform1i(cu.u_color, 0);
      gl.uniform1i(cu.u_depth, 1);

      gl.uniformMatrix4fv(cu.u_invViewProj, false, invert4(multiply4(shared.proj, shared.view)));
      gl.uniform3f(cu.u_ballPos, ballPos[0], ballPos[1], ballPos[2]);
      gl.uniform1f(cu.u_time, shared.time);
      gl.uniform1f(cu.u_dark, 0.14);
      gl.uniform1f(cu.u_amount, amount);
      gl.uniform1i(cu.u_numSpots, Math.min(4, spots.length));
      for (let i = 0; i < 4; i++) {
        const s = spots[i];
        if (!s) continue;
        gl.uniform3f(cuSpotDir[i], s.direction[0], s.direction[1], s.direction[2]);
        gl.uniform3f(cuSpotColor[i], s.color[0], s.color[1], s.color[2]);
        gl.uniform1f(cuSpotCos[i], s.coneAngle);
      }

      const hadBlend = gl.isEnabled(gl.BLEND);
      const hadCull = gl.isEnabled(gl.CULL_FACE);
      gl.disable(gl.BLEND);
      gl.disable(gl.CULL_FACE);
      gl.depthFunc(gl.ALWAYS);
      gl.depthMask(true);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.depthFunc(gl.LESS);
      if (hadBlend) gl.enable(gl.BLEND);
      if (hadCull) gl.enable(gl.CULL_FACE);

      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, null);
    },

    // Visible light cones from the ball down to the tank floor
    drawBeams(shared, ballPos, spots, amount, floorY) {
      if (amount <= 0 || spots.length === 0) return;
      gl.useProgram(beamProg);
      gl.bindVertexArray(beamVao);
      gl.uniformMatrix4fv(bu.u_proj, false, shared.proj);
      gl.uniformMatrix4fv(bu.u_view, false, shared.view);
      gl.uniform3f(bu.u_camPos, shared.camPos[0], shared.camPos[1], shared.camPos[2]);
      gl.uniform3f(bu.u_apex, ballPos[0], ballPos[1], ballPos[2]);
      gl.uniform1f(bu.u_strength, 0.12 * amount);

      withAdditive(() => {
        for (const s of spots) {
          const dir = s.direction;
          if (dir[1] > -0.05) continue;
          const len = (floorY - ballPos[1]) / dir[1];
          const tanHalf = Math.sqrt(Math.max(0, 1 - s.coneAngle * s.coneAngle)) / s.coneAngle;
          gl.uniform3f(bu.u_axis, dir[0], dir[1], dir[2]);
          gl.uniform1f(bu.u_len, len);
          gl.uniform1f(bu.u_radius, len * tanHalf);
          gl.uniform3f(bu.u_color, s.color[0], s.color[1], s.color[2]);
          gl.drawElements(gl.TRIANGLES, BEAM_SEGS * 6, gl.UNSIGNED_SHORT, 0);
        }
      });
    },

    // Soft halos, items are { pos:[x,y,z], radius, color:[r,g,b] }
    drawGlow(shared, items, strength) {
      const count = Math.min(items.length, MAX_GLOW);
      if (strength <= 0 || count === 0) return;
      for (let i = 0; i < count; i++) {
        const it = items[i];
        const o = i * 7;
        glowData[o] = it.pos[0];
        glowData[o + 1] = it.pos[1];
        glowData[o + 2] = it.pos[2];
        glowData[o + 3] = it.radius;
        glowData[o + 4] = it.color[0];
        glowData[o + 5] = it.color[1];
        glowData[o + 6] = it.color[2];
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, glowVbo);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, glowData, 0, count * 7);

      gl.useProgram(glowProg);
      gl.bindVertexArray(glowVao);
      gl.uniformMatrix4fv(gu.u_proj, false, shared.proj);
      gl.uniformMatrix4fv(gu.u_view, false, shared.view);
      gl.uniform1f(gu.u_strength, strength);
      withAdditive(() => {
        gl.drawElementsInstanced(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0, count);
      });
    },
  };
}
