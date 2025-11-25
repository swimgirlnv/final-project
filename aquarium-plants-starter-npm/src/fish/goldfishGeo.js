import { 
    getPos,
    getRingData,
    create_subdiv_box, 
    create_ring, 
    extrude_ring, 
    fill_ring_pole, 
    fill_ring_fan, 
    scale_around_point, 
    apply_rotation, 
    rotate_around_point, 
    translate, 
    create_ring_spline, 
    sphere,
    getCentroid,
    bend
} from "./proceduralSculpting.js";
import {
    length,
    normalize,
    cross,
    sub,
    addVec,
    scaleVec,
    apply_matrix_transform,
    vec3
} from "./linearTools.js";
import { CatmullRomSpline3D } from "./splineVec3.js";

// ---------- GOLDFISH BODY PART GENERATORS. PASS POS/IDX ARRAYS BY REFERENCE FOR UPDATE
function gfish_body(positions, indices, colors, bodyLength, height, width, arch, 
    pectoralInfoPacket, pectoralShift, pectoralAngle,
    pelvicInfoPacket, pelvicShift, pelvicAngle,
    caudal_pos, 
    head_pos, head_body_size,
    posCtrlPoints_out,
    scaleCtrlPoints_out  
) {
  const posCtrlPoints = 
  [  // position spline
    [0.0, 1.0 - arch, 0.0],
    [0.0, 1.02 - (arch * 0.5), bodyLength * 0.4],
    [0.0, 1.03, bodyLength * 0.7],
    [0.0, 1.035, bodyLength]
  ];
  posCtrlPoints_out.push(...posCtrlPoints);
  const scaleCtrlPoints = 
  [  // scale spline
    [width * 0.3, height * 0.5, 1.0],
    [width * 0.45, height, 1.0],
    [width * 0.35, height * 0.52, 1.0],
    [width * 0.2, height * 0.25, 1.0]
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

  caudal_pos.x = 0.0;
  caudal_pos.y = 1.035;
  caudal_pos.z = bodyLength;

  head_pos.x = 0.0;
  head_pos.y = 1.0 - arch;
  head_pos.z = 0.0;

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
  head_body_size.x = neck_scale[0];
  head_body_size.y = neck_scale[1];
  head_body_size.z = neck_scale[2];

  function getDoubleFinInfo(finInfoPacket, shift, angle) {
    let finPos = posPath.getPoint(shift);
    let spinePos = { x: finPos[0], y: finPos[1], z: finPos[2] };
    let finScale = scalePath.getPoint(shift);

    let nextShift = Math.min(shift + 0.01, 1.0);
    let nextPosArr = posPath.getPoint(nextShift);
    let nextPosVec = {x: nextPosArr[0], y: nextPosArr[1], z: nextPosArr[2]};
    let spineTangent = normalize(sub(nextPosVec, spinePos));

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
    const normL = normalize(sub(lPos, spinePos));

    finInfoPacket.l.pos = lPos;
    finInfoPacket.l.norm = normL;
    finInfoPacket.l.tangent = spineTangent;

    let rPos = {
        x: finPos[0] + offset.x * 0.9,
        y: finPos[1] + offset.y * 0.9,
        z: finPos[2]
    };
    const normR = normalize(sub(rPos, spinePos));

    finInfoPacket.r.pos = rPos;
    finInfoPacket.r.norm = normR;
    finInfoPacket.r.tangent = spineTangent;
    return;
  }
  
  getDoubleFinInfo(pectoralInfoPacket, pectoralShift, pectoralAngle);
  getDoubleFinInfo(pelvicInfoPacket, pelvicShift, pelvicAngle);

  let pelvPos = posPath.getPoint(pelvicShift);
  let pelvScale = scalePath.getPoint(pelvicShift);

  // set positions of fins using input angle

  // dorsal_pos;
  // dorsalShift

  // afin_pos; 

  // pectoral_pos = {r: {}, l: {}}; 
  // pectoralShift;

  // pelvic_pos = {r: {}, l: {}}; 
  // pelvicShift; 

  
  return all_idx;
}

function fill_ring_mouth(positions, indices, colors, orig_ring_indices, mouthStickOut, topLipSize, topLipOffset, botLipSize, botLipOffset) {
    const numVerts = orig_ring_indices.length;

    // 1. Validation
    if (numVerts % 2 !== 0) {
        console.error("fill_ring_mouth requires an even number of vertices.");
        return [];
    }
    const halfVerts = numVerts / 2;

    // 2. Orientation & Corner Identification
    const { center, forward } = getRingData(positions, orig_ring_indices);
    
    let rightCornerIdx = orig_ring_indices[0];
    let leftCornerIdx = orig_ring_indices[halfVerts];
    let rightPos = getPos(rightCornerIdx, positions);
    let leftPos = getPos(leftCornerIdx, positions);

    // 3. Create the Seam
    // We explicitly track NEW indices to avoid duplicate vertex bugs later
    let newSeamIndices = []; 
    let slitIndices = [rightCornerIdx]; 

    // Flatten Y to average
    let seamY = (rightPos.y + leftPos.y) / 2.0;

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

    // 4. Bridge the Seam
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

    // 5. Define Loops
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

    // 7. Cap Ends (Using POLE instead of FAN)
    // The 'offset' for the pole is 0,0,0 relative to the average center of the lip
    let poleOffset = {x:0, y:0, z:0};
    
    // 8. Transform (Include the caps!)
    let topLipCentroid = getCentroid(positions, topLipIndices);
    scale_around_point(positions, topLipIndices, topLipCentroid, topLipSize);
    translate(positions, topLipIndices, topLipOffset);

    let botLipCentroid = getCentroid(positions, botLipIndices);
    scale_around_point(positions, botLipIndices, botLipCentroid, botLipSize);
    translate(positions, botLipIndices, botLipOffset);
    
    // Reverse = true usually points the face outward for extruded caps
    let topCapIndices = fill_ring_pole(positions, indices, topLipIndices, colors, poleOffset, true);
    let botCapIndices = fill_ring_pole(positions, indices, botLipIndices, colors, poleOffset, true);

    // 9. Return
    return [...newSeamIndices, ...topLipIndices, ...botLipIndices, ...topCapIndices, ...botCapIndices];
}
export const eye_types = {
  BULGE: "BULGE",
  GOOGLY: "GOOGLY",
  CHEEKS: "CHEEKS",
  BUBBLY: "BUBBLY" 
};
function gfish_head(positions, indices, colors, headPos, neckSize, headSize = {}, eyeType, mouthTilt = 0.0) {
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

  let all_idx = create_ring_spline(
    positions, indices, colors,
    numVertsRing, // num verts in a ring (MUST BE EVEN for the mouth func to work)
    20,// num rings in spline
    posCtrlPoints, 
    scaleCtrlPoints,
    {x: 0, y: 0, z: headSize.z * 0.05}, //end pole offset
    {x: 0, y: 0, z: 0.0},  //begin pole offset,
    {r: 0.1, g: 0.5, b: 0.1},
    false,
    true
  );

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
    let l_slopeVec = normalize(sub(lPos1, lPos0));
    let r_slopeVec = normalize(sub(rPos1, rPos0));

    // Vector B: The curve around the body (Latitudinal / Up)
    // We can approximate this by crossing the Spine Tangent with the Radial Vector
    let spineTangent = normalize(sub({x: pos1[0], y: pos1[1], z: pos1[2]}, spinePos0));
    
    let l_radial = normalize(sub(lPos0, spinePos0));
    let r_radial = normalize(sub(rPos0, spinePos0));

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
    
    return;
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
    let fcn_eye_idx = sphere(positions, indices, colors, {x: 0.0, y: 0.0, z: 0.0}, {r: 0.1, g: 0.1, b: 0.5}, 1.0);
    
    // 1. Flatten the eye so we can see the orientation.
    // Z is 0.3 (Thin disk). 
    scale_around_point(positions, fcn_eye_idx, {x: 0.0, y: 0.0, z: 0.0}, {x: 5.0 * headSize.x + 0.15, y: 5.0 * headSize.x + 0.15, z: 5.0 * headSize.x + 0.15});
    rotate_around_point(positions, fcn_eye_idx, {x: 0.0, y: 0.0, z: 0.0}, {x: 90.0, y: 0.0, z: 0.0})

    let fcn_origin = eyeInfo.pos;
    let fcn_forward = eyeInfo.norm;    // The Normal (Out of skin)
    let fcn_spine_tan = eyeInfo.tangent; // The direction of the spine

    // 2. Construct the Orthogonal Basis (Gram-Schmidt-like process)
    
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

    // 4. Translate to position
    // OPTIONAL: Add a tiny offset along the normal to prevent Z-fighting/Clipping
    // let offsetPos = addVec(fcn_origin, scaleVec(newZ, 0.02)); 
    translate(positions, fcn_eye_idx, fcn_origin);

    return fcn_eye_idx;
  }

  let eyeR_idx = positionEye(infoPacket.l);
  all_idx.push(...eyeR_idx);
  let eyeL_idx = positionEye(infoPacket.r);
  all_idx.push(...eyeL_idx);
  // Making the mouth

  let lastRingStartIdx = all_idx[all_idx.length - numVertsRing - eyeR_idx.length - eyeL_idx.length - 1];
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
  all_idx.push(...mouth_idx);
  
  rotate_around_point(positions, all_idx, {x: 0.0, y: 0.0, z: 0.0}, {x: 0.0, y: 180.0, z: 0.0});
  translate(positions, all_idx, headPos);
  // end cap with special mouth geo function
  return all_idx;
}

