import { 
    getPos,
    getRingData,
    create_ring, 
    extrude_ring, 
    fill_ring_pole, 
    scale_around_point, 
    rotate_around_point, 
    translate, 
    create_ring_spline, 
    sphere,
    getCentroid,
    bend
} from "./proceduralSculpting.js";
import {
    normalize,
    cross,
    subVec,
    addVec,
    scaleVec,
    apply_matrix_transform,
    vec3
} from "./linearTools.js";
import { CatmullRomSpline3D } from "./SplineVec3.js";
/*
Stephen Gavin Sears
Commented 11/28/2025
This file contains functions used to generate the various parts of
the fish in this project procedurally.

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

// GOLDFISH BODY PART FUNCTIONS -------------------------------------------------------

/**
 * Generates geometry for fish body, and also calculates values to be used in generating other
 * fish body parts (variables labelled with "_out")
 * 
 * template for "infoPacket" arguments, which should be passed in empty to be populated with data:
 * let infoPacketEx =
 * {
 *   l: {
 *     pos: {x: 0.0, y: 0.0, z: 0.0}, 
 *     norm: {x: 0.0, y: 1.0, z: 0.0}, 
 *     tangent: {x: 0.0, y: 1.0, z: 0.0}
 *   },
 *   r: {
 *     pos: {x: 0.0, y: 0.0, z: 0.0}, 
 *     norm: {x: 0.0, y: 1.0, z: 0.0}, 
 *     tangent: {x: 0.0, y: 1.0, z: 0.0}
 *   }
 * }
 * @param {Array<Number>} positions - Array containing position data for vertices
 * @param {Array<Number} indices - Array containing index data for vertices
 * @param {Array<Number} colors - Array containing color data for vertices (used for debugging)
 * @param {Number} bodyLength - Value that affects the length of the body
 * @param {Number} bodyHeight - Value that affects the height of the body
 * @param {Number} bodyWidth - Value that affects the width of the body
 * @param {Number} arch - Value that creates an arch in the back of the fish
 * @param {Map<Map<Map<Number>>>} pectoralInfoPacket_out - "infoPacket" item which passes data for pectoral fins
 * @param {Number} pectoralShift - position pectoral fins have relative to the center of the body
 * @param {Number} pectoralAngle - angle that pectoral fins have relative to the center of the body
 * @param {Map<Map<Map<Number>>>} pelvicInfoPacket_out - "infoPacket" item which passes data for pelvic fins
 * @param {Number} pelvicShift - position pelvic fins have along the fish's body
 * @param {Number} pelvicAngle - angle that the pelvic fins have relative to the center of the body
 * @param {Map<Number>} caudalPos_out - calculated position of caudal fin using body spline
 * @param {Map<Number>} headPos_out - calculated position of head using body spline
 * @param {Map<Number>} headBodySize_out - Value calculated of scale at neck to create smooth transition between head and body 
 * @param {Array<Array<Number>>} posCtrlPoints_out - splineVec3 control points passed by reference to use later for body pos
 * @param {Array<Array<Number>>} scaleCtrlPoints_out - splineVec3 control points passed by reference to use later for body scale
 * @returns {Array<Number>} all_idx - Array of unique new geometry indices created by this function
 */
// ---------- GOLDFISH BODY PART GENERATORS. PASS POS/IDX ARRAYS BY REFERENCE FOR UPDATE
function gfish_body(positions, indices, colors, bodyLength, bodyHeight, bodyWidth, arch, 
    pectoralInfoPacket_out, pectoralShift, pectoralAngle,
    pelvicInfoPacket_out, pelvicShift, pelvicAngle,
    caudalPos_out, 
    headPos_out, headBodySize_out,
    posCtrlPoints_out,
    scaleCtrlPoints_out  
) {
  const posCtrlPoints = 
  [  // position spline
    [0.0, 0.0 - arch, 0.0],
    [0.0, 0.02 - (arch * 0.5), bodyLength * 0.4],
    [0.0, 0.03, bodyLength * 0.7],
    [0.0, 0.035, bodyLength]
  ];
  posCtrlPoints_out.push(...posCtrlPoints);
  const scaleCtrlPoints = 
  [  // scale spline
    [bodyWidth * 0.3, bodyHeight * 0.5, 1.0],
    [bodyWidth * 0.45, bodyHeight, 1.0],
    [bodyWidth * 0.35, bodyHeight * 0.52, 1.0],
    [bodyWidth * 0.2, bodyHeight * 0.25, 1.0]
  ];
  scaleCtrlPoints_out.push(...scaleCtrlPoints);

  // use spline with radius value, interpolate with even rings for body
  let all_idx = [];
  all_idx = create_ring_spline(
    positions, indices, colors,
    8, // num verts in a ring
    10,// num rings in spline
    posCtrlPoints, 
    scaleCtrlPoints,
    {x: 0.0, y: 0.0, z: bodyLength * 0.05}, //end pole offset
    {x: 0.0, y: 0.0, z: -0.025}  //begin pole offset
  );

  // recording caudal and head pos to use outside of function
  // NOTE: this is why we assign values. If we assigned new object,
  // connection would be broken and value would be NaN outside of func
  caudalPos_out.x = 0.0;
  caudalPos_out.y = 0.035;
  caudalPos_out.z = bodyLength;

  headPos_out.x = 0.0;
  headPos_out.y = -arch;
  headPos_out.z = 0.0;

  // re-defining splines to sample points
  const posPath = new CatmullRomSpline3D(
    posCtrlPoints,
    0.5
  );
  const scalePath = new CatmullRomSpline3D(
    scaleCtrlPoints,
    0.5
  );

  // take scale for head start
  let neck_scale = scalePath.getPoint(0.0);
  headBodySize_out.x = neck_scale[0];
  headBodySize_out.y = neck_scale[1];
  headBodySize_out.z = neck_scale[2];

  // function that collects necessary info to place fin geometry
  function getDoubleFinInfo(finInfoPacket, shift, angle) {
    let finPos = posPath.getPoint(shift);
    let spinePos = { x: finPos[0], y: finPos[1], z: finPos[2] };
    let finScale = scalePath.getPoint(shift);

    let nextShift = Math.min(shift + 0.01, 1.0);
    let nextPosArr = posPath.getPoint(nextShift);
    let nextPosVec = {x: nextPosArr[0], y: nextPosArr[1], z: nextPosArr[2]};
    let spineTangent = normalize(subVec(nextPosVec, spinePos));

    let offset = 
    {
        x: finScale[0] * Math.cos(angle),
        y: finScale[1] * Math.sin(angle),
        z: 0.0
    };

    let lPos = {
        x: finPos[0] - offset.x * 0.9,
        y: finPos[1] + offset.y * 0.9,
        z: finPos[2]
    };
    const normL = normalize(subVec(lPos, spinePos));

    finInfoPacket.l.pos = lPos;
    finInfoPacket.l.norm = normL;
    finInfoPacket.l.tangent = spineTangent;

    let rPos = {
        x: finPos[0] + offset.x * 0.9,
        y: finPos[1] + offset.y * 0.9,
        z: finPos[2]
    };
    const normR = normalize(subVec(rPos, spinePos));

    finInfoPacket.r.pos = rPos;
    finInfoPacket.r.norm = normR;
    finInfoPacket.r.tangent = spineTangent;
  }
  
  getDoubleFinInfo(pectoralInfoPacket_out, pectoralShift, pectoralAngle);
  getDoubleFinInfo(pelvicInfoPacket_out, pelvicShift, pelvicAngle);

  return all_idx;
}

