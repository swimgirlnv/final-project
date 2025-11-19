import { vs, fs } from "./goldfishShaders.js";
import { CatmullRomSpline3D } from "./SplineVec3.js";

// ---------- BASIC GEOMETRY FUNCTIONS
function create_subdiv_box(positions, indices, colors, subX, subY, subZ, sizeX, sizeY, sizeZ) {
  let currentIndex = positions.length / 3;
  let all_idx = [];

  const buildFace = (
    uAxis, vAxis, wAxis, // 0=X, 1=Y, 2=Z -> Axes of the plane
    uSub, vSub, wSize,   // Subdivisions and size for each axis
    uSize, vSize,        // Total size along U and V axes
    wSign                // +1 or -1 for the face direction (e.g., +Z or -Z)
  ) => {
    const currentStartIdx = currentIndex;

    // Calculate the normal vector for this face
    const normal = [0, 0, 0];
    normal[wAxis] = wSign; // not needed here since we are not shading

    // Iterate over the grid (u and v segments)
    for (let j = 0; j <= vSub; ++j) { // V-axis (height/rows)
      for (let i = 0; i <= uSub; ++i) { // U-axis (width/columns)

        // Calculate the normalized position (0.0 to 1.0)
        const u = i / uSub;
        const v = j / vSub;

        // Calculate the 3D position (x, y, z)
        const pos = [0, 0, 0];
                
        // Position along the U-axis (from -size/2 to +size/2)
        pos[uAxis] = (u - 0.5) * uSize; 
        
        // Position along the V-axis (from -size/2 to +size/2)
        pos[vAxis] = (v - 0.5) * vSize;
        
        // Position along the W-axis (constant depth)
        pos[wAxis] = wSign * wSize / 2;

        // Push data for the current vertex
        positions.push(pos[0], pos[1], pos[2]);
        colors.push(...normal);
        //normals.push(normal[0], normal[1], normal[2]);

        //uvs.push(u, 1 - v);

        if (i < uSub && j < vSub) {
          const base = currentIndex;
          const uSegs = uSub + 1;

          // Quad vertices:
          // v1 (base) --- v2 (base + uSegs)
          //   |             |
          // v3 (base + 1) - v4 (base + uSegs + 1)
          
          const v1 = base;
          const v2 = base + 1;
          const v3 = base + uSegs;
          const v4 = base + uSegs + 1;

          // Triangle 1: v1, v3, v2 (Clockwise order for +Z/-X/-Y faces)
          // If wSign is negative, reverse order for correct culling
          if (wSign > 0) {
              indices.push(v1, v3, v2);
              indices.push(v2, v3, v4);
          } else { // Reverse winding order for back faces
              indices.push(v1, v2, v3);
              indices.push(v2, v4, v3);
          }
        }
        all_idx.push(currentIndex);
        currentIndex++;
      }
    }
    return currentIndex;
  };
    // --- 1. POSITIVE Z FACE (Front) ---
    // Plane is Z-constant, U=X, V=Y.
    buildFace(0, 1, 2, subX, subY, sizeZ, sizeX, sizeY, 1);

    // --- 2. NEGATIVE Z FACE (Back) ---
    // Plane is Z-constant, U=X, V=Y, but normal points backwards (-1).
    buildFace(0, 1, 2, subX, subY, sizeZ, sizeX, sizeY, -1);
    
    // --- 3. POSITIVE X FACE (Right) ---
    // Plane is X-constant, U=Z, V=Y.
    buildFace(2, 1, 0, subZ, subY, sizeX, sizeZ, sizeY, 1);

    // --- 4. NEGATIVE X FACE (Left) ---
    // Plane is X-constant, U=Z, V=Y, but normal points backwards (-1).
    buildFace(2, 1, 0, subZ, subY, sizeX, sizeZ, sizeY, -1);

    // --- 5. POSITIVE Y FACE (Top) ---
    // Plane is Y-constant, U=X, V=Z.
    buildFace(0, 2, 1, subX, subZ, sizeY, sizeX, sizeZ, 1);
    
    // --- 6. NEGATIVE Y FACE (Bottom) ---
    // Plane is Y-constant, U=X, V=Z, but normal points backwards (-1).
    buildFace(0, 2, 1, subX, subZ, sizeY, sizeX, sizeZ, -1);
    
    return all_idx;
}

