import { vs, fs } from "./goldfishShaders.js";

// ---------- Utilities
function createGL(canvas) {
  const gl = canvas.getContext("webgl2", { antialias: true, alpha: false });
  if (!gl) throw new Error("WebGL2 not supported");
  return gl;
}

function compile(gl, type, source) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, source);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(sh) || "Shader compile error");
  }
  return sh;
}

function program(gl, vsSrc, fsSrc, attributeBindings = {}) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vsSrc));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fsSrc));

  // bind attribute locations:
  for (const [location, name] of Object.entries(attributeBindings)) {
    gl.bindAttribLocation(p, location, name);
  }

  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(p) || "Program link error");
  }
  return p;
}

function resizeCanvasToDisplaySize(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.floor(canvas.clientWidth * dpr);
  const height = Math.floor(canvas.clientHeight * dpr);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    return true;
  }
  return false;
}

// ---------- BASIC GEOMETRY FUNCTIONS
// Creates ring in a clockwise manner, returns indices of new points
function create_ring(positions, indices, colors, numVerts, radX, radY, translate = {}) {
  let PI2 = Math.PI * 2.0;
  let radInc = PI2 / numVerts;
  let curAngle = 0.0;

  let curIndex = (positions.length / 3);
  let newIndices = [];
  
  for (let i = 0; i < numVerts; ++i) {
    
    let x = Math.cos(curAngle) * radX;
    let y = Math.sin(curAngle) * radY;
    positions.push(
      x + translate.x, 
      y + translate.y, 
      translate.z
    );

    colors.push(1.0, 0.0, 0.0);
    
    newIndices.push(curIndex);
    
    curAngle += radInc;
    ++curIndex;
  }
  
  return newIndices;
}

// extrudes from ring geometry, and creates bridging faces
function extrude_ring(positions, indices, orig_ring_indices, colors, offset) {
    let numSegments = orig_ring_indices.length;
    let startNewIndex = positions.length / 3; // Index of the first NEW vertex
    let newIndices = [];
    
    for (let i = 0; i < numSegments; ++i) {

        let curOrigIdx = orig_ring_indices[i];
        let nextOrigIdx = orig_ring_indices[(i + 1) % numSegments]; // The next original index (wraps to 0)

        let curExtIdx = startNewIndex + i;
        let nextExtIdx = startNewIndex + ((i + 1) % numSegments); // The next extruded index (wraps to startNewIndex)

        let origPoint = {
            x: positions[curOrigIdx * 3],
            y: positions[curOrigIdx * 3 + 1],
            z: positions[curOrigIdx * 3 + 2]
        };

        positions.push(
            origPoint.x + offset.x, 
            origPoint.y + offset.y, 
            origPoint.z + offset.z
        );

        colors.push(1.0, 0.0, 0.0);
        newIndices.push(curExtIdx);
        
        // Triangle 1 (curOrig -> curExt -> nextOrig)
        indices.push(curOrigIdx, curExtIdx, nextOrigIdx);

        // Triangle 2 (nextOrig -> curExt -> nextExt)
        indices.push(nextOrigIdx, curExtIdx, nextExtIdx);
    }
    
    return newIndices;
}

// ---------- GOLDFISH BODY PART GENERATORS. PASS POS/IDX ARRAYS BY REFERENCE FOR UPDATE
function gfish_head(positions, indices, colors) {
  return;
}

function gfish_body(positions, indices, colors) {
  return;
}

function gfish_caudal(positions, indices, colors) {
  return;
}

function gfish_dorsal(positions, indices, colors) {
  return;
}

function gfish_pectoral(positions, indices, colors) {
  return;
}

function gfish_anal_fin(positions, indices, colors) {
  return;
}

