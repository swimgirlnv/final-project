import { vs, fs } from "./goldfishShaders.js";
import { goldfish, eye_types, afin_types, caudal_types, dorsal_types } from "./goldfishGeo.js";

/*
Stephen Gavin Sears
Commented 11/28/2025
goldfish.js uses the functions defined in goldfishGeo.js to create geometry
for custom fish, then pass information to the GPU for rendering. This file
contains the functions used in main.js to render fish.

Things to note:
- Whenever a Map is used to define a three dimensional point, we are assuming
  an object defined as follows:
  let examplePoint = {x: <xVal>, y: <yVal>, z: <zVal>};
  this pattern will generally be used for any three dimensional points in this file 
  (but notably not in some other files, like splineVec3).
 */

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

// Helper to create instance buffers (style of grassShaders.js)
function mkInstanceBuffers(gl, bindings, maxInstances) {
  function mk(loc, comps = 1) {
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, maxInstances * comps * 4, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, comps, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(loc, 1); // 1 step per instance
    return b;
  }

  // Define buffers based on requested instance attributes
  // i_pos(3), i_rotY(1), i_size(1), i_speed(1), i_colorVar(1)
  const bufs = {
    pos: mk(bindings.i_pos, 3),
    rotY: mk(bindings.i_rotY, 1),
    size: mk(bindings.i_size, 1),
    speed: mk(bindings.i_speed, 1),
    colorVar: mk(bindings.i_colorVar, 1),
    count: 0,
  };

  return {
    ...bufs,
    // Data expected to be an object with arrays: { pos:[], rotY:[], size:[], speed:[], colorVar:[], count: N }
    update(data) {
      gl.bindBuffer(gl.ARRAY_BUFFER, bufs.pos);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(data.pos));

      gl.bindBuffer(gl.ARRAY_BUFFER, bufs.rotY);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(data.rotY));

      gl.bindBuffer(gl.ARRAY_BUFFER, bufs.size);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(data.size));

      gl.bindBuffer(gl.ARRAY_BUFFER, bufs.speed);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(data.speed));

      gl.bindBuffer(gl.ARRAY_BUFFER, bufs.colorVar);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(data.colorVar));

      this.count = data.count;
    },
  };
}

// ---------- Geometry: Calls on fcns for head, body, caudal fin, dorsal fin, pectoral fin, pelvic fin, anal fin
function createFishGeometry(gl, instanceBindings) {
  const positions = [];
  const indices = [];
  const colors = [];
  const labels = [];
  const pivots = [];

  // Default parameters
  goldfish(
    positions, indices, colors, labels, pivots,
    1.35, 0.6, 0.7, 0.0, // Body
    {x: 0.4, y: 0.4, z: 0.4}, eye_types.GOOGLY, 0.0, 1.0, // Head
    0.75, 0.8, caudal_types.DROOPY, 1.0, // Caudal
    0.4, 0.35, 0.49, dorsal_types.PUNK, // Dorsal
    0.45, 1.0, 0.55, -0.5, // Pelvic
    0.38, 1.05, 0.2, -0.35, // Pectoral
    0.2, 0.1, afin_types.SPIKY, 0.68 // Afin
  );

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  
  // Standard Geometry Attributes
  const vs_Pos_loc = 0;
  const vs_Col_loc = 1;
  const vs_Label_loc = 2;
  const vs_Pivot_loc = 3;

  const posBuffer = gl.createBuffer();
  const colorBuffer = gl.createBuffer();
  const labelBuffer = gl.createBuffer();
  const pivotBuffer = gl.createBuffer();
  const ibo = gl.createBuffer();
  
  function setupBuffer(buffer, data, attribLoc, size, type = gl.FLOAT, usage = gl.DYNAMIC_DRAW) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), usage);
    gl.enableVertexAttribArray(attribLoc);
    gl.vertexAttribPointer(attribLoc, size, type, false, 0, 0);
  }

  setupBuffer(posBuffer, positions, vs_Pos_loc, 3);
  setupBuffer(colorBuffer, colors, vs_Col_loc, 3);
  
  gl.bindBuffer(gl.ARRAY_BUFFER, labelBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Int32Array(labels), gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(vs_Label_loc);
  gl.vertexAttribIPointer(vs_Label_loc, 1, gl.INT, 0, 0);

  setupBuffer(pivotBuffer, pivots, vs_Pivot_loc, 3);

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.DYNAMIC_DRAW);

  // Initialize Instance Buffers on this VAO
  // We allocate space for, say, 2000 fish. Adjust as needed.
  const inst = mkInstanceBuffers(gl, instanceBindings, 2000);

  return {
    vao,
    posBuffer,
    colorBuffer,
    labelBuffer,
    pivotBuffer,
    ibo,
    inst, // Reference to instance buffers manager
    count: indices.length, 
    
    // Store params for regeneration
    params: {
      bodyLength: 1.35, bodyHeight: 0.6, bodyWidth: 0.7, arch: 0.0,
      headSize: {x: 0.4, y: 0.4, z: 0.4}, eyeType: eye_types.GOOGLY, mouthTilt: 0.0, eyeSize: 1.0,
      caudalLength: 0.75, caudalWidth: 0.8, caudalType: caudal_types.DROOPY, caudalCurve: 1.0,
      dorsalLength: 0.4, dorsalWidth: 0.35, dorsalShift: 0.49, dorsalType: dorsal_types.PUNK,
      pelvicLength: 0.45, pelvicWidth: 1.0, pelvicShift: 0.55, pelvicAngle: -0.5,
      pectoralLength: 0.38, pectoralWidth: 1.05, pectoralShift: 0.2, pectoralAngle: -0.35,
      afinLength: 0.2, afinWidth: 0.1, afinType: afin_types.SPIKY, afinShift: 0.68
    }
  };
}

