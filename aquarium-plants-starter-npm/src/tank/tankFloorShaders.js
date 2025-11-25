export const vs = `#version 300 es
precision highp float;

in vec2 a_xz; // grid position (x,z) in tank space

uniform mat4  u_proj, u_view;
uniform float u_time;
uniform float u_amp;          // macro dune amplitude (Y variance)
uniform float u_scale;        // macro dune frequency

// Gravel controls
uniform float u_gravelMix;    // 0=sand, 1=full gravel
uniform float u_gravelScale;  // pebbles per unit (density)
uniform float u_gravelBump;   // height of gravel domes (0..~0.06)

// Palette selection: 0 sand, 1 grey gravel, 2 rainbow gravel
uniform int   u_palette;

// Sand colors (used as base even when gravel)
uniform vec3  u_sandA;
uniform vec3  u_sandB;

out vec3  v_color;
out float v_camDist;

// --- value noise + fbm for dunes --------------------------------------------
float fract1(float x){ return x - floor(x); }
float hash2(float i, float j){ return fract1(sin(i*127.1 + j*311.7)*43758.5453); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  float a = hash2(i.x, i.y);
  float b = hash2(i.x+1.0, i.y);
  float c = hash2(i.x, i.y+1.0);
  float d = hash2(i.x+1.0, i.y+1.0);
  vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}
float fbm(vec2 p){
  float f = 0.0, a = 0.5, fr = 1.0;
  for (int k=0; k<4; k++){
    f += a * vnoise(p * fr);
    a *= 0.5;
    fr *= 2.0;
  }
  return f;
}

// --- tiny helpers -------------------------------------------------------------
float hash11(float n){ return fract(sin(n)*43758.5453123); }
float hash12(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123); }

// HSV-ish hue to RGB (sat≈0.8, val≈1.0)
vec3 h2rgb(float h){
  float r = abs(h*6.0 - 3.0) - 1.0;
  float g = 2.0 - abs(h*6.0 - 2.0);
  float b = 2.0 - abs(h*6.0 - 4.0);
  return clamp(vec3(r,g,b),0.0,1.0);
}

// Worley-like (nearest-jittered-cell) distance + cell id
// returns (min distance in [0..~1], cellX, cellY)
vec3 cellInfo(vec2 p){
  vec2 g  = p * u_gravelScale;
  vec2 gi = floor(g);
  vec2 gf = fract(g);
  float minD = 1e9;
  vec2  minCell = vec2(0.0);
  for (int j=-1; j<=1; j++){
    for (int i=-1; i<=1; i++){
      vec2 o = vec2(float(i), float(j));
      vec2 c = gi + o;
      vec2 rnd = vec2(hash12(c), hash12(c + 19.19));
      vec2 center = o + rnd;        // jittered center in this cell
      float d = length(center - gf);
      if (d < minD){
        minD    = d;
        minCell = c;
      }
    }
  }
  minD = clamp(minD, 0.0, 1.0);
  return vec3(minD, minCell);
}

// Full height: dunes + gravel domes
float groundHeight(vec2 p){
  // macro dunes
  float dunes = (fbm(p * u_scale) - 0.5) * u_amp - 0.03;

  // no gravel? just dunes
  if (u_gravelMix <= 0.001 || u_gravelScale <= 0.5 || u_gravelBump <= 0.0) {
    return dunes;
  }

  vec3 ci = cellInfo(p);
  float d  = ci.x; // distance to nearest pebble center

  // dome shape: 1 in center, 0 by ~0.8
  float m = 1.0 - smoothstep(0.0, 0.8, d);
  m *= u_gravelMix;

  float pebble = u_gravelBump * m;
  return dunes + pebble;
}

void main(){
  vec2 p = a_xz;

  // height & derivatives (for good normals)
  float h = groundHeight(p);
  float e = 0.02;

  float h_x1 = groundHeight(p + vec2(e, 0.0));
  float h_x2 = groundHeight(p - vec2(e, 0.0));
  float h_z1 = groundHeight(p + vec2(0.0, e));
  float h_z2 = groundHeight(p - vec2(0.0, e));

  float dhdx = (h_x1 - h_x2) / (2.0 * e);
  float dhdz = (h_z1 - h_z2) / (2.0 * e);

  vec3 n = normalize(vec3(-dhdx, 1.0, -dhdz));

  // --- color: sand + gravel tint ---
  vec3 ci  = cellInfo(p);
  float d  = ci.x;
  float mask = 1.0 - smoothstep(0.0, 0.8, d);
  mask *= u_gravelMix;

  vec3 gravelCol;
  if (u_palette == 1) {
    // grey gravel
    float g = 0.45 + 0.45 * hash12(ci.yz);
    gravelCol = vec3(g) * vec3(1.0, 0.98, 0.96);
  } else if (u_palette == 2) {
    // rainbow gravel
    float hcol = hash12(ci.yz);
    gravelCol = h2rgb(hcol) * (0.75 + 0.35 * hash11(hcol * 91.7));
  } else {
    // warm shell-like gravel
    float t = 0.7 + 0.3 * hash12(ci.yz + 7.0);
    gravelCol = mix(u_sandA, u_sandB, t);
  }

  vec3 L = normalize(vec3(-0.2, 1.0, 0.3));
  float ndl = clamp(dot(n, L), 0.0, 1.0);

  // sand shading
  vec3 sand = mix(u_sandA, u_sandB, 0.4 + 0.6 * ndl);
  // brighter on higher dunes
  sand *= 0.95 + 0.1 * smoothstep(-0.10, 0.08, h);

  // mix sand ↔ gravel
  vec3 baseCol = mix(sand, gravelCol, mask);

  // outputs
  v_color = baseCol;
  vec3 world = vec3(p.x, h, p.y);
  vec4 V = u_view * vec4(world, 1.0);
  v_camDist = length(V.xyz);
  gl_Position = u_proj * V;
}
`;

export const fs = `#version 300 es
precision highp float;
in vec3  v_color;
in float v_camDist;
out vec4 outColor;

uniform vec3  u_fogColor;
uniform float u_fogNear, u_fogFar;
uniform float u_fogStrength;  // 0..1
uniform float u_fogBias;      // 0..1

void main(){
  float f = smoothstep(u_fogNear, u_fogFar, v_camDist);
  f = clamp(f * u_fogStrength - u_fogBias, 0.0, 1.0);
  vec3 col = mix(v_color, u_fogColor, f);
  outColor = vec4(col, 1.0);
}
`;