// Creates ring in a clockwise manner, returns indices of new points
function create_ring(positions, indices, colors, numVerts, radX, radY, translate = {}, color = null) {
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

    if (color == null)
      colors.push(1.0, 0.0, 0.0);
    else
      colors.push(color.r, color.g, color.b);

    newIndices.push(curIndex);
    
    curAngle += radInc;
    ++curIndex;
  }
  
  return newIndices;
}

// extrudes from ring geometry, and creates bridging faces
function extrude_ring(positions, indices, orig_ring_indices, colors, offset, color = null) {
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

        if (color == null)
          colors.push(1.0, 0.0, 0.0);
        else
          colors.push(color.r, color.g, color.b);

        newIndices.push(curExtIdx);
        
        // Triangle 1 (curOrig -> curExt -> nextOrig)
        indices.push(curOrigIdx, curExtIdx, nextOrigIdx);

        // Triangle 2 (nextOrig -> curExt -> nextExt)
        indices.push(nextOrigIdx, curExtIdx, nextExtIdx);
    }
    
    return newIndices;
}

function fill_ring_pole(positions, indices, orig_ring_indices, colors, offset, reverse, color = null) {
  let newIndex = positions.length / 3;
  let newIndices = [newIndex];
  let num_orig = orig_ring_indices.length;

  let avgX = 0.0;
  let avgY = 0.0;
  let avgZ = 0.0;
  for (let i = 0; i < num_orig; ++i) {
    let curOrigIndex = orig_ring_indices[i];
    let nextOrigIndex;
    if (reverse) {
      nextOrigIndex = (i - 1) < 0? orig_ring_indices[num_orig - 1] : orig_ring_indices[(i - 1)];
    }
    else {
      nextOrigIndex = orig_ring_indices[(i + 1) % num_orig];
    }

    // indices for triangulation
    indices.push(
      curOrigIndex,
      newIndex,
      nextOrigIndex
    );

    // get pos data for avg
    avgX += positions[curOrigIndex * 3];
    avgY += positions[curOrigIndex * 3 + 1];
    avgZ += positions[curOrigIndex * 3 + 2];
  }
  avgX /= num_orig; 
  avgY /= num_orig; 
  avgZ /= num_orig;

  positions.push(
    avgX + offset.x,
    avgY + offset.y,
    avgZ + offset.z
  );
  if (color == null)
    colors.push(
      0.0,
      0.0,
      1.0
    );
  else 
    colors.push(color.r, color.g, color.b);
  // return pole index
  return newIndices;
}

function fill_ring_fan(indices, orig_ring_indices, reverse) {
  let num_orig = orig_ring_indices.length;
  let index0 = orig_ring_indices[0];

  for (let i = 1; i < num_orig; ++i) {
    let curOrigIndex = orig_ring_indices[i];
    let nextOrigIndex = orig_ring_indices[(i + 1) % num_orig];

    // indices for triangulation
    if (reverse) {
      indices.push(
        index0,
        nextOrigIndex,
        curOrigIndex
      );
    }
    else {
      indices.push(
        index0,
        nextOrigIndex,
        curOrigIndex
      );
    }
  }
}

function scale_around_point(positions, scaled_verts, origin = {}, scale = {}) {
  for (let i = 0; i < scaled_verts.length; ++i) {
    let idx = scaled_verts[i];
    let origPos = {
      x: positions[idx * 3], 
      y: positions[(idx * 3) + 1], 
      z: positions[(idx * 3) + 2]
    };
    // start with new points in pivot space and apply transform
    let newPos = {
      x: (origPos.x - origin.x) * scale.x,
      y: (origPos.y - origin.y) * scale.y,
      z: (origPos.z - origin.z) * scale.z
    };
    // return to original space
    newPos = {
      x: newPos.x + origin.x,
      y: newPos.y + origin.y,
      z: newPos.z + origin.z
    };

    // set result
    positions[idx * 3] = newPos.x;
    positions[(idx * 3) + 1] = newPos.y;
    positions[(idx * 3) + 2] = newPos.z;
  }

  return;
}

