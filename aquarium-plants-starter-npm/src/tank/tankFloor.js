import { vs, fs } from "./tankFloorShaders";

export function createFloorLayer(gl) {
  function comp(type, src){
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src); gl.compileShader(sh);
    if(!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
    return sh;
  }
  function prog(vsSrc, fsSrc){
    const p = gl.createProgram();
    gl.attachShader(p, comp(gl.VERTEX_SHADER, vsSrc));
    gl.attachShader(p, comp(gl.FRAGMENT_SHADER, fsSrc));
    gl.bindAttribLocation(p, 0, "a_xz");
    gl.linkProgram(p);
    if(!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }

  const P = prog(vs, fs);
  const U = n => gl.getUniformLocation(P, n);

  // grid
  const xHalf = 1.6, zHalf = 1.2;
  const NX = 120, NZ = 90;
  const verts = [], idx = [];
  for (let j=0;j<=NZ;j++){
    const z = -zHalf + (2*zHalf) * (j/NZ);
    for (let i=0;i<=NX;i++){
      const x = -xHalf + (2*xHalf) * (i/NX);
      verts.push(x, z);
      if (i<NX && j<NZ){
        const a = j*(NX+1)+i, b = a+1, c = a+(NX+1), d = c+1;
        idx.push(a,c,b,  b,c,d);
      }
    }
  }
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vb = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vb);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const ib = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(idx), gl.STATIC_DRAW);

  // state (defaults)
  const state = {
    amp: 0.18,          // macro height amplitude
    scale: 0.90,        // macro dune frequency
    gravelMix: 0.0,     // 0 sand .. 1 gravel
    gravelScale: 7.0,   // pebble density
    gravelBump: 0.02,   // 0..0.06 good
    palette: 0,         // 0 sand, 1 grey, 2 rainbow
    sandA: [0.78, 0.72, 0.58],
    sandB: [0.90, 0.86, 0.74],
    fogColor: [0.02, 0.07, 0.13],
    fogNear: 2.0,
    fogFar:  5.5,
    fogStrength: 0.55,
    fogBias: 0.12
  };

  return {
    // for driftwood "buried" effect
    getParams(){ return { amp: state.amp, scale: state.scale, yOffset: -0.03 }; },

    // UI setters
    setFog(color, near, far){ state.fogColor = color; state.fogNear = near; state.fogFar = far; },
    setFloorFog(strength=0.55, bias=0.12){ state.fogStrength = strength; state.fogBias = bias; },
    setAmp(a){ state.amp = +a; },
    setScale(s){ state.scale = +s; },
    setGravelMix(x){ state.gravelMix = Math.max(0, Math.min(1, +x)); },
    setGravelScale(x){ state.gravelScale = Math.max(1.0, +x); },
    setGravelBump(x){ state.gravelBump = Math.max(0.0, +x); },
    setPalette(name){
      state.palette = (name === "grey" ? 1 : name === "rainbow" ? 2 : 0);
    },

    draw(shared){
      gl.useProgram(P);
      gl.bindVertexArray(vao);

      gl.uniformMatrix4fv(U("u_proj"), false, shared.proj);
      gl.uniformMatrix4fv(U("u_view"), false, shared.view);
      gl.uniform1f(U("u_time"), shared.time);

      gl.uniform1f(U("u_amp"),   state.amp);
      gl.uniform1f(U("u_scale"), state.scale);

      gl.uniform1f(U("u_gravelMix"),  state.gravelMix);
      gl.uniform1f(U("u_gravelScale"),state.gravelScale);
      gl.uniform1f(U("u_gravelBump"), state.gravelBump);
      gl.uniform1i(U("u_palette"),    state.palette);

      gl.uniform3f(U("u_sandA"), state.sandA[0], state.sandA[1], state.sandA[2]);
      gl.uniform3f(U("u_sandB"), state.sandB[0], state.sandB[1], state.sandB[2]);

      gl.uniform3f(U("u_fogColor"), state.fogColor[0], state.fogColor[1], state.fogColor[2]);
      gl.uniform1f(U("u_fogNear"),  state.fogNear);
      gl.uniform1f(U("u_fogFar"),   state.fogFar);
      gl.uniform1f(U("u_fogStrength"), state.fogStrength);
      gl.uniform1f(U("u_fogBias"),     state.fogBias);

      gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_INT, 0);
    }
  };
}