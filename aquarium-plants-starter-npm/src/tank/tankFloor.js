import {vs, fs} from "./tankFloorShaders"

export function createFloorLayer(gl) {

  function comp(type, src){
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src); gl.compileShader(sh);
    if(!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
    return sh;
  }
  function prog(vs,fs){
    const p = gl.createProgram();
    gl.attachShader(p, comp(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, comp(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, "a_xz");
    gl.linkProgram(p);
    if(!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }

  const P = prog(vs, fs);
  const U = n => gl.getUniformLocation(P, n);

  // grid
  const xHalf = 1.6, zHalf = 1.2;          // match tank
  const NX = 120, NZ = 90;                 // resolution (tweak)
  const verts = [];
  const idx = [];
  for (let j=0;j<=NZ;j++){
    const z = -zHalf + (2*zHalf) * (j/NZ);
    for (let i=0;i<=NX;i++){
      const x = -xHalf + (2*xHalf) * (i/NX);
      verts.push(x, z);
      if (i<NX && j<NZ){
        const a = j*(NX+1)+i;
        const b = a+1;
        const c = a+(NX+1);
        const d = c+1;
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

  // state
  const state = {
    amp: 0.18,       // dune amplitude
    scale: 0.9,      // noise frequency
    sandA: [0.78, 0.72, 0.58],
    sandB: [0.90, 0.86, 0.74],
    fogColor: [0.02, 0.07, 0.13],
    fogNear: 2.0,
    fogFar:  5.5
  };

  return {
    setFog(color, near, far){ state.fogColor = color; state.fogNear = near; state.fogFar = far; },
    setAmp(a){ state.amp = a; },
    draw(shared){
      gl.useProgram(P);
      gl.bindVertexArray(vao);

      gl.uniformMatrix4fv(U("u_proj"), false, shared.proj);
      gl.uniformMatrix4fv(U("u_view"), false, shared.view);
      gl.uniform1f(U("u_time"), shared.time);

      gl.uniform2f(U("u_size"), xHalf, zHalf);
      gl.uniform1f(U("u_amp"), state.amp);
      gl.uniform1f(U("u_scale"), state.scale);
      gl.uniform3f(U("u_sandA"), state.sandA[0], state.sandA[1], state.sandA[2]);
      gl.uniform3f(U("u_sandB"), state.sandB[0], state.sandB[1], state.sandB[2]);

      gl.uniform3f(U("u_fogColor"), state.fogColor[0], state.fogColor[1], state.fogColor[2]);
      gl.uniform1f(U("u_fogNear"), state.fogNear);
      gl.uniform1f(U("u_fogFar"),  state.fogFar);

      gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_INT, 0);
    }
  };
}