// rot is in radians, axis must be 0 (x), 1 (y), or 2 (z)
// point will be updated by reference
function apply_rotation(point, rot, axis) {
  const originalX = point.x;
  const originalY = point.y;
  const originalZ = point.z;

  const cosRot = Math.cos(rot);
  const sinRot = Math.sin(rot);

  if (axis === 0) {
    // Rotation around X-axis (transforms Y and Z)
    point.y = originalY * cosRot - originalZ * sinRot;
    point.z = originalY * sinRot + originalZ * cosRot;
  }
  else if (axis === 1) {
    // Rotation around Y-axis (transforms X and Z)
    point.x = originalX * cosRot + originalZ * sinRot;
    point.z = originalX * -sinRot + originalZ * cosRot;
  }
  else if (axis === 2) {
    // Rotation around Z-axis (transforms X and Y)
    point.x = originalX * cosRot - originalY * sinRot;
    point.y = originalX * sinRot + originalY * cosRot;
  }
  else { 
    // don't do anything
    console.log("ERROR: invalid axis used: ${axis}");
    return point;
  }
}

function rotate_around_point(positions, rot_verts, origin = {}, rot = {}) {
  let radRot = {x: rot.x * Math.PI / 180.0, y: rot.y * Math.PI / 180.0, z: rot.z * Math.PI / 180.0};

  for (let i = 0; i < rot_verts.length; ++i) {
    let idx = rot_verts[i];
    let origPos = {
      x: positions[idx * 3],
      y: positions[(idx * 3) + 1],
      z: positions[(idx * 3) + 2]
    };
    let newPos = {
      x: origPos.x - origin.x,
      y: origPos.y - origin.y,
      z: origPos.z - origin.z
    };

    // apply transform xyz rot
    apply_rotation(newPos, radRot.x, 0);
    apply_rotation(newPos, radRot.y, 1);
    apply_rotation(newPos, radRot.z, 2);

    // return to original space
    newPos = {
      x: newPos.x + origin.x,
      y: newPos.y + origin.y,
      z: newPos.z + origin.z
    };

    // set result
    positions[idx * 3] = newPos.x;
    positions[(idx * 3) + 1] = newPos.y;
    positions[(idx * 3) + 2] = newPos.z;
  }

  return;
}

function translate(positions, translated_verts, offset) {
  for (let i = 0; i < translated_verts.length; ++i) {
    let idx = translated_verts[i];

    positions[idx * 3] += offset.x;
    positions[(idx * 3) + 1] += offset.y;
    positions[(idx * 3) + 2] += offset.z;
  }
  
  return;  
}

function create_ring_spline(
  positions, indices, colors, 
  num_verts_ring, numRings, 
  posCtrlPts, scaleCtrlPts, 
  endPoleOffset, beginPoleOffset, 
  color = null
) {
  const posPath = new CatmullRomSpline3D(
    posCtrlPts,
    0.5
  );
  const scalePath = new CatmullRomSpline3D(
    scaleCtrlPts,
    0.5
  );

  let all_idx = [];
  let orig_ring;

  let prevPos = [];
  let prevScale = [];
  let prevLoopIdx = [];
  let curLoopIdx = [];
  // check this in the future. i < 1.0 creates wrong scale at the end
  // i < 0.9 fixes this
  for (let i = 0.0; i <= 1.0; i += (1.0 / numRings)) {
    let pos = posPath.getPoint(i);
    let scale = scalePath.getPoint(i);

    // first loop
    if (i < (0.5 / numRings)) {
      curLoopIdx = create_ring(
        positions, indices, colors, num_verts_ring, 
        scale[0], scale[1], {x: pos[0], y: pos[1], z: pos[2]},
        color
      );
      all_idx.push(...curLoopIdx);
      orig_ring = curLoopIdx;
    }
    else {
      // extrude ring to desired position with desired scale
      curLoopIdx = extrude_ring(
        positions, indices, prevLoopIdx, colors,
        {x: pos[0] - prevPos[0], y: pos[1] - prevPos[1], z: pos[2] - prevPos[2]},
        color
      );

      scale_around_point(
        positions, curLoopIdx,
        {x: pos[0], y: pos[1], z: pos[2]},
        {x: scale[0] / prevScale[0], y: scale[1] / prevScale[1], z: scale[2] / prevScale[2]}
      );
      all_idx.push(...curLoopIdx);
    }

    prevLoopIdx = curLoopIdx;
    prevPos = pos;
    prevScale = scale;
  }

  let orig_pole_idx = fill_ring_pole(positions, indices, orig_ring, colors, beginPoleOffset, true, color);
  let end_pole_idx = fill_ring_pole(positions, indices, curLoopIdx, colors, endPoleOffset, true, color);
  all_idx.push(...orig_pole_idx, ...end_pole_idx);
  
  return all_idx;
}

