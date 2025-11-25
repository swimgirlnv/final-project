import { vs, fs } from "./tankFloorShaders";

// Single source of truth for tank size
export let TANK_X_HALF = 2.6;
export let TANK_Z_HALF = 2.2;
const SAND_DEPTH = 0.55;

// Function to update tank dimensions
export function setTankSize(scale) {
  // Base size at scale=50: 2.6 x 2.2
  // Scale from 1.0 to 100.0
  const factor = scale / 50.0;
  TANK_X_HALF = 2.6 * factor;
  TANK_Z_HALF = 2.2 * factor;
}

export function createFloorLayer(gl) {
  function comp(type, src){
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src); 
    gl.compileShader(sh);
    if(!gl.getShaderParameter(sh, gl.COMPILE_STATUS))
      throw new Error(gl.getShaderInfoLog(sh) || "floor shader compile fail");
    return sh;
  }
  function prog(vsSrc, fsSrc){
    const p = gl.createProgram();
    gl.attachShader(p, comp(gl.VERTEX_SHADER, vsSrc));
    gl.attachShader(p, comp(gl.FRAGMENT_SHADER, fsSrc));
    gl.bindAttribLocation(p, 0, "a_xz");
    gl.linkProgram(p);
    if(!gl.getProgramParameter(p, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(p) || "floor link fail");
    return p;
  }

  const P = prog(vs, fs);
  const U = n => gl.getUniformLocation(P, n);

  let vao, ib, indexCount;
  
  function buildMesh() {
    const xHalf = TANK_X_HALF;
    const zHalf = TANK_Z_HALF;

    // bump res a bit so detail stays nice
    const NX = 200;
    const NZ = 160;

    const verts = [], idx = [];
    for (let j = 0; j <= NZ; j++){
      const z = -zHalf + (2 * zHalf) * (j / NZ);
      for (let i = 0; i <= NX; i++){
        const x = -xHalf + (2 * xHalf) * (i / NX);
        verts.push(x, z);
        if (i < NX && j < NZ){
          const a = j * (NX + 1) + i;
          const b = a + 1;
          const c = a + (NX + 1);
          const d = c + 1;
          idx.push(a, c, b,  b, c, d);
        }
      }
    }

    if (vao) {
      gl.deleteVertexArray(vao);
    }
    
    vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    if (ib) {
      gl.deleteBuffer(ib);
    }
    
    ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(idx), gl.STATIC_DRAW);
    
    indexCount = idx.length;
  }
  
  // Initial build
  buildMesh();

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
    fogNear: 3.0,       // slightly farther now that tank is bigger
    fogFar:  7.0,
    fogStrength: 0.55,
    fogBias: 0.12
  };

  return {
    // for driftwood "buried" effect
    getParams(){ 
      return { amp: state.amp, scale: state.scale, yOffset: -0.03 }; 
    },

    // UI setters
    setFog(color, near, far){ 
      state.fogColor = color; 
      state.fogNear = near; 
      state.fogFar = far; 
    },
    setFloorFog(strength = 0.55, bias = 0.12){ 
      state.fogStrength = strength; 
      state.fogBias = bias; 
    },
    setAmp(a){ state.amp = +a; },
    setScale(s){ state.scale = +s; },
    setGravelMix(x){ state.gravelMix = Math.max(0, Math.min(1, +x)); },
    setGravelScale(x){ state.gravelScale = Math.max(1.0, +x); },
    setGravelBump(x){ state.gravelBump = Math.max(0.0, +x); },
    setPalette(name){
      state.palette = (name === "grey" ? 1 : name === "rainbow" ? 2 : 0);
    },
    
    regenerate(){
      buildMesh();
    },

    draw(shared){
      gl.useProgram(P);
      gl.bindVertexArray(vao);

      gl.uniformMatrix4fv(U("u_proj"), false, shared.proj);
      gl.uniformMatrix4fv(U("u_view"), false, shared.view);
      gl.uniform1f(U("u_time"), shared.time);

      gl.uniform1f(U("u_amp"),   state.amp);
      gl.uniform1f(U("u_scale"), state.scale);

      gl.uniform1f(U("u_gravelMix"),   state.gravelMix);
      gl.uniform1f(U("u_gravelScale"), state.gravelScale);
      gl.uniform1f(U("u_gravelBump"),  state.gravelBump);
      gl.uniform1i(U("u_palette"),     state.palette);

      gl.uniform3f(U("u_sandA"), state.sandA[0], state.sandA[1], state.sandA[2]);
      gl.uniform3f(U("u_sandB"), state.sandB[0], state.sandB[1], state.sandB[2]);

      gl.uniform3f(U("u_fogColor"), state.fogColor[0], state.fogColor[1], state.fogColor[2]);
      gl.uniform1f(U("u_fogNear"),  state.fogNear);
      gl.uniform1f(U("u_fogFar"),   state.fogFar);
      gl.uniform1f(U("u_fogStrength"), state.fogStrength);
      gl.uniform1f(U("u_fogBias"),     state.fogBias);

      gl.drawElements(gl.TRIANGLES, indexCount, gl.UNSIGNED_INT, 0);
    }
  };
}