/**
 * Fills ring of vertices with a mouth structure, which is created with two filled rings of 
 * verts as the lips, with a gap in between as the mouth.
 * Note that in order for this structure to be possible, we need an even number of vertices in the
 * loop. Without this, we cannot create a line running across the loop to create the mouth.
 * @param {Array<Number>} positions - Array containing position data for vertices
 * @param {Array<Number} indices - Array containing index data for vertices
 * @param {Array<Number} colors - Array containing color data for vertices (used for debugging)
 * @param {Array<Number} orig_ring_indices - Array containing unique indices of original vertex ring
 * @param {Number} mouthStickOut - value that scales mouth and makes it protrude more
 * @param {Map<Number>} topLipSize - xyz scale of top lip
 * @param {Map<Number>} topLipOffset - xyz offset of top lip
 * @param {Map<Number>} botLipSize - xyz scale of bottom lip
 * @param {Map<Number>} botLipOffset - xyz offset of bottom lip
 * @returns {Array<Number>} all_idx - Array of unique new geometry indices created by this function
 */
function fill_ring_mouth(
  positions, indices, colors, orig_ring_indices, 
  mouthStickOut, 
  topLipSize, topLipOffset, 
  botLipSize, botLipOffset
) {
    const numVerts = orig_ring_indices.length;

    // Check if even number of verts
    if (numVerts % 2 !== 0) {
        console.error("fill_ring_mouth requires an even number of vertices.");
        return [];
    }
    const halfVerts = numVerts / 2;

    // Get information about vert ring so we can position the lips correctly
    const { center, forward } = getRingData(positions, orig_ring_indices);
    
    // finding corners of mouth
    let rightCornerIdx = orig_ring_indices[0];
    let leftCornerIdx = orig_ring_indices[halfVerts];
    let rightPos = getPos(rightCornerIdx, positions);
    let leftPos = getPos(leftCornerIdx, positions);

    // bridging corners of the mouth with verts
    let newSeamIndices = []; 
    let slitIndices = [rightCornerIdx]; 

    // Flatten Y to average
    let seamY = (rightPos.y + leftPos.y) / 2.0;

    // creating new seam (mouth corner bridge) verts
    for (let i = 1; i < halfVerts; ++i) {
        let t = i / halfVerts;
        let newX = rightPos.x * (1.0 - t) + leftPos.x * t;
        let newZ = rightPos.z * (1.0 - t) + leftPos.z * t;
        
        positions.push(newX, seamY, newZ);
        colors.push(0.1, 0.0, 0.0); // Dark red
        
        // Track indices
        let newIdx = (positions.length / 3) - 1;
        slitIndices.push(newIdx);
        newSeamIndices.push(newIdx);
    }
    slitIndices.push(leftCornerIdx); 

    // Top Arc to Slit
    for (let i = 0; i < halfVerts; ++i) {
        let r_curr = orig_ring_indices[i];
        let r_next = orig_ring_indices[i+1];
        let s_curr = slitIndices[i];
        let s_next = slitIndices[i+1];
        
        // FLIPPED WINDING (r, s, r_next) to face OUT
        if(r_curr !== s_curr) indices.push(r_curr, s_curr, r_next);
        if(r_next !== s_next) indices.push(r_next, s_curr, s_next);
    }

    // Bottom Arc to Slit (Backwards traverse)
    for (let i = 0; i < halfVerts; ++i) {
        let r_curr = orig_ring_indices[halfVerts + i];
        let r_next = orig_ring_indices[(halfVerts + i + 1) % numVerts];
        let s_curr = slitIndices[halfVerts - i];
        let s_next = slitIndices[halfVerts - i - 1];

        // FLIPPED WINDING (r, s, r_next) to face OUT
        if(r_curr !== s_curr) indices.push(r_curr, s_curr, r_next);
        if(r_next !== s_next) indices.push(r_next, s_curr, s_next);
    }
    
    // Vert loops used to extrude lips
    let topLoop = [];
    for(let i = 0; i <= halfVerts; i++) topLoop.push(orig_ring_indices[i]);
    for(let i = halfVerts - 1; i > 0; i--) topLoop.push(slitIndices[i]);

    let botLoop = [];
    for(let i = 0; i <= halfVerts; i++) botLoop.push(orig_ring_indices[(halfVerts + i) % numVerts]);
    for(let i = 1; i < halfVerts; i++) botLoop.push(slitIndices[i]);

    // 6. Extrude Protrusions
    let upVec = {x:0, y:1, z:0};
    
    // Top Lip
    let topDir = normalize(addVec(forward, scaleVec(upVec, 0.2))); 
    let topOffset = scaleVec(topDir, mouthStickOut);
    let topLipIndices = extrude_ring(positions, indices, topLoop, colors, topOffset);

    // Bottom Lip
    let botDir = normalize(addVec(forward, scaleVec(upVec, -0.2)));
    let botOffset = scaleVec(botDir, mouthStickOut);
    let botLipIndices = extrude_ring(positions, indices, botLoop, colors, botOffset);

    let poleOffset = {x:0, y:0, z:0};
    let topLipCentroid = getCentroid(positions, topLipIndices);
    scale_around_point(positions, topLipIndices, topLipCentroid, topLipSize);
    translate(positions, topLipIndices, topLipOffset);

    let botLipCentroid = getCentroid(positions, botLipIndices);
    scale_around_point(positions, botLipIndices, botLipCentroid, botLipSize);
    translate(positions, botLipIndices, botLipOffset);
    
    // Reverse = true points the face outward for extruded caps
    let topCapIndices = fill_ring_pole(positions, indices, topLipIndices, colors, poleOffset, true);
    let botCapIndices = fill_ring_pole(positions, indices, botLipIndices, colors, poleOffset, true);

    return [...newSeamIndices, ...topLipIndices, ...botLipIndices, ...topCapIndices, ...botCapIndices];
}
// Eye type enum used for head function. Currently unused
export const eye_types = {
  BULGE: "BULGE",
  GOOGLY: "GOOGLY",
  CHEEKS: "CHEEKS",
  BUBBLY: "BUBBLY" 
};
/**
 * Generates the head geometry for the goldfish, utilizing spline-based modeling to create
 * the main head shape, mathematically positioning eyes on the curved surface, and 
 * capping the geometry with a mouth.
 * @param {Array<Number>} positions - Array containing position data for vertices
 * @param {Array<Number>} indices - Array containing index data for vertices
 * @param {Array<Number>} colors - Array containing color data for vertices
 * @param {Array<Number>} labels - Array containing label data for vertices
 * @param {Array<Object>} pivots - Array containing pivot data for animation
 * @param {Map<Number>} headPos - xyz position of the head
 * @param {Map<Number>} neckSize - xy scale of the neck connection point
 * @param {Map<Number>} headSize - xyz scale of the head
 * @param {Number} eyeScale - scale factor for the eyes
 * @param {Number} eyeType - identifier for the type of eye to generate
 * @param {Number} [mouthTilt=0.0] - vertical tilt offset for the mouth
 * @returns {Array<Number>} all_idx - Array of unique new geometry indices created by this function
 */