// Debug Tools
function sphere(positions, indices, colors, offset = {}, color = null, size = 1.0) {
  // --- Control Points for Sphere Shape ---
  const NUM_RING_VERTS = 8;
  const NUM_RINGS = 2;

  // The path runs vertically (along the Y-axis)
  const posCtrlPts = [
      [0 + offset.x, 0 + offset.y, 0 + offset.z - 0.0625 * Math.pow(size, 0.5)], // Start control point (top)
      [0 + offset.x, 0 + offset.y, 0.0625 * Math.pow(size, 0.5) + offset.z - 0.0625 * Math.pow(size, 0.5)],   // Equator/center
      [0 + offset.x, 0 + offset.y, 0.13 * Math.pow(size, 0.5) + offset.z - 0.0625 * Math.pow(size, 0.5)]  // End control point (bottom)
  ];

  // The scale profile (Radius for X and Y)
  // Note: Catmull-Rom requires 3 control points for a single segment, or 5+ for a full smooth path.
  // Using 5 points to ensure smooth ramp-up/down.
  const scaleCtrlPts = [
      [0.04 * size, 0.04 * size, 1.0], // Pre-start (near zero radius)
      [0.06 * size, 0.06 * size, 1.0],   // Equator radius
      [0.04 * size, 0.04 * size, 1.0]  // Post-end (near zero radius)
  ];

  // Pole positions (Y-axis)
  const beginPoleOffset = {x: 0.0, y: 0.0, z: -0.02 * size};
  const endPoleOffset = {x: 0.0, y: 0.0, z: 0.02 * size};
  const sphereColor = {r: 0.8, g: 0.2, b: 0.1}; // A reddish color

  // --- Function Call ---
  const sphereIndices = create_ring_spline(
      positions, 
      indices, 
      colors, 
      NUM_RING_VERTS, 
      NUM_RINGS, 
      posCtrlPts, 
      scaleCtrlPts, 
      endPoleOffset, 
      beginPoleOffset, 
      color == null? sphereColor : color
  );
  return sphereIndices;
}

// ---------- GOLDFISH BODY PART GENERATORS. PASS POS/IDX ARRAYS BY REFERENCE FOR UPDATE
function gfish_body(positions, indices, colors, length, height, width, belly, arch, 
    pectoral_pos, pectoralShift, 
    pelvic_pos, pelvicShift, 
    afin_pos, 
    dorsal_pos, dorsalShift, 
    caudal_pos, 
    head_pos  
) {
  // use spline with radius value, interpolate with even rings for body
  let all_idx = [];
  all_idx = create_ring_spline(
    positions, indices, colors,
    8, // num verts in a ring
    10,// num rings in spline
    [  // position spline
      [0.0, 1.0 - arch, 0.0],
      [0.0, 1.02 - (arch * 0.5), length * 0.4],
      [0.0, 1.03, length * 0.7],
      [0.0, 1.035, length]
    ], 
    [  // scale spline
      [width * 0.3, height * 0.5, 1.0],
      [width * 0.45, height, 1.0],
      [width * 0.35, height * 0.52, 1.0],
      [width * 0.2, height * 0.25, 1.0]
    ],
    {x: 0, y: 0, z: 0.0}, //end pole offset
    {x: 0, y: 0, z: -0.025}  //begin pole offset
  );

  caudal_pos = {x: 0.0, y: 1.035, z: length + dorsalShift};
  let caudal_idx = sphere(positions, indices, colors, caudal_pos, {r: 0.0, g: 1.0, b: 0.0}, belly);
  all_idx.push(...caudal_idx);

  head_pos = {x: 0.0, y: 1.0 - arch, z: 0.0};
  let head_idx = sphere(positions, indices, colors, head_pos, {r: 0.0, g: 1.0, b: 0.0}, belly);
  all_idx.push(...head_idx);

  // TODO: create copy of body and pos spline to get positions along body of various fins
  // Also take in "angle" params for pectoral and pelvic fins
  
  // dorsal_pos;
  // dorsalShift

  // afin_pos; 

  // pectoral_pos = {r: {}, l: {}}; 
  // pectoralShift;

  // pelvic_pos = {r: {}, l: {}}; 
  // pelvicShift; 

  
  return all_idx;
}