export const caudal_types = {
  DROOPY: "DROOPY",
  VSLOPE: "VSLOPE",
  FEATHERY: "FEATHERY",
  VBUTT: "VBUTT",
  BUTTERFLY: "BUTTERFLY"
};
function gfish_caudal(positions, indices, colors, caudalPos, caudalLength, caudalWidth, bodyLength, caudalType) {
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
    1.5,                    // Amount (Swish strength)
    vec3(0, 0, 0),          // Origin (The root of the tail)
    caudalLength * 0.9,           // Max Length (For normalization)
    2,                      // Scale Axis: Z (Distance along the tail)
    1                       // Application Axis: X (Side-to-side movement)
  );
  bend(
    positions, 
    secondHalf, 
    -1.5,                    // Amount (Swish strength)
    vec3(0, 0, 0),          // Origin (The root of the tail)
    caudalLength * 0.9,           // Max Length (For normalization)
    2,                      // Scale Axis: Z (Distance along the tail)
    1                       // Application Axis: X (Side-to-side movement)
  );
  
  translate(positions, all_idx, caudalPos);

  return all_idx;
}

export const dorsal_types = {
  MANE: "MANE",
  PUNK: "PUNK",
  SWEPT: "SWEPT"
};
function gfish_dorsal(positions, indices, colors, dorsalLength, dorsalWidth, dorsalShift, posCtrlPoints, scaleCtrlPoints, dorsalType) {
  
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

  // 3. Pre-calculate positions (now slightly lower)
  let pos1 = getRingCenter(dorsalShift);
  let pos2 = getRingCenter(dorsalShift + incVal);
  let pos3 = getRingCenter(dorsalShift + incVal * 2.0);
  let pos4 = getRingCenter(dorsalShift + incVal * 3.0);

  let delta1to2 = sub(pos2, pos1);
  let delta2to3 = sub(pos3, pos2);
  let delta3to4 = sub(pos4, pos3);

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

function gfish_pelvic(positions, indices, colors, pelvicInfo, pelvicLength, pelvicWidth, left = true) {
  let origin = pelvicInfo.pos;
  let forward = pelvicInfo.norm;
  let up = pelvicInfo.tangent;

  // subdiv cube with fun values
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

  // rotate last 13 vertices to get pelvic fin shape
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

  apply_matrix_transform(positions, all_idx, matrix, {x: 0.0, y: 0.0, z: 0.0});

  //console.log(pectoralPos);
  translate(positions, all_idx, origin);
  //rotate_around_point();
  return all_idx;
}

function gfish_pectoral(positions, indices, colors, pectoralInfo, pectoralLength, pectoralWidth) {
  let origin = pectoralInfo.pos;
  let forward = pectoralInfo.norm;
  let up = pectoralInfo.tangent;

  // subdiv cube with fun values
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

  apply_matrix_transform(positions, all_idx, matrix, {x: 0.0, y: 0.0, z: 0.0});

  //console.log(pectoralPos);
  translate(positions, all_idx, origin);
  //rotate_around_point();
  return all_idx;
}

export const afin_types = {
  SPIKY: "SPIKY",
  FEATHERY: "FEATHERY"
};
function gfish_anal_fin(positions, indices, colors, afinLength, afinWidth, afinShift, posCtrlPoints, scaleCtrlPoints, afinType) {
  
  const posPath = new CatmullRomSpline3D(posCtrlPoints, 0.5);
  const scalePath = new CatmullRomSpline3D(scaleCtrlPoints, 0.5);

  // 1. Define Radius and Embed Amount
  const finRadius = afinWidth * 0.5;
  
  // ADD this to the height (since we are on the bottom, adding moves it UP into the body)
  const embedOffset = afinWidth * 0.2; 

  // ensures length is not too long
  let clampedLength = Math.min(afinShift + afinLength, 0.9) - afinShift;

  // --- HELPER: Calculate Absolute Ring Center ---
  function getRingCenter(t) {
      let p = posPath.getPoint(t);   
      let s = scalePath.getPoint(t); 
      
      // Logic: Spine - Skin_Height - Fin_Radius + Embed_Amount
      // We subtract s[1] and finRadius to move to the bottom edge.
      // We ADD embedOffset to tuck it slightly back inside the mesh.
      let yPos = p[1] - s[1] - finRadius + embedOffset;
      
      return vec3(p[0], yPos, p[2]);
  }

  // 2. Pre-calculate absolute positions
  let pos1 = getRingCenter(afinShift);
  let pos2 = getRingCenter(afinShift + clampedLength);

  // 3. Calculate Delta for exact extrusion
  let delta = sub(pos2, pos1);

  // --- GEOMETRY GENERATION ---
  let all_idx = [];

  // Ring 1 (Start)
  let first_idx = create_ring(positions, indices, colors, 6, 0.05, finRadius, pos1);
  let startPole = fill_ring_pole(positions, indices, first_idx, colors, vec3(0.0, 0.0, 0.0), false);

  // Ring 2 (End)
  // Extrude using the delta vector so it follows the body slope perfectly
  let second_idx = extrude_ring(positions, indices, first_idx, colors, delta);
  
  // Apply the flair scaling (from your original code) around the calculated center
  scale_around_point(positions, second_idx, vec3(pos2.x, pos2.y, pos2.z), vec3(1.0, 3.0, 1.0));

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

export function goldfish(
    positions, indices, colors,
    // body params 
    bodyLength, bodyHeight, bodyWidth, arch,
    // head params
    headSize, eyeType, mouthTilt,
    // caudal params
    caudalLength, caudalWidth, caudalType,
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
  gfish_body(
    positions, indices, colors, 
    bodyLength, bodyHeight, bodyWidth, arch,
    pectoralInfoPacket, pectoralShift, pectoralAngle,
    pelvicInfoPacket, pelvicShift, pelvicAngle,
    caudal_pos,
    head_pos, head_body_size,
    posCtrlPoints,
    scaleCtrlPoints
  );

  gfish_pectoral(positions, indices, colors, pectoralInfoPacket.l, pectoralLength, pectoralWidth);
  gfish_pectoral(positions, indices, colors, pectoralInfoPacket.r, pectoralLength, pectoralWidth);

  gfish_pelvic(positions, indices, colors, pelvicInfoPacket.l, pelvicLength, pelvicWidth, true);
  gfish_pelvic(positions, indices, colors, pelvicInfoPacket.r, pelvicLength, pelvicWidth, false);

  headSize.x *= 0.1;
  headSize.y *= 0.2;
  gfish_head(positions, indices, colors, head_pos, head_body_size, headSize, eye_types.BUBBLY, mouthTilt);
  gfish_caudal(positions, indices, colors, caudal_pos, caudalLength, caudalWidth, bodyLength, caudal_types.VBUTT); 
  gfish_dorsal(positions, indices, colors, dorsalLength, dorsalWidth, dorsalShift, posCtrlPoints, scaleCtrlPoints, dorsalType);
  gfish_anal_fin(positions, indices, colors, afinLength, afinWidth, afinShift, posCtrlPoints, scaleCtrlPoints, afinType);

  return;
}