function gfish_head(positions, indices, colors, labels, pivots, headPos, neckSize, headSize = {}, eyeScale, eyeType, mouthTilt = 0.0) {
  // ring, extrude while scaling down
  const numVertsRing = 8;

  let posCtrlPoints = 
  [  // position spline
    [0.0, 0.0, 0.0],
    [0.0, 0.0, headSize.z * 0.15],
    [0.0, mouthTilt, headSize.z * 0.5]
  ];
  let scaleCtrlPoints = 
  [  // scale spline
    [neckSize.x, neckSize.y, 1.0],
    [(headSize.x * 0.3) + (neckSize.x * 0.7), (headSize.y * 0.3) + (neckSize.y * 0.7), 1.0],
    [headSize.x, headSize.y, 1.0]
  ];

  let all_idx = [];
  let head_idx = create_ring_spline(
    positions, indices, colors,
    numVertsRing, // num verts in a ring (MUST BE EVEN for the mouth func to work)
    20,// num rings in spline
    posCtrlPoints, 
    scaleCtrlPoints,
    {x: 0, y: 0, z: headSize.z * 0.05}, //end pole offset
    {x: 0, y: 0, z: 0.0},  //begin pole offset,
    {r: 0.1, g: 0.5, b: 0.1},
    false,
    false
  );
  assignLabel(labels, head_idx, 2);
  all_idx.push(...head_idx);

  // Placing the eyes
  // define splines to sample points
  const posPath = new CatmullRomSpline3D(
    posCtrlPoints,
    0.5
  );

  const scalePath = new CatmullRomSpline3D(
    scaleCtrlPoints,
    0.5
  );

  function getEyeInfo(eyeInfoPacket, shift, angle) {
    // 1. Calculate CURRENT Surface Position (P0)
    let pos0 = posPath.getPoint(shift);
    let scale0 = scalePath.getPoint(shift);
    let spinePos0 = { x: pos0[0], y: pos0[1], z: pos0[2] };

    // Calculate offset for P0
    let offset0 = {
        x: scale0[0] * Math.cos(angle),
        y: scale0[1] * Math.sin(angle),
        z: 0.0
    };
    
    // 2. Calculate NEXT Surface Position (P1) - The "Slope" Check
    let delta = 0.01; // Small step forward
    let nextShift = Math.min(shift + delta, 1.0);
    
    let pos1 = posPath.getPoint(nextShift);
    let scale1 = scalePath.getPoint(nextShift); // This captures the Taper!
    
    // Calculate offset for P1
    let offset1 = {
        x: scale1[0] * Math.cos(angle),
        y: scale1[1] * Math.sin(angle),
        z: 0.0
    };

    // 3. Define Left/Right Surface Points
    let lPos0 = { x: pos0[0] - offset0.x, y: pos0[1] + offset0.y, z: pos0[2] };
    let lPos1 = { x: pos1[0] - offset1.x, y: pos1[1] + offset1.y, z: pos1[2] };

    let rPos0 = { x: pos0[0] + offset0.x, y: pos0[1] + offset0.y, z: pos0[2] };
    let rPos1 = { x: pos1[0] + offset1.x, y: pos1[1] + offset1.y, z: pos1[2] };

    // 4. Calculate Vectors for Normal Calculation
    // Vector A: The slope along the body (Longitudinal)
    let l_slopeVec = normalize(subVec(lPos1, lPos0));
    let r_slopeVec = normalize(subVec(rPos1, rPos0));

    // Vector B: The curve around the body (Latitudinal / Up)
    // We can approximate this by crossing the Spine Tangent with the Radial Vector
    let spineTangent = normalize(subVec({x: pos1[0], y: pos1[1], z: pos1[2]}, spinePos0));
    
    let l_radial = normalize(subVec(lPos0, spinePos0));
    let r_radial = normalize(subVec(rPos0, spinePos0));

    // Calculate "Surface Up" (Tangential to the ring)
    let l_up = normalize(cross(l_radial, spineTangent)); 
    let r_up = normalize(cross(spineTangent, r_radial)); 

    // 5. Calculate TRUE Surface Normals
    // Cross the Slope vector with the Up vector
    let l_trueNorm = normalize(cross(l_up, l_slopeVec));
    let r_trueNorm = normalize(cross(r_slopeVec, r_up));

    // 6. Fill Packet
    eyeInfoPacket.l.pos = lPos0;
    eyeInfoPacket.l.norm = l_trueNorm; // Use the new True Normal
    eyeInfoPacket.l.tangent = spineTangent;

    eyeInfoPacket.r.pos = rPos0;
    eyeInfoPacket.r.norm = r_trueNorm; // Use the new True Normal
    eyeInfoPacket.r.tangent = spineTangent;
  }

  let eyeShift = 0.4;
  let eyeAngle = 0.5;
  let infoPacket =
  {
    l: {
      pos: {x: 0.0, y: 0.0, z: 0.0}, 
      norm: {x: 0.0, y: 1.0, z: 0.0}, 
      tangent: {x: 0.0, y: 1.0, z: 0.0}
    },
    r: {
      pos: {x: 0.0, y: 0.0, z: 0.0}, 
      norm: {x: 0.0, y: 1.0, z: 0.0}, 
      tangent: {x: 0.0, y: 1.0, z: 0.0}
    }
  };
  getEyeInfo(infoPacket, eyeShift, eyeAngle);

  function positionEye(eyeInfo) {
    let fcn_eye_idx = sphere(positions, indices, colors, {x: 0.0, y: 0.0, z: 0.0}, {r: 0.1, g: 0.1, b: 0.5});
    
    // 1. Flatten the eye so we can see the orientation.
    // Z is 0.3 (Thin disk). 
    scale_around_point(positions, fcn_eye_idx, {x: 0.0, y: 0.0, z: 0.0}, {x: eyeScale, y: eyeScale, z: eyeScale});
    rotate_around_point(positions, fcn_eye_idx, {x: 0.0, y: 0.0, z: 0.0}, {x: 90.0, y: 0.0, z: 0.0})

    let fcn_origin = eyeInfo.pos;
    let fcn_forward = eyeInfo.norm;    // The Normal (Out of skin)
    let fcn_spine_tan = eyeInfo.tangent; // The direction of the spine
    
    // Step A: Z points OUT of the face.
    // This is the most important axis. The eye must face this way.
    let newZ = normalize(fcn_forward);

    // Step B: X points "Right" relative to the fish's body line.
    // We cross the Spine Tangent with the Normal.
    // This forces X to lie flat against the skin surface.
    let newX = normalize(cross(fcn_spine_tan, newZ));

    // Step C: Y points "Up" along the skin surface.
    // We cross Z with X. 
    // This gives us a vector that points roughly towards the tail/spine 
    // but acts as a perfect tangent to the surface curve.
    let newY = normalize(cross(newZ, newX));

    // 3. Construct Matrix (BASIS VECTORS AS COLUMNS)
    // If we put them as rows, the eye will rotate incorrectly.
    let fcn_matrix = [
        newX.x, newY.x, newZ.x,
        newX.y, newY.y, newZ.y,
        newX.z, newY.z, newZ.z
    ];

    apply_matrix_transform(positions, fcn_eye_idx, fcn_matrix, {x: 0.0, y: 0.0, z: 0.0});
 
    translate(positions, fcn_eye_idx, fcn_origin);

    return fcn_eye_idx;
  }

  let eyeR_idx = positionEye(infoPacket.l);
  assignLabel(labels, eyeR_idx, 3);
  all_idx.push(...eyeR_idx);

  let eyeL_idx = positionEye(infoPacket.r);
  assignLabel(labels, eyeL_idx, 3);
  all_idx.push(...eyeL_idx);
  // Making the mouth

  let lastRingStartIdx = all_idx[all_idx.length - numVertsRing - eyeR_idx.length - eyeL_idx.length];
  let finalRingIndices = [];
  for (let i = 0; i < numVertsRing; ++i)
  {
    finalRingIndices.push(lastRingStartIdx + i);
  }

  let mouthStickOut = headSize.z * 0.1;

  let mouth_idx = fill_ring_mouth(
    positions, indices, colors,
    finalRingIndices,
    mouthStickOut,
    // top size, offset
    {x: 0.4, y: 0.5, z: 1.0},
    {x:0.0, y:0.01, z:-0.01},
    // bot size, offset
    {x: 0.65, y: 0.2, z: 1.0},
    {x:0.0, y:-0.025, z:-0.01}
  );
  assignLabel(labels, mouth_idx, 4);
  all_idx.push(...mouth_idx);
  
  rotate_around_point(positions, all_idx, {x: 0.0, y: 0.0, z: 0.0}, {x: 0.0, y: 180.0, z: 0.0});
  translate(positions, all_idx, headPos);
  // end cap with special mouth geo function
  assignPivot(pivots, head_idx, getCentroid(positions, head_idx));
  assignPivot(pivots, eyeR_idx, getCentroid(positions, eyeR_idx));
  assignPivot(pivots, eyeL_idx, getCentroid(positions, eyeL_idx));
  assignPivot(pivots, mouth_idx, getCentroid(positions, mouth_idx));
  return all_idx;
}