// ---------- Geometry: Calls on fcns for head, body, caudal fin, dorsal fin, pectoral fin, pelvic fin, anal fin, colors(?)
function createFishGeometry(gl) {
  const positions = [];
  //const uvs = []; // probably will not use these for fish. Will instead opt for 3D noise functions and solid coloring
  const indices = [];
  const colors = [];

  // call functions to create geo
  /*
  positions.push(0.5, 3.0, 1.0);
  positions.push(-0.5, 3.0, 1.0);
  positions.push(-0.5, 1.0, 0.0);
  positions.push(0.5, 1.0, 0.0);

  indices.push(0, 1, 3);
  indices.push(3, 1, 2);

  colors.push(1.0, 0.0, 0.0);
  colors.push(0.0, 1.0, 0.0);
  colors.push(0.0, 0.0, 1.0);
  colors.push(1.0, 0.0, 0.0);*/

  let orig_idx = create_ring(positions, indices, colors, 8, 1.0, 1.0, {x: -0.5, y: 1.0, z: 3.0});
  let extruded_idx = extrude_ring(positions, indices, orig_idx, colors, {x: -1.0, y: 1.0, z: 4.0});

  // end functions to create geo

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  
  function buf(data, attrib, size, type = gl.FLOAT, divisor = 0) {
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
    const loc = attrib;
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, type, false, 0, 0);
    if (divisor) gl.vertexAttribDivisor(loc, divisor);
    return b;
  }

  // Attribute locations (hard-coded to match shader order)
  const vs_Pos_loc = 0;
  const vs_Col_loc = 1;

  gl.bindVertexArray(vao);
  buf(positions, vs_Pos_loc, 3);
  buf(colors, vs_Col_loc, 3);

  const ibo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(
    gl.ELEMENT_ARRAY_BUFFER,
    new Uint16Array(indices),
    gl.STATIC_DRAW
  );

  return {
    vao,
    count: indices.length,
    attribs: {
      vs_Pos_loc,
      vs_Col_loc
    },
  };
}

// ---------- Camera/Projection helpers
function makeProjection(width, height) {
  const aspect = width / height;
  const scale = 1.6; // zoom
  const left = -aspect * scale;
  const right = aspect * scale;
  const bottom = 0.0;
  const top = 2.0 * scale;
  const near = -10,
    far = 10;
  const proj = [
    2 / (right - left),
    0,
    0,
    0,
    0,
    2 / (top - bottom),
    0,
    0,
    0,
    0,
    -2 / (far - near),
    0,
    -(right + left) / (right - left),
    -(top + bottom) / (top - bottom),
    -(far + near) / (far - near),
    1,
  ];
  return proj;
}

