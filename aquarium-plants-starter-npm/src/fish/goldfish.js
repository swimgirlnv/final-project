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
    0.5, 0.5, 1.0, 1.0, 0.0,
    // head params
    // headSize, eyeType, mouthTilt
    {x: 1.0, y: 1.0}, eye_types.GOOGLY, 0.5,
    // caudal params
    // caudalLength, caudalWidth, caudalType, caudalAngle
    1.0, 1.0, caudal_types.BUTTERFLY, Math.PI2 / 2.0,
    // dorsal params
    // dorsalLength, dorsalWidth, dorsalShift, dorsalType
    1.0, 1.0, 0.0, dorsal_types.PUNK,
    // pelvic params
    // pelvicLength, pelvicWidth, pelvicShift, pelvicAngle
    1.0, 1.0, 0.0, Math.PI2 / 2.0,
    // pectoral params
    // pectoralLength, pectoralWidth, pectoralShift, pectoralAngle
    1.0, 1.0, 0.0, Math.PI2 / 2.0,
    // afin params
    // afinLength, afinWidth, afinType, afinShift, afinAngle
    1.0, 1.0, afin_types.FEATHERY, 0.0, Math.PI2 / 2.0
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
        bodyLength: 0.5, bodyHeight: 0.5, bodyWidth: 1.0, belly_size: 1.0, arch: 0.0,
        headSize: {x: 1.0, y: 1.0}, eyeType: eye_types.GOOGLY, mouthTilt: 0.5,
        caudalLength: 1.0, caudalWidth: 1.0, caudalType: caudal_types.BUTTERFLY,
        dorsalLength: 1.0, dorsalWidth: 1.0, dorsalShift: 0.0, dorsalType: dorsal_types.PUNK,
        pelvicLength: 1.0, pelvicWidth: 1.0, pelvicShift: 0.0, pelvicAngle: Math.PI * 2.0 / 2.0, // ADD pelvicAngle
        pectoralLength: 1.0, pectoralWidth: 1.0, pectoralShift: 0.0, pectoralAngle: Math.PI * 2.0 / 2.0, // ADD pectoralAngle
        afinLength: 1.0, afinWidth: 1.0, afinType: afin_types.FEATHERY, afinShift: 0.0, afinAngle: Math.PI * 2.0 / 2.0 // ADD afinShift, afinAngle
    }
  };
}

export function regenerateGoldfishGeometry(gl, gfish, newParams) {
    const positions = [];
    const indices = [];
    const colors = [];

    // 1. Call the geometry generation function with the new parameters
    goldfish(
        positions, indices, colors,
        newParams.bodyLength, newParams.bodyHeight, newParams.bodyWidth, newParams.belly_size, newParams.arch,
        newParams.headSize, newParams.eyeType, newParams.mouthTilt,
        newParams.caudalLength, newParams.caudalWidth, newParams.caudalType, newParams.caudalAngle, // ADD caudalAngle
        newParams.dorsalLength, newParams.dorsalWidth, newParams.dorsalShift, newParams.dorsalType,
        newParams.pelvicLength, newParams.pelvicWidth, newParams.pelvicShift, newParams.pelvicAngle, // ADD pelvicAngle
        newParams.pectoralLength, newParams.pectoralWidth, newParams.pectoralShift, newParams.pectoralAngle, // ADD pectoralAngle
        newParams.afinLength, newParams.afinWidth, newParams.afinType, newParams.afinShift, newParams.afinAngle // ADD afinShift, afinAngle
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