const eye_types = {
  BULGE: "BULGE",
  GOOGLY: "GOOGLY",
  CHEEKS: "CHEEKS",
  BUBBLY: "BUBBLY" 
};
function gfish_head(positions, indices, colors, size = {}, eyeType, mouthTilt) {
  // ring, extrude while scaling down
  // end cap with special mouth geo function
  eye1_idx = sphere(positions, indices, colors, );
  return;
}

const caudal_types = {
  DROOPY: "DROOPY",
  VSLOPE: "VSLOPE",
  FEATHERY: "FEATHERY",
  VBUTT: "VBUTT",
  BUTTERFLY: "BUTTERFLY"
};
function gfish_caudal(positions, indices, colors, length, width, caudalType) {
  // cube (/loop) with special deformation
  /*let all_idx = create_subdiv_box(
    positions, indices, colors, 
    4, 4, 4, 1, 2, 3
  );*/
  return;
}

const dorsal_types = {
  MANE: "MANE",
  PUNK: "PUNK",
  SWEPT: "SWEPT"
};
function gfish_dorsal(positions, indices, colors, length, width, dorsalType) {
  // cube (/loop) with special deformation, maybe follow spline
  return;
}

function gfish_pelvic(positions, indices, colors, length, width, pos) {
  return;
}

function gfish_pectoral(positions, indices, colors, length, width, pos) {
  // subdiv cube with fun values
  let all_idx = [];
  all_idx = create_ring_spline(
    positions, indices, colors, 
    6, // num verts in a ring 
    4,// num rings in spline
    [  // position spline
      [0.0, 1.0, 0.0],
      [0.0, 1.0, 0.2],
      [0.0, 1.03, 0.3],
      [0.0, 1.0, 0.4]
    ], 
    [  // scale spline
      [0.02, 0.01, 1.0],
      [0.02, 0.01, 1.0],
      [0.07, 0.01, 1.0],
      [0.04, 0.01, 1.0]
    ],
    {x: 0, y: 0, z: 0.03}, //end pole offset
    {x: 0, y: 0, z: 0.0}  //begin pole offset
  );
  return all_idx;
}

const afin_types = {
  SPIKY: "SPIKY",
  FEATHERY: "FEATHERY"
};
function gfish_anal_fin(positions, indices, colors, length, width, afinType, pos) {
  // same as dorsal, but smaller and probably less variety (all references looked the same here)
  return;
}

