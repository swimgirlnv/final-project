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
    getCentroid
} from "./proceduralSculpting.js";
import {
    length,
    normalize,
    cross,
    sub,
    addVec,
    scaleVec,
    apply_matrix_transform
} from "./linearTools.js";
import { CatmullRomSpline3D } from "./splineVec3.js";

// ---------- GOLDFISH BODY PART GENERATORS. PASS POS/IDX ARRAYS BY REFERENCE FOR UPDATE
function gfish_body(positions, indices, colors, bodyLength, height, width, belly, arch, 
    pectoralInfoPacket, pectoralShift, pectoralAngle,
    pelvicInfoPacket, pelvicShift, pelvicAngle,
    afin_pos, afinShift, afinAngle,
    dorsal_pos, dorsalShift, 
    caudal_pos, 
    head_pos  
) {
  const posCtrlPoints = 
  [  // position spline
    [0.0, 1.0 - arch, 0.0],
    [0.0, 1.02 - (arch * 0.5), bodyLength * 0.4],
    [0.0, 1.03, bodyLength * 0.7],
    [0.0, 1.035, bodyLength]
  ];
  const scaleCtrlPoints = 
  [  // scale spline
    [width * 0.3, height * 0.5, 1.0],
    [width * 0.45, height, 1.0],
    [width * 0.35, height * 0.52, 1.0],
    [width * 0.2, height * 0.25, 1.0]
  ];

  // use spline with radius value, interpolate with even rings for body
  let all_idx = [];
  all_idx = create_ring_spline(
    positions, indices, colors,
    8, // num verts in a ring
    10,// num rings in spline
    posCtrlPoints, 
    scaleCtrlPoints,
    {x: 0, y: 0, z: 0.0}, //end pole offset
    {x: 0, y: 0, z: -0.025}  //begin pole offset
  );

  caudal_pos.x = 0.0;
  caudal_pos.y = 1.035;
  caudal_pos.z = bodyLength;
  let caudal_idx = sphere(positions, indices, colors, caudal_pos, {r: 0.0, g: 1.0, b: 0.0});
  all_idx.push(...caudal_idx);

  head_pos.x = 0.0;
  head_pos.y = 1.0 - arch;
  head_pos.z = 0.0;
  let head_idx = sphere(positions, indices, colors, head_pos, {r: 0.0, g: 1.0, b: 0.0});
  all_idx.push(...head_idx);

  const posPath = new CatmullRomSpline3D(
    posCtrlPoints,
    0.5
  );

  const scalePath = new CatmullRomSpline3D(
    scaleCtrlPoints,
    0.5
  );

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
        x: finPos[0] - offset.x,
        y: finPos[1] + offset.y,
        z: finPos[2]
    };
    const normL = normalize(sub(lPos, spinePos));

    finInfoPacket.l.pos = lPos;
    finInfoPacket.l.norm = normL;
    finInfoPacket.l.tangent = spineTangent;

    let rPos = {
        x: finPos[0] + offset.x,
        y: finPos[1] + offset.y,
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

  let pec_right_idx = sphere(positions, indices, colors, pectoralInfoPacket.r.pos, {r: 0.0, g: 1.0, b: 0.0});
  all_idx.push(...pec_right_idx);
  let pec_left_idx = sphere(positions, indices, colors, pectoralInfoPacket.l.pos, {r: 0.0, g: 1.0, b: 0.0});
  all_idx.push(...pec_left_idx);

  let pelvPos = posPath.getPoint(pelvicShift);
  let pelvScale = scalePath.getPoint(pelvicShift);

  let afPos = posPath.getPoint(); // replace with afin_shift
  let afScale = scalePath.getPoint(); //

  // set positions of fins using input angle

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
function gfish_head(positions, indices, colors, headPos, size = {}, eyeType, mouthTilt = 0.0) {
  // ring, extrude while scaling down
  const numVertsRing = 8;

  let posCtrlPoints = 
  [  // position spline
    [0.0, 0.0, 0.0],
    [0.0, 0.0, size.z * 0.5],
    [0.0, mouthTilt, size.z]
  ];
  let scaleCtrlPoints = 
  [  // scale spline
    [size.x, size.y, 1.0],
    [size.x * 0.7, size.y * 0.7, 1.0],
    [size.x * 0.4, size.y * 0.4, 1.0]
  ];

  let all_idx = create_ring_spline(
    positions, indices, colors,
    numVertsRing, // num verts in a ring (MUST BE EVEN for the mouth func to work)
    4,// num rings in spline
    posCtrlPoints, 
    scaleCtrlPoints,
    {x: 0, y: 0, z: size.z * 0.05}, //end pole offset
    {x: 0, y: 0, z: 0.0},  //begin pole offset,
    {r: 0.1, g: 0.5, b: 0.1},
    false,
    true
  );

  let lastRingStartIdx = all_idx[all_idx.length - numVertsRing - 1];
  let finalRingIndices = [];
  for (let i = 0; i < numVertsRing; ++i)
  {
    finalRingIndices.push(lastRingStartIdx + i);
  }

  let mouthStickOut = size.z * 0.1;
  let mouthScale = 0.5;

  let mouth_idx = fill_ring_mouth(
    positions, indices, colors,
    finalRingIndices,
    mouthStickOut,
    // top size, offset
    {x: 1.0, y: 1.0, z: 1.0},
    {x:0.0, y:0.0, z:0.0},
    // bot size, offset
    {x: 1.0, y: 1.0, z: 1.0},
    {x:0.0, y:0.0, z:0.0}
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
function gfish_caudal(positions, indices, colors, caudalPos, caudalLength, width, caudalType) {
  // cube (/loop) with special deformation
  let all_idx = create_subdiv_box(
    positions, indices, colors, 
    4, 4, 4, 1, 2, 3
  );
  return;
}

export const dorsal_types = {
  MANE: "MANE",
  PUNK: "PUNK",
  SWEPT: "SWEPT"
};
function gfish_dorsal(positions, indices, colors, dorsalPos, dorsalLength, width, dorsalType) {
  // cube (/loop) with special deformation, maybe follow spline
  return;
}

function gfish_pelvic(positions, indices, colors, pelvicInfo, pelvicLength, width) {
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
      [0.0, 0.0, 0.2],
      [0.0, 0.03, 0.3],
      [0.0, 0.0, 0.4]
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

function gfish_pectoral(positions, indices, colors, pectoralInfo, pectoralLength, width) {
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
      [0.0, 0.0, 0.2],
      [0.0, 0.03, 0.3],
      [0.0, 0.0, 0.4]
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
function gfish_anal_fin(positions, indices, colors, afinPos, afinLength, width, afinType, pos) {
  // same as dorsal, but smaller and probably less variety (all references looked the same here)
  return;
}

export function goldfish(
    positions, indices, colors,
    // body params 
    bodyLength, bodyHeight, bodyWidth, belly_size, arch,
    // head params
    headSize, eyeType, mouthTilt,
    // caudal params
    caudalLength, caudalWidth, caudalType, caudalAngle,
    // dorsal params
    dorsalLength, dorsalWidth, dorsalShift, dorsalType,
    // pelvic params
    pelvicLength, pelvicWidth, pelvicShift, pelvicAngle,
    // pectoral params
    pectoralLength, pectoralWidth, pectoralShift, pectoralAngle,
    // afin params
    afinLength, afinWidth, afinType, afinShift, afinAngle
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

  let afin_pos = {x: 0.0, y: 0.0, z: 0.0};
  let afin_norm = {x: 0.0, y: 1.0, z: 0.0};

  let dorsal_pos = {x: 0.0, y: 0.0, z: 0.0};
  let caudal_pos = {x: 0.0, y: 0.0, z: 0.0};
  let head_pos = {x: 0.0, y: 0.0, z: 0.0};

  gfish_body(
    positions, indices, colors, 
    bodyLength, bodyHeight, bodyWidth, belly_size, arch,
    pectoralInfoPacket, pectoralShift, pectoralAngle,
    pelvicInfoPacket, pelvicShift, pelvicAngle,
    afin_pos, afinShift, afinAngle,
    dorsal_pos, dorsalShift,
    caudal_pos, 
    head_pos  
  );

  gfish_pectoral(positions, indices, colors, pectoralInfoPacket.l, pectoralLength, pectoralWidth);
  gfish_pectoral(positions, indices, colors, pectoralInfoPacket.r, pectoralLength, pectoralWidth);

  gfish_pelvic(positions, indices, colors, pelvicInfoPacket.l, pelvicLength, pelvicWidth);
  gfish_pelvic(positions, indices, colors, pelvicInfoPacket.r, pelvicLength, pelvicWidth);

  let head_size = {x: 0.6, y: 0.6, z: 1.0};
  gfish_head(positions, indices, colors, head_pos, head_size, eyeType.BUBBLY, 0.0);
  // gfish_head(positions, indices, colors, head_pos, headSize, eyeType, mouthTilt);
  // gfish_caudal(positions, indices, colors, caudal_pos, caudalLength, caudalWidth, caudalType);
  // gfish_dorsal(positions, indices, colors, dorsal_pos, dorsalLength, dorsalWidth, dorsalType);
  // gfish_pelvic(positions, indices, colors, pelvic_pos, pelvicLength, pelvicWidth, pelvic_pos);
  // gfish_pectoral(positions, indices, colors, pectoral_pos, pectoralLength, pectoralWidth, pectoral_pos);
  // gfish_anal_fin(positions, indices, colors, afin_pos, afinLength, afinWidth, afinType, afin_pos);

  return;
}