export function regenerateGoldfishGeometry(gl, gfish, newParams) {
    const positions = [];
    const indices = [];
    const colors = [];
    const labels = [];
    const pivots = [];

    goldfish(
        positions, indices, colors, labels, pivots,
        newParams.bodyLength, newParams.bodyHeight, newParams.bodyWidth, newParams.arch,
        newParams.headSize, eye_types.GOOGLY, newParams.mouthTilt, newParams.eyeSize,
        newParams.caudalLength, newParams.caudalWidth, caudal_types.DROOPY, newParams.caudalCurve,
        newParams.dorsalLength, newParams.dorsalWidth, newParams.dorsalShift, dorsal_types.PUNK,
        newParams.pelvicLength, newParams.pelvicWidth, newParams.pelvicShift, newParams.pelvicAngle,
        newParams.pectoralLength, newParams.pectoralWidth, newParams.pectoralShift, newParams.pectoralAngle,
        newParams.afinLength, newParams.afinWidth, afin_types.SPIKY, newParams.afinShift
    );

    gl.bindVertexArray(gfish.vao);

    gl.bindBuffer(gl.ARRAY_BUFFER, gfish.posBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.DYNAMIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, gfish.colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.DYNAMIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, gfish.labelBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Int32Array(labels), gl.DYNAMIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, gfish.pivotBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pivots), gl.DYNAMIC_DRAW);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gfish.ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.DYNAMIC_DRAW);
    
    gfish.count = indices.length;
    gfish.params = newParams;
    gl.bindVertexArray(null);
}

// ---------- Main initialization and animation export
export function createGoldfish(gl) {
    const bindings = {
      // Geometry attributes
      vs_Pos: 0,
      vs_Col: 1,
      vs_Label: 2,
      vs_Pivot: 3,
      // Instance attributes
      i_pos: 4,      // vec3
      i_rotY: 5,     // float
      i_size: 6,     // float
      i_speed: 7,    // float
      i_colorVar: 8  // float (0..1)
    };

    const prog = makeProgram(gl, vs, fs, bindings);
    
    // Pass bindings so the VAO knows where to attach instance buffers
    const gfish = createFishGeometry(gl, bindings); 
    
    // Uniforms
    const U = (n) => gl.getUniformLocation(prog, n);
    const u_proj = U("u_proj"),
      u_view = U("u_view"),
      u_time = U("u_time"),
      u_res = U("u_res");
    const u_fogColor = U("u_fogColor");
    const u_fogNear = U("u_fogNear");
    const u_fogFar = U("u_fogFar");
  
    return {
      geometry: gfish,

      // data = { pos: [x,y,z...], rotY: [...], size: [...], speed: [...], colorVar: [...], count: N }
      updateInstances(data) {
        // We just delegate to the instance manager created in createFishGeometry
        gfish.inst.update(data);
      },

      draw(shared) {
        // If no instances, don't draw
        if (gfish.inst.count === 0) return;

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

        // Draw instanced
        // gfish.count = indices count of mesh
        // gfish.inst.count = number of fish instances
        gl.drawElementsInstanced(
          gl.TRIANGLES,
          gfish.count,
          gl.UNSIGNED_SHORT,
          0,
          gfish.inst.count
        );
      }
    };
}