// caudal fin type enum used for caudal fin function. Currently unused
export const caudal_types = {
  DROOPY: "DROOPY",
  VSLOPE: "VSLOPE",
  FEATHERY: "FEATHERY",
  VBUTT: "VBUTT",
  BUTTERFLY: "BUTTERFLY"
};
/**
 * Generates the caudal (tail) fin geometry by creating a bifurcated structure.
 * It extrudes a series of rings to form the fin base, then splits the geometry indices
 * into two halves to apply opposing bend transformations, creating the iconic
 * curved tail shape.
 * @param {Array<Number>} positions - Array containing position data for vertices
 * @param {Array<Number>} indices - Array containing index data for vertices
 * @param {Array<Number>} colors - Array containing color data for vertices
 * @param {Array<Object>} pivots - Array containing pivot data for animation
 * @param {Map<Number>} caudalPos - xyz position of the caudal fin root
 * @param {Number} caudalLength - Length of the tail fin
 * @param {Number} caudalWidth - Width (thickness/spread) of the tail fin
 * @param {Number} caudalCurve - Intensity of the curve applied to the tail lobes
 * @param {Number} bodyLength - Length of the main body (used for relative scaling/positioning)
 * @param {Number} caudalType - Identifier for the specific style of caudal fin
 * @returns {Array<Number>} all_idx - Array of unique new geometry indices created by this function
 */
