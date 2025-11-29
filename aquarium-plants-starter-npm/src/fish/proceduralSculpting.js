import { CatmullRomSpline3D } from "./splineVec3.js";
import { addVec, scaleVec } from "./linearTools.js";
/*
Stephen Gavin Sears
Commented 11/28/2025
This file contains procedural modeling tools used to define the geometry
used to create the fish in this project.
Split into three groups based on how functions interact with geometry, 
ordered by relative complexity.
1 - information collection
2 - modify geometry
3 - generate geometry

Things to note:
- Whenever a Map is used to define a three dimensional point, we are assuming
  an object defined as follows:
  let examplePoint = {x: <xVal>, y: <yVal>, z: <zVal>};
  this pattern will generally be used for any three dimensional points in this file 
  (but notably not in some other files, like splineVec3).
- Most functions will take in parameters such as 
  positions, indices, colors, labels, that have values pushed to them. These are arrays
  that we pass into the array buffer with information about the geometry.
 */

// 1: FUNCTIONS THAT COLLECT INFORMATION ABOUT GEOMETRY --------------------------------------------

/**
 * Scales all vertices in idx_list on defined axis based on distance to an origin in another axis
 * @param {Number} pidx - index of point we want to find
 * @param {Array<Number} positions - Array containing position data for vertices
 * @returns {Map<Number>} pos - position associated with pidx
 */
export function getPos(pidx, positions) {
    return { x: positions[pidx*3], y: positions[pidx*3+1], z: positions[pidx*3+2] };
}

/**
 * Scales all vertices in idx_list on defined axis based on distance to an origin in another axis
 * @param {Array<Number>} positions - Array containing position data for vertices
 * @param {Array<Number} indices - Indices of vertices we want to find centroid of
 * @returns {Map<Number>} centroid - median point of input geometry
 */
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

/**
 * Calculates the approximate center and forward direction of a ring of vertices
 * @param {Array<Number} positions - Array containing position data for vertices
 * @returns {Array<Number>} ring_indices - indices associated with vertex ring
 */
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

// 2: FUNCTIONS THAT MODIFY EXISTING GEOMETRY ------------------------------------------------------

/**
 * Translates specified points
 * @param {Array<Number>} positions - Array containing position data for vertices
 * @param {Number} translated_verts - Indices in positions array of vertices we want to transform
 * @param {Map<Number>} offset - xyz translation values
 */
export function translate(positions, translated_verts, offset = {x: 0.0, y: 0.0, z: 0.0}) {
  for (let i = 0; i < translated_verts.length; ++i) {
    let idx = translated_verts[i];

    positions[idx * 3] += offset.x;
    positions[(idx * 3) + 1] += offset.y;
    positions[(idx * 3) + 2] += offset.z;
  }
}

/**
 * Scales specified points based on an origin
 * @param {Array<Number>} positions - Array containing (all) index data for vertices
 * @param {Array<Number>} scaled_verts - Array containing index data for ring of vertices we are filling
 * @param {Map<Number>} origin - origin of the coordinate system we are scaling in. World origin by default
 * @param {Map<Number>} scale - xyz scale that we apply to vertices. Leaves geometry unaffected by default
 */
export function scale_around_point(positions, scaled_verts, origin = {x: 0.0, y: 0.0, z: 0.0}, scale = {x: 1.0, y: 1.0, z: 1.0}) {
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

/**
 * Rotates 3D point passed by reference into function
 * @param {Map<Number>} point - point that we transform and pass by reference
 * @param {Number} rot - rotation in radians
 * @param {Map<Number>} axis - Axis that we want to rotate on (0 = x, 1 = y, 2 = z)
 */
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
  }
}

/**
 * Rotates specified list of vertices in global xyz order (zMat * yMat * xMat * Point)
 * @param {Array<Number>} positions - Array containing position data for vertices
 * @param {Number} rot_verts - Indices in positions array of vertices we want to transform
 * @param {Map<Number>} origin - Origin of coordinate system we are applying rotation in
 * @param {Map<Number>} rot - x, y, and z rotations we want to apply to vertices (in degrees)
 */
export function rotate_around_point(positions, rot_verts, origin = {x: 0.0, y: 0.0, z: 0.0}, rot = {x: 0.0, y: 0.0, z: 0.0}) {
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
}