function goldfish(
    positions, indices, colors,
    // body params 
    bodyLength, bodyHeight, bodyWidth, belly_size, arch,
    // head params
    headSize, eyeType, mouthTilt,
    // caudal params
    caudalLength, caudalWidth, caudalType,
    // dorsal params
    dorsalLength, dorsalWidth, dorsalShift, dorsalType,
    // pelvic params
    pelvicLength, pelvicWidth, pelvicShift,
    // pectoral params
    pectoralLength, pectoralWidth, pectoralShift,
    // afin params
    afinLength, afinWidth, afinType
  ) {
  let pectoral_pos = {r: {x: 0.0, y: 0.0, z: 0.0}, l: {x: 0.0, y: 0.0, z: 0.0}};
  let pelvic_pos = {r: {x: 0.0, y: 0.0, z: 0.0}, l: {x: 0.0, y: 0.0, z: 0.0}};
  let afin_pos = {x: 0.0, y: 0.0, z: 0.0};
  let dorsal_pos = {x: 0.0, y: 0.0, z: 0.0};
  let caudal_pos = {x: 0.0, y: 0.0, z: 0.0};
  let head_pos = {x: 0.0, y: 0.0, z: 0.0};

  gfish_body(
    positions, indices, colors, 
    bodyLength, bodyHeight, bodyWidth, belly_size, arch,
    pectoral_pos, pectoralShift, 
    pelvic_pos, pelvicShift, 
    afin_pos, 
    dorsal_pos, dorsalShift, 
    caudal_pos, 
    head_pos  
  );
  // gfish_head(positions, indices, colors, headSize, eyeType, mouthTilt);
  // gfish_caudal(positions, indices, colors, caudalLength, caudalWidth, caudalType);
  // gfish_dorsal(positions, indices, colors, dorsalLength, dorsalWidth, dorsalType);
  // gfish_pelvic(positions, indices, colors, pelvicLength, pelvicWidth, pelvic_pos);
  // gfish_pectoral(positions, indices, colors, pectoralLength, pectoralWidth, pectoral_pos);
  // gfish_anal_fin(positions, indices, colors, afinLength, afinWidth, afinType, afin_pos);
  return;
}

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
    0.5, 0.5, 1.0, 1.0, 0.0,
    // head params
    {x: 1.0, y: 1.0}, eye_types.GOOGLY, 0.5,
    // caudal params
    1.0, 1.0, caudal_types.BUTTERFLY,
    // dorsal params
    1.0, 1.0, 0.0, dorsal_types.PUNK,
    // pelvic params
    1.0, 1.0, 0.0,
    // pectoral params
    1.0, 1.0, 0.0,
    // afin params
    1.0, 1.0, afin_types.FEATHERY
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
        pelvicLength: 1.0, pelvicWidth: 1.0, pelvicShift: 0.0,
        pectoralLength: 1.0, pectoralWidth: 1.0, pectoralShift: 0.0,
        afinLength: 1.0, afinWidth: 1.0, afinType: afin_types.FEATHERY
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
        newParams.caudalLength, newParams.caudalWidth, newParams.caudalType,
        newParams.dorsalLength, newParams.dorsalWidth, newParams.dorsalShift, newParams.dorsalType,
        newParams.pelvicLength, newParams.pelvicWidth, newParams.pelvicShift,
        newParams.pectoralLength, newParams.pectoralWidth, newParams.pectoralShift,
        newParams.afinLength, newParams.afinWidth, newParams.afinType
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
  
  /*
  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.FRONT);

  const prog = makeProgram(gl, vs, fs, {vs_Pos : 0, vs_Col : 1, });
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

  let isDragging = false;
  let lastX = 0;
  let lastY = 0;

  canvas.addEventListener('mousedown', (e) => {
    isDragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
  });

  canvas.addEventListener('mouseup', () => {
    isDragging = false;
  });

  canvas.addEventListener('mousemove', (e) => {
    if (!isDragging) return;

    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;

    const sensitivity = 0.005;

    camera.azimuth -= dx * sensitivity;
    camera.elevation -= dy * sensitivity;
    // Clamp elevation
    camera.elevation = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, camera.elevation));

    lastX = e.clientX;
    lastY = e.clientY;
  });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    camera.radius += e.deltaY * 0.01;
    camera.radius = Math.max(1.0, camera.radius); // Min radius
  });

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

    updateViewMatrix(camera, viewMatrix);

    // Uniforms
    const proj = makeProjection(canvas.width / canvas.height, 1);
    //const view = identity();

    gl.useProgram(prog);
    gl.bindVertexArray(gfish.vao);

    gl.uniformMatrix4fv(u_proj, false, proj);
    gl.uniformMatrix4fv(u_view, false, viewMatrix);
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
  */
}