function gfish_caudal(positions, indices, colors, pivots, caudalPos, caudalLength, caudalWidth, caudalCurve, bodyLength, caudalType) {
  let iterVal = caudalWidth / 4.0;

  let all_idx = [];
  
  // start ring
  let first_idx = create_ring(positions, indices, colors, 8, 0.05, 1.0, vec3(0.0, 0.0, 0.0));
  let startPole = fill_ring_pole(positions, indices, first_idx, colors, vec3(0.0, 0.0, 0.0), false);

  // thickness for first ring
  let second_idx = extrude_ring(positions, indices, first_idx, colors, vec3(0.0, 0.0, iterVal));

  let firstHalf = [...first_idx, ...startPole, ...second_idx];
  
  // inset ring
  let third_idx = extrude_ring(positions, indices, second_idx, colors, vec3(0.0, 0.0, iterVal));
  scale_around_point(positions, third_idx, vec3(0.0, 0.0, 0.0), vec3(1.0, 0.5, 1.0));
  translate(positions, third_idx, vec3(0.0, -0.44, 0.0));
  
  // return to start width
  let fourth_idx = extrude_ring(positions, indices, third_idx, colors, vec3(0.0, 0.0, iterVal));
  translate(positions, fourth_idx, vec3(0.0, 0.44, 0.0));
  scale_around_point(positions, fourth_idx, vec3(0.0, 0.0, 0.0), vec3(1.0, 2.0, 1.0));
  
  // end of fin
  let fifth_idx = extrude_ring(positions, indices, fourth_idx, colors, vec3(0.0, 0.0, iterVal));
  let endPole = fill_ring_pole(positions, indices, fifth_idx, colors, vec3(0.0, 0.0, 0.0), true);
  
  let secondHalf = [...fourth_idx, ...fifth_idx, ...endPole];

  all_idx.push(
    ...first_idx,
    ...startPole,
    ...second_idx,
    ...third_idx,
    ...fourth_idx,
    ...fifth_idx,
    ...endPole   
  );

  translate(positions, all_idx, vec3(0.0, 0.0, iterVal * -2.0));

  rotate_around_point(positions, secondHalf, vec3(0.0, 0.0, 0.0), vec3(5.0, 0.0, 0.0));
  rotate_around_point(positions, firstHalf, vec3(0.0, 0.0, 0.0), vec3(-5.0, 0.0, 0.0));

  translate(positions, all_idx, vec3(0.0, -bodyLength * 0.3 + caudalLength * 0.4, 0.0));
  scale_around_point(positions, all_idx, vec3(0.0, 0.0, 0.0), vec3(0.5, caudalLength * 0.5, 0.5));

  rotate_around_point(positions, all_idx, vec3(0.0, 0.0, 0.0), vec3(90.0, 0.0, 0.0));

  
  bend(
    positions, 
    firstHalf, 
    1.5 * caudalCurve,      // Amount (Swish strength)
    vec3(0, 0, 0),          // Origin (The root of the tail)
    caudalLength * 0.9,     // Max Length (For normalization)
    2,                      // Scale Axis: Z (Distance along the tail)
    1                       // Application Axis: X (Side-to-side movement)
  );
  bend(
    positions, 
    secondHalf, 
    -1.5 * caudalCurve,     // Amount (Swish strength)
    vec3(0, 0, 0),          // Origin (The root of the tail)
    caudalLength * 0.9,     // Max Length (For normalization)
    2,                      // Scale Axis: Z (Distance along the tail)
    1                       // Application Axis: X (Side-to-side movement)
  );
  
  translate(positions, all_idx, caudalPos);
  assignPivot(pivots, all_idx, getCentroid(positions, [all_idx[7], all_idx[40]]));

  return all_idx;
}

// dorsal fin type enum used for dorsal fin function. Currently unused
export const dorsal_types = {
  MANE: "MANE",
  PUNK: "PUNK",
  SWEPT: "SWEPT"
};
/**
 * Generates the dorsal fin geometry by extruding a series of rings along the top of the fish's back.
 * It uses the body's position and scale splines to calculate the exact surface height at specific
 * longitudinal points ('shift'), ensuring the fin appears rooted in the skin regardless of the 
 * body's curve or thickness.
 * @param {Array<Number>} positions - Array containing position data for vertices
 * @param {Array<Number>} indices - Array containing index data for vertices
 * @param {Array<Number>} colors - Array containing color data for vertices
 * @param {Number} dorsalLength - The longitudinal length of the fin (0.0 to 1.0 relative to body)
 * @param {Number} dorsalWidth - The thickness/width of the fin base
 * @param {Number} dorsalShift - The starting position of the fin along the spine (0.0 to 1.0)
 * @param {Array<Array<Number>>} posCtrlPoints - Control points for the body's position spline
 * @param {Array<Array<Number>>} scaleCtrlPoints - Control points for the body's scale/thickness spline
 * @param {Number} dorsalType - Identifier for the specific style of dorsal fin
 * @returns {Array<Number>} all_idx - Array of unique new geometry indices created by this function
 */
