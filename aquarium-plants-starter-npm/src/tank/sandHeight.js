// Shared sand surface height so objects can sit on the floor

// GLSL that matches the dune height in tankFloorShaders.js
export const sandHeightGLSL = `
uniform float u_floorAmp;
uniform float u_floorScale;
uniform float u_ceiling;      // highest y decorations may reach
uniform float u_decorHeight;  // tallest point of this layer above its base, 0 skips squashing

float sand_hash2(float i, float j){ return fract(sin(i*127.1 + j*311.7)*43758.5453); }
float sand_vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  float a = sand_hash2(i.x, i.y);
  float b = sand_hash2(i.x+1.0, i.y);
  float c = sand_hash2(i.x, i.y+1.0);
  float d = sand_hash2(i.x+1.0, i.y+1.0);
  vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}
float sand_fbm(vec2 p){
  float f = 0.0, a = 0.5, fr = 1.0;
  for (int k=0; k<4; k++){
    f += a * sand_vnoise(p * fr);
    a *= 0.5;
    fr *= 2.0;
  }
  return f;
}

// Height of the sand at p relative to its resting level
float sandOffset(vec2 p){
  return (sand_fbm(p * u_floorScale) - 0.5) * u_floorAmp;
}

// Height y above the base at xz placed on the sand. On high dunes the layer
// is squashed just enough that its tallest point stays under u_ceiling
float onSand(vec2 xz, float y){
  float s = sandOffset(xz);
  float k = u_decorHeight > 0.0 ? clamp((u_ceiling - s) / u_decorHeight, 0.0, 1.0) : 1.0;
  return s + y * k;
}
`;

// Returns a function that uploads the sand uniforms for a program.
// decorHeight is the layer's tallest point, used by onSand to stay under the water
export function makeSandUniforms(gl, prog) {
  const u_floorAmp = gl.getUniformLocation(prog, "u_floorAmp");
  const u_floorScale = gl.getUniformLocation(prog, "u_floorScale");
  const u_ceiling = gl.getUniformLocation(prog, "u_ceiling");
  const u_decorHeight = gl.getUniformLocation(prog, "u_decorHeight");
  return (shared, decorHeight = 0) => {
    gl.uniform1f(u_floorAmp, shared.floorAmp ?? 0.18);
    gl.uniform1f(u_floorScale, shared.floorScale ?? 0.9);
    gl.uniform1f(u_ceiling, shared.decorCeiling ?? 1.7);
    gl.uniform1f(u_decorHeight, decorHeight);
  };
}
