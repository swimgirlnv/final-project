import { CatmullRomSpline3D } from "./splineVec3.js";
import { addVec, scaleVec } from "./linearTools.js";

export function getCentroid(positions, indices) {
    if (!indices || indices.length === 0) return { x: 0, y: 0, z: 0 };

    let sumX = 0;
    let sumY = 0;
    let sumZ = 0;

    for (let i = 0; i < indices.length; i++) {
        let idx = indices[i];
        sumX += positions[idx * 3];
        sumY += positions[idx * 3 + 1];
        sumZ += positions[idx * 3 + 2];
    }

    let count = indices.length;
    
    return {
        x: sumX / count,
        y: sumY / count,
        z: sumZ / count
    };
}

export function getPos(pidx, positions) {
    return { x: positions[pidx*3], y: positions[pidx*3+1], z: positions[pidx*3+2] };
}

// Calculates the approximate center and forward direction of a ring
export function getRingData(positions, ring_indices) {
    let centerSum = {x:0, y:0, z:0};
    for(let idx of ring_indices) {
        centerSum = addVec(centerSum, getPos(idx, positions));
    }
    let center = scaleVec(centerSum, 1.0 / ring_indices.length);

    // Estimate forward direction using average normal of the plane
    // (Simplified: assuming the ring generally faces Z for the goldfish context. 
    // A more robust version would calculate the average cross product of edges).
    let forward = {x: 0, y: 0, z: 1}; 

    return { center, forward };
}

// ---------- BASIC GEOMETRY FUNCTIONS
export function create_subdiv_box(positions, indices, colors, subX, subY, subZ, sizeX, sizeY, sizeZ) {
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
export function create_ring(positions, indices, colors, numVerts, radX, radY, translate = {}, color = null) {
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
export function extrude_ring(positions, indices, orig_ring_indices, colors, offset, color = null) {
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
        indices.push(curOrigIdx, nextOrigIdx, curExtIdx);

        // Triangle 2 (nextOrig -> curExt -> nextExt)
        indices.push(nextOrigIdx, nextExtIdx, curExtIdx);
    }
    
    return newIndices;
}

export function fill_ring_pole(positions, indices, orig_ring_indices, colors, offset, reverse, color = null) {
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

export function fill_ring_fan(indices, orig_ring_indices, reverse) {
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

export function scale_around_point(positions, scaled_verts, origin = {}, scale = {}) {
  // 1. Sanitize Scale Input (Handle Array vs Object)
  let sx, sy, sz;
  if (Array.isArray(scale)) {
      sx = scale[0] ?? 1.0;
      sy = scale[1] ?? 1.0;
      sz = scale[2] ?? 1.0;
  } else {
      sx = scale.x ?? 1.0;
      sy = scale.y ?? 1.0;
      sz = scale.z ?? 1.0;
  }

  // 2. Sanitize Origin Input
  let ox = origin.x ?? 0.0;
  let oy = origin.y ?? 0.0;
  let oz = origin.z ?? 0.0;

  for (let i = 0; i < scaled_verts.length; ++i) {
    let idx = scaled_verts[i];
    
    // Read Original
    let px = positions[idx * 3];
    let py = positions[(idx * 3) + 1];
    let pz = positions[(idx * 3) + 2];

    // Transform: (Pos - Origin) * Scale + Origin
    let nx = (px - ox) * sx + ox;
    let ny = (py - oy) * sy + oy;
    let nz = (pz - oz) * sz + oz;

    // Write Back
    positions[idx * 3] = nx;
    positions[(idx * 3) + 1] = ny;
    positions[(idx * 3) + 2] = nz;
  }
}

// rot is in radians, axis must be 0 (x), 1 (y), or 2 (z)
// point will be updated by reference
export function apply_rotation(point, rot, axis) {
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

export function rotate_around_point(positions, rot_verts, origin = {}, rot = {}) {
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

export function translate(positions, translated_verts, offset) {
  for (let i = 0; i < translated_verts.length; ++i) {
    let idx = translated_verts[i];

    positions[idx * 3] += offset.x;
    positions[(idx * 3) + 1] += offset.y;
    positions[(idx * 3) + 2] += offset.z;
  }
  
  return;  
}

export function create_ring_spline(
  positions, indices, colors, 
  num_verts_ring, numRings, 
  posCtrlPts, scaleCtrlPts, 
  endPoleOffset, beginPoleOffset, 
  color = null, fillEndPole = true, fillStartPole = true
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
  let prevScale = [1.0, 1.0, 1.0];
  let prevLoopIdx = [];
  let curLoopIdx = [];
  // check this in the future. i < 1.0 creates wrong scale at the end
  // i < 0.9 fixes this
  for (let i = 0; i < numRings; ++i) {
    let t = i / numRings;
    let pos = posPath.getPoint(Math.max(t, 0.0));
    let scale = scalePath.getPoint(Math.min(t, 1.0));

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

  if (fillStartPole)
  {
    let orig_pole_idx = fill_ring_pole(positions, indices, orig_ring, colors, beginPoleOffset, false, color);
    all_idx.push(...orig_pole_idx);
  }
  if (fillEndPole) 
  {
    let end_pole_idx = fill_ring_pole(positions, indices, curLoopIdx, colors, endPoleOffset, true, color);
    all_idx.push(...end_pole_idx);
  }
  
  return all_idx;
}

// Debug Tools
export function sphere(positions, indices, colors, offset = {}, color = null, size = 1.0) {
  // --- Control Points for Sphere Shape ---
  const NUM_RING_VERTS = 8;
  const NUM_RINGS = 3;

  // The path runs vertically (along the Y-axis)
  const posCtrlPts = [
      [0 + offset.x, 0 + offset.y, 0 + offset.z - 0.0625 * Math.pow(2.0, 0.5)], // Start control point (top)
      [0 + offset.x, 0 + offset.y, 0.0625 * Math.pow(2.0, 0.5) + offset.z - 0.0625 * Math.pow(2.0, 0.5)],   // Equator/center
      [0 + offset.x, 0 + offset.y, 0.13 * Math.pow(2.0, 0.5) + offset.z - 0.0625 * Math.pow(2.0, 0.5)]  // End control point (bottom)
  ];

  // The scale profile (Radius for X and Y)
  // Note: Catmull-Rom requires 3 control points for a single segment, or 5+ for a full smooth path.
  // Using 5 points to ensure smooth ramp-up/down.
  const scaleCtrlPts = [
      [0.04 * 2.0, 0.04 * 2.0, 1.0], // Pre-start (near zero radius)
      [0.06 * 2.0, 0.06 * 2.0, 1.0],   // Equator radius
      [0.02 * 2.0, 0.02 * 2.0, 1.0]  // Post-end (near zero radius)
  ];

  // Pole positions (Y-axis)
  const beginPoleOffset = {x: 0.0, y: 0.0, z: -0.02 * 2.0};
  const endPoleOffset = {x: 0.0, y: 0.0, z: 0.02 * 2.0};
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
  //scale_around_point(positions, sphereIndices, offset, {x: size, y: size, z: size});
  return sphereIndices;
}