function gfish_dorsal(positions, indices, colors, dorsalLength, dorsalWidth, dorsalShift, posCtrlPoints, scaleCtrlPoints, dorsalType) {
  // splines for sampling body curve
  const posPath = new CatmullRomSpline3D(
    posCtrlPoints,
    0.5
  );
  const scalePath = new CatmullRomSpline3D(
    scaleCtrlPoints,
    0.5
  );
  
  // This is the radius of the fin tube itself. 
  // We need to lift the center of every ring by this amount so it sits ON the skin.
  const finRadius = dorsalWidth / 2.0;

  const embedOffset = dorsalWidth * 0.25;

  // length is clamped so it is not too long
  let clampedLength = Math.min(dorsalShift + dorsalLength, 1.0) - dorsalShift;
  clampedLength = Math.max(clampedLength, dorsalWidth * (7.0 / 6.0) * 0.15);
  let incVal = clampedLength / 3.0;

  // --- HELPER: Calculate Absolute Ring Center ---
  function getRingCenter(t) {
      let p = posPath.getPoint(t);   
      let s = scalePath.getPoint(t); 
      
      // Logic: Spine + Skin_Height + Fin_Radius - Embed_Amount
      let yPos = p[1] + s[1] + finRadius - embedOffset;
      
      return vec3(p[0], yPos, p[2]);
  }

  // Pre-calculate positions (now slightly lower)
  let pos1 = getRingCenter(dorsalShift);
  let pos2 = getRingCenter(dorsalShift + incVal);
  let pos3 = getRingCenter(dorsalShift + incVal * 2.0);
  let pos4 = getRingCenter(dorsalShift + incVal * 3.0);

  let delta1to2 = subVec(pos2, pos1);
  let delta2to3 = subVec(pos3, pos2);
  let delta3to4 = subVec(pos4, pos3);

  let all_idx = [];

  // --- Ring 1 ---
  let first_idx = create_ring(positions, indices, colors, 6, 0.05, finRadius, pos1);
  let startPole = fill_ring_pole(positions, indices, first_idx, colors, vec3(0.0, 0.0, 0.0), false);

  // --- Ring 2 ---
  let second_idx = extrude_ring(positions, indices, first_idx, colors, delta1to2);
  scale_around_point(positions, second_idx, vec3(pos2.x, pos2.y, pos2.z), vec3(1.0, 0.8, 1.0));

  // --- Ring 3 ---
  let third_idx = extrude_ring(positions, indices, second_idx, colors, delta2to3);
  scale_around_point(positions, third_idx, vec3(pos3.x, pos3.y, pos3.z), vec3(1.0, 1.2, 1.0));

  // --- Ring 4 ---
  let fourth_idx = extrude_ring(positions, indices, third_idx, colors, delta3to4);
  scale_around_point(positions, fourth_idx, vec3(pos4.x, pos4.y, pos4.z), vec3(1.0, 1.05, 1.0));
  
  let endPole = fill_ring_pole(positions, indices, fourth_idx, colors, vec3(0.0, 0.0, 0.0), true);

  // --- Rotations ---
  let end_idx = [...fourth_idx, ...endPole];
  rotate_around_point(positions, second_idx, vec3(pos2.x, pos2.y, pos2.z), vec3(10.0, 0.0, 0.0));
  rotate_around_point(positions, third_idx, vec3(pos3.x, pos3.y, pos3.z), vec3(15.0, 0.0, 0.0));
  rotate_around_point(positions, end_idx, vec3(pos4.x, pos4.y, pos4.z), vec3(25.0, 0.0, 0.0));

  all_idx.push(...first_idx, ...startPole, ...second_idx, ...third_idx, ...fourth_idx, ...endPole);

  return all_idx;
}

// Anal fin type enum used for anal fin function. Currently unused
export const afin_types = {
  SPIKY: "SPIKY",
  FEATHERY: "FEATHERY"
};
/**
 * Generates the anal fin geometry on the ventral (bottom) side of the fish.
 * Similar to the dorsal fin, it calculates the exact surface position using body splines,
 * but applies an "anchored scaling" technique to flare the fin downwards while maintaining
 * a tight connection to the body curvature.
 * @param {Array<Number>} positions - Array containing position data for vertices
 * @param {Array<Number>} indices - Array containing index data for vertices
 * @param {Array<Number>} colors - Array containing color data for vertices
 * @param {Number} afinLength - The longitudinal length of the fin
 * @param {Number} afinWidth - The thickness/width of the fin base
 * @param {Number} afinShift - The starting position of the fin along the spine (0.0 to 1.0)
 * @param {Array<Array<Number>>} posCtrlPoints - Control points for the body's position spline
 * @param {Array<Array<Number>>} scaleCtrlPoints - Control points for the body's scale/thickness spline
 * @param {Number} afinType - Identifier for the specific style of anal fin
 * @returns {Array<Number>} all_idx - Array of unique new geometry indices created by this function
 */
function gfish_anal_fin(positions, indices, colors, afinLength, afinWidth, afinShift, posCtrlPoints, scaleCtrlPoints, afinType) {

  // body splines for sampling
  const posPath = new CatmullRomSpline3D(posCtrlPoints, 0.5);
  const scalePath = new CatmullRomSpline3D(scaleCtrlPoints, 0.5);

  // constants to offset fin to make it look more natural
  const finRadius = afinWidth * 0.5;
  const embedOffset = afinWidth * 0.2; 

  // ensures length is not too long
  let clampedLength = Math.min(afinShift + afinLength, 0.9) - afinShift;

  // --- HELPER: Calculate Absolute Ring Center ---
  function getRingCenter(t) {
      let p = posPath.getPoint(t);   
      let s = scalePath.getPoint(t); 
      
      // yPos is the CENTER of the ring.
      // SpineY - BodyRadius - FinRadius moves center just below body.
      // + embedOffset tucks it slightly back in.
      let yPos = p[1] - s[1] - finRadius + embedOffset;
      
      return vec3(p[0], yPos, p[2]);
  }

  // get positions of start and end of fin
  let pos1 = getRingCenter(afinShift);
  let pos2 = getRingCenter(afinShift + clampedLength);

  let delta = subVec(pos2, pos1);

  // --- GEOMETRY GENERATION ---
  let all_idx = [];

  let first_idx = create_ring(positions, indices, colors, 6, 0.05, finRadius, pos1);
  let startPole = fill_ring_pole(positions, indices, first_idx, colors, vec3(0.0, 0.0, 0.0), false);

  let second_idx = extrude_ring(positions, indices, first_idx, colors, delta);
  
  let anchorPoint = vec3(pos2.x, pos2.y + finRadius, pos2.z);
  
  scale_around_point(positions, second_idx, anchorPoint, vec3(1.0, 3.0, 1.0));

  let endPole = fill_ring_pole(positions, indices, second_idx, colors, vec3(0.0, 0.0, 0.0), true);

  // group for end
  let end_idx = [...second_idx, ...endPole];

  all_idx.push(
    ...first_idx, 
    ...startPole, 
    ...end_idx
  );

  return all_idx;
}

/**
 * Generates a single pelvic fin (left or right) using a spline-based extrusion.
 * It constructs the fin shape using custom position and scale splines, applies specific
 * rotations to the tip for styling, and then uses a change-of-basis matrix to perfectly 
 * align the fin with the body's curved surface based on the provided normal and tangent vectors.
 * @param {Array<Number>} positions - Array containing position data for vertices
 * @param {Array<Number>} indices - Array containing index data for vertices
 * @param {Array<Number>} colors - Array containing color data for vertices
 * @param {Object} pelvicInfo - Packet containing surface data (pos, norm, tangent) for placement
 * @param {Number} pelvicLength - The length of the fin
 * @param {Number} pelvicWidth - The width of the fin
 * @param {Boolean} left - If true, generates the left fin; otherwise, the right fin
 * @returns {Array<Number>} all_idx - Array of unique new geometry indices created by this function
 */