function identity() {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

function randRange(a, b) {
  return a + Math.random() * (b - a);
}

// ---------- Main initialization and animation export
export function initGoldfish() {
  const canvas = document.getElementById("gl");
  const gl = createGL(canvas);

  const prog = program(gl, vs, fs, {0: "vs_Pos", 1: "vs_Col"});
  gl.useProgram(prog);

  // Bind attribute locations explicitly to match our VAO setup
  gl.bindAttribLocation(prog, 0, "vs_Pos");
  gl.bindAttribLocation(prog, 1, "vs_Col");
  
  const gfish = createFishGeometry(gl);

  const instancesMax = 1000;
  //const instanceBufs = createInstanceBuffers(gl, blade.attribs, instancesMax);

  // Uniforms
  const getU = (name) => gl.getUniformLocation(prog, name);
  const u_proj = getU("u_proj");
  const u_view = getU("u_view");
  const u_time = getU("u_time");
  const u_res = getU("u_res");

  // ---------- Interaction - just testing fish rn, so this can be excluded
  const plantCount = document.getElementById("plantCount");
  const plantCountLabel = document.getElementById("plantCountLabel");
  const currentStrength = document.getElementById("currentStrength");
  const currentAngle = document.getElementById("currentAngle");
  const flex = document.getElementById("flex");
  const heightAvg = document.getElementById("height");
  const scatterBtn = document.getElementById("scatter");
  const fpsEl = document.getElementById("fps");
  /*
  function updateCountLabel() {
    plantCountLabel.textContent = String(state.count);
  }
  updateCountLabel();

  plantCount.addEventListener("input", (e) => {
    state.count = parseInt(plantCount.value, 10);
    updateCountLabel();
    scatterPlants();
  });
  currentStrength.addEventListener(
    "input",
    (e) => (state.currentStrength = parseFloat(currentStrength.value))
  );
  currentAngle.addEventListener(
    "input",
    (e) => (state.currentAngle = parseFloat(currentAngle.value))
  );
  flex.addEventListener("input", (e) => (state.flex = parseFloat(flex.value)));
  heightAvg.addEventListener("input", (e) => {
    state.avgHeight = parseFloat(heightAvg.value);
    scatterPlants();
  });
  scatterBtn.addEventListener("click", scatterPlants);

  // Mouse pushes
  let mouse = { x: 0, y: 0, down: false };
  canvas.addEventListener("pointermove", (e) => {
    const rect = canvas.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    // map to world-ish units
    mouse.x = (nx - 0.5) * 3.2;
    mouse.y = (1.0 - ny) * 3.2;
  });
  canvas.addEventListener("pointerdown", () => (mouse.down = true));
  canvas.addEventListener("pointerup", () => (mouse.down = false));
  
  // Click near left edge to 'plant' a clump
  canvas.addEventListener("click", (e) => {
    const rect = canvas.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    if (nx < 0.15) {
      // add ~10 plants in a clump at the bottom-left
      const cx = -1.6 + Math.random() * 0.1;
      const cz = -0.3 + Math.random() * 0.2;
      for (let i = 0; i < 10 && state.count < instancesMax; i++) {
        state.base.push(cx + randRange(-0.15, 0.15), cz + randRange(-0.1, 0.1));
        state.height.push(
          randRange(0.5 * state.avgHeight, 1.6 * state.avgHeight)
        );
        state.phase.push(Math.random() * 6.2831);
        state.amp.push(randRange(0.05, 0.25));
        state.hue.push(randRange(0.28, 0.42));
        state.count++;
      }
      plantCount.value = String(state.count);
      updateCountLabel();
      instanceBufs.update(gl, state);
    }
  });
  */
  // ---------- Render loop
  gl.enable(gl.DEPTH_TEST);
  gl.clearColor(0.02, 0.07, 0.13, 1);

  let lastTime = performance.now();
  let frames = 0;
  let fpsTimer = 0;

  function render() {
    requestAnimationFrame(render);
    const now = performance.now();
    const dt = (now - lastTime) / 1000;
    lastTime = now;

    // FPS display
    frames++;
    fpsTimer += dt;
    if (fpsTimer >= 0.5) {
      const fps = Math.round(frames / fpsTimer);
      fpsEl.textContent = String(fps);
      frames = 0;
      fpsTimer = 0;
    }

    // Resize
    const resized = resizeCanvasToDisplaySize(canvas);
    gl.viewport(0, 0, canvas.width, canvas.height);

    // Background gradient to simulate depth
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Compute current vector from UI + mouse push
    //let dir = [Math.cos(state.currentAngle), Math.sin(state.currentAngle)];
    // if mouse is down, make current flow away from the cursor
    /*
    if (mouse.down) {
      // from mouse to center (0, 0 in world XZ)
      const vx = -mouse.x;
      const vz = -(mouse.y - 0.0);
      const len = Math.hypot(vx, vz) || 1.0;
      dir = [vx / len, vz / len];
    }
    */

    // Uniforms
    const proj = makeProjection(canvas.width / canvas.height, 1);
    const view = identity();

    gl.useProgram(prog);
    gl.bindVertexArray(gfish.vao);

    gl.uniformMatrix4fv(u_proj, false, proj);
    gl.uniformMatrix4fv(u_view, false, view);
    gl.uniform1f(u_time, now * 0.001);
    gl.uniform2f(u_res, canvas.width, canvas.height);

    // Draw
    gl.drawElementsInstanced(
      gl.TRIANGLES,
      gfish.count,
      gl.UNSIGNED_SHORT,
      0,
      1
    );
  }
  render();
}