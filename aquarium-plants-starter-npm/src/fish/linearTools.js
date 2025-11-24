// helper "vec3" functions

export function vec3(x, y, z) {
  return {x: x, y: y, z: z};
}

export function length(vecObj = {}) 
{
  if (vecObj.x == null || vecObj.y == null || vecObj.z == null) {
    console.log('ERROR - Forgot to pass arguments to length() function: ${vecObj}');
  }
  else {
    return Math.sqrt(Math.pow(vecObj.x, 2.0) + Math.pow(vecObj.y, 2.0) + Math.pow(vecObj.z, 2.0));
  }
}

// epsilon is minimum float number used to check for zero length
export function normalize(vecObj = {}, epsilon = Number.MIN_VALUE) 
{
  let len = length(vecObj);
  if (vecObj.x == null || vecObj.y == null || vecObj.z == null || Math.abs(len) <= epsilon) {
    console.log('ERROR - Issue with arguments to noralize() function: ${vecObj}');
  }
  else {
    return {x: vecObj.x / len, y: vecObj.y / len, z: vecObj.z / len};
  }
}

// Cross product
export function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x
  };
}

// vector subtract
export function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
export function addVec(a, b) { 
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; 
}
export function scaleVec(v, s) { 
  return { x: v.x * s, y: v.y * s, z: v.z * s }; 
}

// Transform points by a 3x3 Matrix (Basis Vectors)
// matrix = [ xAxis.x, xAxis.y, xAxis.z, yAxis.x, ... ]
export function apply_matrix_transform(positions, indices, matrix, origin) {
    for (let i = 0; i < indices.length; ++i) {
        let idx = indices[i];
        
        // 1. Localize (move to 0,0,0 relative to origin)
        let x = positions[idx * 3]     - origin.x;
        let y = positions[idx * 3 + 1] - origin.y;
        let z = positions[idx * 3 + 2] - origin.z;

        // 2. Apply Matrix multiplication
        // NewX = x*Xx + y*Yx + z*Zx
        let nx = x * matrix[0] + y * matrix[3] + z * matrix[6];
        let ny = x * matrix[1] + y * matrix[4] + z * matrix[7];
        let nz = x * matrix[2] + y * matrix[5] + z * matrix[8];

        // 3. Restore position
        positions[idx * 3]     = nx + origin.x;
        positions[idx * 3 + 1] = ny + origin.y;
        positions[idx * 3 + 2] = nz + origin.z;
    }
}