function gfish_pelvic(positions, indices, colors, pelvicInfo, pelvicLength, pelvicWidth, left = true) {
  let origin = pelvicInfo.pos;
  let forward = pelvicInfo.norm;
  let up = pelvicInfo.tangent;

  let all_idx = [];
  all_idx = create_ring_spline(
    positions, indices, colors, 
    6, // num verts in a ring 
    4,// num rings in spline
    [  // position spline
      [0.0, 0.0, 0.0],
      [0.0, 0.0, pelvicLength * 0.5],
      [0.0, 0.03, pelvicLength * 0.75],
      [0.0, 0.0, pelvicLength]
    ], 
    [  // scale spline
      [0.02 * pelvicWidth, 0.01, 1.0],
      [0.02 * pelvicWidth, 0.01, 1.0],
      [0.07 * (pelvicWidth * 1.1), 0.01, 1.0],
      [0.04 * (pelvicWidth * 1.1), 0.01, 1.0]
    ],
    {x: 0, y: 0, z: 0.03 * pelvicLength}, //end pole offset
    {x: 0, y: 0, z: 0.0}  //begin pole offset
  );

  // take last two loops + cap
  let end_idx = all_idx.slice(all_idx.length - 14, all_idx.length - 1);
  let end_centroid = getCentroid(positions, end_idx);

  // rotate last 13 vertices to get pelvic fin shape (looks like a knee)
  if (left) {
    rotate_around_point(positions, end_idx, end_centroid, vec3(0.0, -30.0, 0.0));
    rotate_around_point(positions, all_idx, vec3(0.0, 0.0, 0.0), vec3(0.0, 0.0, -90.0));
  }
  else {
    rotate_around_point(positions, end_idx, end_centroid, vec3(0.0, 30.0, 0.0));
    rotate_around_point(positions, all_idx, vec3(0.0, 0.0, 0.0), vec3(0.0, 0.0, 90.0));
  }

  let newZ = forward;
  let newX = normalize(cross(up, newZ));
  let newY = normalize(cross(newZ, newX));

  let matrix = [
      newX.x, newX.y, newX.z,
      newY.x, newY.y, newY.z,
      newZ.x, newZ.y, newZ.z
  ];

  // rotate to be perpendicular to body
  apply_matrix_transform(positions, all_idx, matrix, {x: 0.0, y: 0.0, z: 0.0});

  //console.log(pectoralPos);
  translate(positions, all_idx, origin);
  //rotate_around_point();
  return all_idx;
}

/**
 * Generates a pectoral fin using spline-based extrusion.
 * It creates the geometry based on length/width parameters and 
 * orients the fin so that it protrudes in a perpendicular manner to the 
 * curved surface of the fish's body, using the normal and tangent 
 * vectors provided in the info packet.
 * @param {Array<Number>} positions - Array containing position data for vertices
 * @param {Array<Number>} indices - Array containing index data for vertices
 * @param {Array<Number>} colors - Array containing color data for vertices
 * @param {Array<Object>} pivots - Array containing pivot data for animation
 * @param {Object} pectoralInfo - Packet containing surface data (pos, norm, tangent) for placement
 * @param {Number} pectoralLength - The length of the fin
 * @param {Number} pectoralWidth - The width of the fin
 * @returns {Array<Number>} all_idx - Array of unique new geometry indices created by this function
 */
function gfish_pectoral(positions, indices, colors, pivots, pectoralInfo, pectoralLength, pectoralWidth) {
  let origin = pectoralInfo.pos;
  let forward = pectoralInfo.norm;
  let up = pectoralInfo.tangent;

  let all_idx = [];
  all_idx = create_ring_spline(
    positions, indices, colors, 
    6, // num verts in a ring 
    4,// num rings in spline
    [  // position spline
      [0.0, 0.0, 0.0],
      [0.0, 0.0, pectoralLength * 0.5],
      [0.0, 0.03 - (pectoralLength * 0.075), pectoralLength * 0.75],
      [0.0, 0.0 + (pectoralLength * 0.3), pectoralLength]
    ], 
    [  // scale spline
      [0.02 * pectoralWidth, 0.01, 1.0],
      [0.02 * pectoralWidth, 0.01, 1.0],
      [0.07 * (pectoralWidth * 1.1), 0.01, 1.0],
      [0.04 * (pectoralWidth * 1.1), 0.01, 1.0]
    ],
    {x: 0, y: 0, z: 0.03}, //end pole offset
    {x: 0, y: 0, z: 0.0}  //begin pole offset
  );

  let newZ = forward;
  let newX = normalize(cross(up, newZ));
  let newY = normalize(cross(newZ, newX));

  let matrix = [
      newX.x, newX.y, newX.z,
      newY.x, newY.y, newY.z,
      newZ.x, newZ.y, newZ.z
  ];

  // rotate to be perpendicular to body
  apply_matrix_transform(positions, all_idx, matrix, {x: 0.0, y: 0.0, z: 0.0});

  translate(positions, all_idx, origin);
  return all_idx;
}

// make sure this is called after creating geometry, assumes everything is in order
function assignLabel(labels, label_idx, labelVal)
{
  for (let i = 0; i <  label_idx.length; ++i) 
  {
    labels.push(labelVal);
  }
}

// similarly fragile to assignLabel, but assigns pivot values
function assignPivot(pivots, pivot_idx, pivotVal = {})
{
  for (let i = 0; i < pivot_idx.length; ++i)
  {
    pivots.push(pivotVal.x, pivotVal.y, pivotVal.z);
  }
}

// COMBINED GOLDFISH FUNCTION --------------------------------------------------------