/**
 * Scales all vertices in idx_list on defined axis based on distance to an origin in another axis
 * @param {Array<Number>} positions - Array containing position data for vertices
 * @param {Array<Number} idx_list - Indices of vertices we want to transform
 * @param {Number} amount - Value that scales the bend effect
 * @param {Map<Number>} origin - Map containing a 3D point (x, y, and z keys)
 * @param {Number} maxLength - Value that constrains the magnitude of the bending effect
 * @param {Number} scaleAxis - axis that we use to determine bend factor 0 = x, 1 = y, 2 = z
 * @param {Number} applicationAxis - axis that we apply bend transformation to. 0 = x, 1 = y, 2 = z
 */
export function bend(positions, idx_list, amount, origin, maxLength, scaleAxis = 0, applicationAxis = 0) {
    const processed = new Set();

    for (let i = 0; i < idx_list.length; ++i) {
      let idx = idx_list[i];
      
      // If we have already bent this vertex, skip it!
      if (processed.has(idx)) continue;
      
      // Mark it as processed
      processed.add(idx);
      
      // Access raw coordinates
      let px = positions[idx * 3];
      let py = positions[idx * 3 + 1];
      let pz = positions[idx * 3 + 2];

      // Calculate raw distance from origin
      let rawDist = 0.0;
      if (scaleAxis == 0)      
      {
        rawDist = px - origin.x;
      }
      else if (scaleAxis == 1) 
      {
        rawDist = py - origin.y;
      }
      else
      {
        rawDist = pz - origin.z;
      }

      // 2. Normalize the distance (0.0 to 1.0)
      // This ensures the curve shape (parabola) is consistent regardless of mesh scale.
      // We clamp it between 0 and 1 so the bend doesn't apply "backwards" behind the origin.
      let normalizedDist = Math.max(0.0, Math.min(1.0, rawDist / maxLength));

      // Apply Quadratic Curve
      let offset = Math.pow(normalizedDist, 4) * amount;

      if (applicationAxis == 0)
        positions[idx * 3]     = px + offset;
      else if (applicationAxis == 1)
        positions[idx * 3 + 1] = py + offset;
      else
        positions[idx * 3 + 2] = pz + offset;
    }
}

// 3: FUNCTIONS THAT GENERATE NEW GEOMETRY ---------------------------------------------------------

/**
 * Creates ring in a clockwise manner, returns indices of new points.
 * Ring exists on xy plane, "facing" towards +/- z
 * @param {Array<Number} positions - Array containing position data for vertices
 * @param {Array<Number>} indices - Array containing (all) index data for vertices
 * @param {Array<Number>} colors - Array containing color data for vertices (used for debugging)
 * @param {Number} numVerts - number of vertices used to construct ring
 * @param {Number} radX - length of ring in x dimension, mismatch with radY creates ellipse
 * @param {Number} radY - length of ring in y dimension, mismatch with radX creates ellipse
 * @param {Map<Number>} translate - translation of ring. 0.0 translation leaves ring on origin
 * @param {Map<Number>} color - debug color of ring. Red if not specified
 * @returns {Array<Number>} all_idx - Unique new vertex indices created using this function
 */
