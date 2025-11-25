import { vs, fs } from "./goldfishShaders.js";
import { goldfish, eye_types, afin_types, caudal_types, dorsal_types } from "./goldfishGeo.js";

// functions to prepare data for GPU
function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS))
    throw new Error(gl.getShaderInfoLog(sh) || "Shader compile failed");
  return sh;
}
function makeProgram(gl, vsSrc, fsSrc, bindings) {
  const p = gl.createProgram();
  const v = compile(gl, gl.VERTEX_SHADER, vsSrc);
  const f = compile(gl, gl.FRAGMENT_SHADER, fsSrc);
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

// ---------- Geometry: Calls on fcns for head, body, caudal fin, dorsal fin, pectoral fin, pelvic fin, anal fin
function createFishGeometry(gl) {
  const positions = [];
  const indices = [];
  const colors = [];

  goldfish(
    positions, indices, colors,
    // body params
    // bodyLength, bodyHeight, bodyWidth, belly_size, arch
    1.35, 0.6, 0.7, 0.0,
    // head params
    // headSize, eyeType, mouthTilt
    {x: 0.03, y: 0.06, z: 0.3}, eye_types.GOOGLY, 0.0,
    // caudal params
    // caudalLength, caudalWidth, caudalType, caudalAngle
    0.6, 0.75, caudal_types.DROOPY,
    // dorsal params
    // dorsalLength, dorsalWidth, dorsalShift, dorsalType
    0.4, 0.35, 0.49, dorsal_types.PUNK,
    // pelvic params
    // pelvicLength, pelvicWidth, pelvicShift, pelvicAngle
    0.5, 1.0, 0.55, -0.5,
    // pectoral params
    // pectoralLength, pectoralWidth, pectoralShift, pectoralAngle
    0.5, 1.05, 0.25, -0.35,
    // afin params
    // afinLength, afinWidth, afinType, afinShift
    0.2, 0.21, afin_types.SPIKY, 0.68
  );

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  
  // Attribute locations (hard-coded to match shader order)
  const vs_Pos_loc = 0;
  const vs_Col_loc = 1;

  // Create VBOs and IBO
  const posBuffer = gl.createBuffer();
  const colorBuffer = gl.createBuffer();
  const ibo = gl.createBuffer();
  
  // Helper to setup/bind buffers initially
  function setupBuffer(buffer, data, attribLoc, size, type = gl.FLOAT, usage = gl.DYNAMIC_DRAW) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), usage);
    gl.enableVertexAttribArray(attribLoc);
    gl.vertexAttribPointer(attribLoc, size, type, false, 0, 0);
  }

  gl.bindVertexArray(vao);
  setupBuffer(posBuffer, positions, vs_Pos_loc, 3);
  setupBuffer(colorBuffer, colors, vs_Col_loc, 3);

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(
    gl.ELEMENT_ARRAY_BUFFER,
    new Uint16Array(indices),
    gl.DYNAMIC_DRAW // Use DYNAMIC_DRAW since the data will change
  );

  return {
    vao,
    posBuffer,
    colorBuffer,
    ibo,
    count: indices.length,
    attribs: { vs_Pos : vs_Pos_loc, vs_Col : vs_Col_loc },
    // Store initial params so we can easily see what was used last
    params: {
      // Body
      bodyLength: 1.35, 
      bodyHeight: 0.6, 
      bodyWidth: 0.7, 
      arch: 0.0, // Mapped from the 4th argument (0.0)
      
      // Head
      headSize: {x: 0.03, y: 0.06, z: 0.3}, 
      eyeType: eye_types.GOOGLY, 
      mouthTilt: 0.0,
      
      // Caudal (Tail)
      caudalLength: 0.6, 
      caudalWidth: 0.75, 
      caudalType: caudal_types.DROOPY,
      
      // Dorsal
      dorsalLength: 0.4, 
      dorsalWidth: 0.35, 
      dorsalShift: 0.49, 
      dorsalType: dorsal_types.PUNK,
      
      // Pelvic
      pelvicLength: 0.5, 
      pelvicWidth: 1.0, 
      pelvicShift: 0.55, 
      pelvicAngle: -0.5,
      
      // Pectoral
      pectoralLength: 0.5, 
      pectoralWidth: 1.05, 
      pectoralShift: 0.25, 
      pectoralAngle: -0.35,
      
      // Afin (Anal Fin)
      afinLength: 0.2, 
      afinWidth: 0.21, 
      afinType: afin_types.SPIKY, 
      afinShift: 0.68
    }
  };
}

export function regenerateGoldfishGeometry(gl, gfish, newParams) {
    const positions = [];
    const indices = [];
    const colors = [];

    console.log(newParams);

    // 1. Call the geometry generation function with the new parameters
    goldfish(
        positions, indices, colors,
        newParams.bodyLength, newParams.bodyHeight, newParams.bodyWidth, newParams.arch,
        newParams.headSize, eye_types.GOOGLY, newParams.mouthTilt,
        newParams.caudalLength, newParams.caudalWidth, caudal_types.DROOPY,
        newParams.dorsalLength, newParams.dorsalWidth, newParams.dorsalShift, dorsal_types.PUNK,
        newParams.pelvicLength, newParams.pelvicWidth, newParams.pelvicShift, newParams.pelvicAngle,
        newParams.pectoralLength, newParams.pectoralWidth, newParams.pectoralShift, newParams.pectoralAngle,
        newParams.afinLength, newParams.afinWidth, afin_types.SPIKY, newParams.afinShift
    );

    // 2. Update the GPU buffers (VBOs and IBO)
    // Bind the VAO first
    gl.bindVertexArray(gfish.vao);

    // Update Positions VBO
    gl.bindBuffer(gl.ARRAY_BUFFER, gfish.posBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.DYNAMIC_DRAW);

    // Update Colors VBO
    gl.bindBuffer(gl.ARRAY_BUFFER, gfish.colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.DYNAMIC_DRAW);

    // Update Indices IBO
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gfish.ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.DYNAMIC_DRAW);

    // 3. Update the draw count and stored parameters
    gfish.count = indices.length;
    gfish.params = newParams;

    // Unbind VAO for safety
    gl.bindVertexArray(null);

    // The existing gfish object (which holds the VAO, buffers, and count) is updated by reference.
    // The draw loop will now use the new geometry data and new count.
}

// ---------- Main initialization and animation export
export function createGoldfish(gl) {
    const bindings = {
      vs_Pos: 0,
      vs_Col: 1
    };

    const prog = makeProgram(gl, vs, fs, bindings);
    const gfish = createFishGeometry(gl, 28);
    gl.bindVertexArray(gfish.vao);
  
    // uniforms
    const U = (n) => gl.getUniformLocation(prog, n);
    const u_proj = U("u_proj"),
      u_view = U("u_view"),
      u_time = U("u_time"),
      u_res = U("u_res");
    const u_fogColor = U("u_fogColor");
    const u_fogNear = U("u_fogNear");
    const u_fogFar = U("u_fogFar");
  
    return {
      draw(shared) {
        gl.useProgram(prog);
        gl.bindVertexArray(gfish.vao);

        gl.enable(gl.CULL_FACE);
        gl.cullFace(gl.BACK);

        gl.uniformMatrix4fv(u_proj, false, shared.proj);
        gl.uniformMatrix4fv(u_view, false, shared.view);
        gl.uniform1f(u_time, shared.time);
        gl.uniform2f(u_res, shared.res[0], shared.res[1]);
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
          gfish.count,
          gl.UNSIGNED_SHORT,
          0,
          1
        );
      },
      geometry: gfish
    };
}