/**
 * Generates a procedural goldfish.
 * @param {Array<Number>} positions - Array containing position data for vertices
 * @param {Array<Number>} indices - Array containing index data for vertices
 * @param {Array<Number>} colors - Array containing color data for vertices
 * @param {Array<Number>} labels - Array containing label data for vertices (used for shader logic/picking)
 * @param {Array<Object>} pivots - Array containing pivot data for animation
 * * // Body Params
 * @param {Number} bodyLength - Length of the main fuselage
 * @param {Number} bodyHeight - Height of the main fuselage
 * @param {Number} bodyWidth - Width of the main fuselage
 * @param {Number} arch - Curvature/Arch of the spine
 * * // Head Params
 * @param {Object|Number} headSize - Size/Scale of the head
 * @param {Number} eyeType - Enum identifier for eye style
 * @param {Number} mouthTilt - Vertical tilt of the mouth
 * @param {Number} eyeScale - Scale factor for the eyes
 * * // Caudal (Tail) Params
 * @param {Number} caudalLength - Length of the tail fin
 * @param {Number} caudalWidth - Width of the tail fin
 * @param {Number} caudalType - Enum identifier for tail style
 * @param {Number} caudalCurve - Curvature intensity of the tail
 * * // Dorsal Fin Params
 * @param {Number} dorsalLength - Length of the dorsal fin
 * @param {Number} dorsalWidth - Width of the dorsal fin
 * @param {Number} dorsalShift - Position along the spine (0.0-1.0)
 * @param {Number} dorsalType - Enum identifier for dorsal fin style
 * * // Pelvic Fin Params
 * @param {Number} pelvicLength - Length of the pelvic fins
 * @param {Number} pelvicWidth - Width of the pelvic fins
 * @param {Number} pelvicShift - Position along the body (0.0-1.0)
 * @param {Number} pelvicAngle - Rotational angle of the fins
 * * // Pectoral Fin Params
 * @param {Number} pectoralLength - Length of the pectoral fins
 * @param {Number} pectoralWidth - Width of the pectoral fins
 * @param {Number} pectoralShift - Position along the body (0.0-1.0)
 * @param {Number} pectoralAngle - Rotational angle of the fins
 * * // Anal Fin Params
 * @param {Number} afinLength - Length of the anal fin
 * @param {Number} afinWidth - Width of the anal fin
 * @param {Number} afinType - Enum identifier for anal fin style
 * @param {Number} afinShift - Position along the spine (0.0-1.0)
 */
export function goldfish(
    positions, indices, colors, labels, pivots,
    // body params 
    bodyLength, bodyHeight, bodyWidth, arch,
    // head params
    headSize, eyeType, mouthTilt, eyeScale,
    // caudal params
    caudalLength, caudalWidth, caudalType, caudalCurve,
    // dorsal params
    dorsalLength, dorsalWidth, dorsalShift, dorsalType,
    // pelvic params
    pelvicLength, pelvicWidth, pelvicShift, pelvicAngle,
    // pectoral params
    pectoralLength, pectoralWidth, pectoralShift, pectoralAngle,
    // afin params
    afinLength, afinWidth, afinType, afinShift
  ) {
  let pectoralInfoPacket =
  {
    l: {
      pos: {x: 0.0, y: 0.0, z: 0.0}, 
      norm: {x: 0.0, y: 1.0, z: 0.0}, 
      tangent: {x: 0.0, y: 1.0, z: 0.0}
    },
    r: {
      pos: {x: 0.0, y: 0.0, z: 0.0}, 
      norm: {x: 0.0, y: 1.0, z: 0.0}, 
      tangent: {x: 0.0, y: 1.0, z: 0.0}
    }
  };

  let pelvicInfoPacket =
  {
    l: {
      pos: {x: 0.0, y: 0.0, z: 0.0}, 
      norm: {x: 0.0, y: 1.0, z: 0.0}, 
      tangent: {x: 0.0, y: 1.0, z: 0.0}
    },
    r: {
      pos: {x: 0.0, y: 0.0, z: 0.0}, 
      norm: {x: 0.0, y: 1.0, z: 0.0}, 
      tangent: {x: 0.0, y: 1.0, z: 0.0}
    }
  };
  let head_pos = {x: 0.0, y: 0.0, z: 0.0};
  let caudal_pos = vec3(0.0, 0.0, 0.0);
  let head_body_size = vec3(0.0, 0.0, 0.0);
  let posCtrlPoints = [];
  let scaleCtrlPoints = [];

  // previously defined pos/info/splines get updated via this function
  let body_idx = gfish_body(
    positions, indices, colors, 
    bodyLength, bodyHeight, bodyWidth, arch,
    pectoralInfoPacket, pectoralShift, pectoralAngle,
    pelvicInfoPacket, pelvicShift, pelvicAngle,
    caudal_pos,
    head_pos, head_body_size,
    posCtrlPoints,
    scaleCtrlPoints
  );
  assignLabel(labels, body_idx, 0);
  assignPivot(pivots, body_idx, getCentroid(positions, body_idx));

  let pectoral_idx = gfish_pectoral(positions, indices, colors, pivots, pectoralInfoPacket.l, pectoralLength, pectoralWidth);
  assignPivot(pivots, pectoral_idx, pectoralInfoPacket.l.pos);

  let pectoral_idx2 = gfish_pectoral(positions, indices, colors, pivots, pectoralInfoPacket.r, pectoralLength, pectoralWidth);
  assignPivot(pivots, pectoral_idx, pectoralInfoPacket.r.pos);

  let bothPectoral_idx = [...pectoral_idx, ...pectoral_idx2];
  assignLabel(labels, bothPectoral_idx, 6);

  let pelvic_idx = gfish_pelvic(positions, indices, colors, pelvicInfoPacket.l, pelvicLength, pelvicWidth, true);
  assignPivot(pivots, pelvic_idx, pelvicInfoPacket.l.pos);

  let pelvic_idx2 = gfish_pelvic(positions, indices, colors, pelvicInfoPacket.r, pelvicLength, pelvicWidth, false);
  assignPivot(pivots, pelvic_idx2, pelvicInfoPacket.r.pos);
  
  let bothPelvic_idx = [...pelvic_idx, ...pelvic_idx2];
  assignLabel(labels, bothPelvic_idx, 1);

  // add uneven shape to the head scale
  headSize.x *= 0.1;
  headSize.y *= 0.2;
  // assigns labels to eyes/head within the function
  // also assigns pivots for eyes
  gfish_head(positions, indices, colors, labels, pivots, head_pos, head_body_size, headSize, eyeScale, eye_types.BUBBLY, mouthTilt);
  
  let caudal_idx = gfish_caudal(positions, indices, colors, pivots, caudal_pos, caudalLength, caudalWidth, caudalCurve, bodyLength, caudal_types.VBUTT); 
  assignLabel(labels, caudal_idx, 7);

  let dorsal_idx = gfish_dorsal(positions, indices, colors, dorsalLength, dorsalWidth, dorsalShift, posCtrlPoints, scaleCtrlPoints, dorsalType);
  assignLabel(labels, dorsal_idx, 5);
  assignPivot(pivots, dorsal_idx, getCentroid(positions, dorsal_idx)); // not used currently

  let afin_idx = gfish_anal_fin(positions, indices, colors, afinLength, afinWidth, afinShift, posCtrlPoints, scaleCtrlPoints, afinType);
  assignLabel(labels, afin_idx, 5);
  assignPivot(pivots, afin_idx, getCentroid(positions, afin_idx)); // not used currently
}