export function create_ring(positions, indices, colors, numVerts, radX, radY, translate = {x: 0.0, y: 0.0, z: 0.0}, color = null) {
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

/**
 * Fills in ring of vertices using fan method
 * @param {Array<Number>} indices - Array containing (all) index data for vertices
 * @param {Array<Number>} orig_ring_indices - Array containing index data for ring of vertices we are filling
 * @param {Boolean} reverse - toggles clockwise/counter-clockwise drawing of faces.
 */
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

/**
 * Fills in ring of vertices with faces by defining a new "pole" vertex, then using fan method
 * on new vertex to fill in with faces
 * @param {Array<Number} positions - Array containing position data for vertices
 * @param {Array<Number>} indices - Array containing (all) index data for vertices
 * @param {Array<Number>} orig_ring_indices - Array containing index data for ring of vertices we are filling
 * @param {Array<Number>} colors - Array containing color data for vertices (used for debugging)
 * @param {Map<Number>} offset - translation of pole in relation to original ring. 0.0 puts pole in the center
 * @param {Boolean} reverse - toggles clockwise/counter-clockwise drawing of faces.
 * @param {Map<Number>} color - debug color of ring. Blue if not specified
 * @returns {Array<Number>} all_idx - Array of new indices created by this function. Note that it will have a length of 1
 */
export function fill_ring_pole(positions, indices, orig_ring_indices, colors, offset = {x: 0.0, y: 0.0, z: 0.0}, reverse, color = null) {
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

/**
 * Extrude points from specified ring, then creates faces from bridged edge loops
 * @param {Array<Number} positions - Array containing position data for vertices
 * @param {Array<Number>} indices - Array containing (all) index data for vertices
 * @param {Array<Number>} orig_ring_indices - Array containing index data for ring of vertices we are extruding
 * @param {Array<Number>} colors - Array containing color data for vertices (used for debugging)
 * @param {Map<Number>} offset - translation of ring in relation to original ring. Must be specified
 * @param {Map<Number>} color - debug color of ring. Red if not specified
 * @returns {Array<Number>} all_idx - Unique new vertex indices created using this function
 */
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

/**
 * Interpolates along two splines, one used for position, and another used for scale,
 * and creates rings of vertices that are bridged using faces. In other words, creates
 * controllable tube geometry based on control points.
 * Note that for spline control points, 
 * one point = array of three numbers
 * ex: [1.0, 2.0, 3.0] equivalent to {x: 1.0, y: 2.0, z: 3.0}
 * @param {Array<Number>} positions - Array containing position data for vertices
 * @param {Array<Number>} indices - Array containing index data for vertices
 * @param {Array<Number>} colors - Array containing color data for vertices (debugging)
 * @param {Number} num_verts_ring - Number of vertices in each ring of geometry
 * @param {Number} numRings - Number of vertex rings we distribute along the spline
 * @param {Array<Array<Number>>} posCtrlPts - Array of points use to define position along geometry
 * @param {Array<Array<Number>>} scaleCtrlPts - Array of points use to define scale along geometry
 * @param {Map<Number>} endPoleOffset - Offset of pole that fills in the end of the structure
 * @param {Map<Number>} beginPoleOffset - Offset of pole that fills in the start of the structure
 * @param {Map<Number>} color - Debugging color value. By default, red for rings, blue for poles
 * @param {Boolean} fillEndPole - Whether or not we fill in the loop at the end with a pole
 * @param {Boolean} fillStartPole - Whether or not we fill in the loop at the start with a pole
 * @returns {Array<Number>} all_idx - Array of new indices created by this function
 */
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

  if (fillEndPole) 
  {
    let end_pole_idx = fill_ring_pole(positions, indices, curLoopIdx, colors, endPoleOffset, true, color);
    all_idx.push(...end_pole_idx);
  }
  if (fillStartPole)
  {
    let orig_pole_idx = fill_ring_pole(positions, indices, orig_ring, colors, beginPoleOffset, false, color);
    all_idx.push(...orig_pole_idx);
  }
  
  return all_idx;
}

/**
 * Generates geometry for a shape that is roughly similar to a sphere. 
 * Used for eyes
 * @param {Array<Number>} positions - Array containing position data for vertices
 * @param {Array<Number>} indices - Array containing index data for vertices
 * @param {Array<Number>} colors - Array containing color data for vertices (debugging)
 * @param {Map<Number>} offset - Translates "sphere"
 * @param {Map<Number>} color - Debugging color value. Reddish color by default
 * @returns {Array<Number>} all_idx - Array of new indices created by this function
 */
export function sphere(positions, indices, colors, offset = {x: 0.0, y: 0.0, z: 0.0}, color = null) {
  // --- Control Points for Sphere Shape ---
  const NUM_RING_VERTS = 8;
  const NUM_RINGS = 3;

  // The path runs vertically (along the Y-axis)
  const posCtrlPts = [
      [0 + offset.x, 0 + offset.y, 0 + offset.z - 0.0625 * Math.pow(2.0, 0.5)], // Start control point (top)
      [0 + offset.x, 0 + offset.y, 0.0625 * Math.pow(2.0, 0.5) + offset.z - 0.0625 * Math.pow(2.0, 0.5)],   // Equator/center
      [0 + offset.x, 0 + offset.y, 0.13 * Math.pow(2.0, 0.5) + offset.z - 0.0625 * Math.pow(2.0, 0.5)]  // End control point (bottom)
  ];

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
  return sphereIndices;
}