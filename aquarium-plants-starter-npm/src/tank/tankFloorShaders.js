export const vs = `#version 300 es
precision highp float;

in vec3  a_pos;   // x,z in tank space; y is side t for side faces
in float a_face;  // 0 = top, 1 = side, 2 = bottom

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

// Depth of sand block + tank size (for side normals)
uniform float u_sandDepth;
uniform vec2  u_tankHalf;

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

// tiny helpers -------------------------------------------------------------
float hash11(float n){ return fract(sin(n)*43758.5453123); }
float hash12(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123); }

// HSV-ish hue to RGB
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
  // macro dunes (soft rolling sand)
  float dunes = (fbm(p * u_scale) - 0.5) * u_amp - 0.03;

  // no gravel? just dunes
  if (u_gravelMix <= 0.001 || u_gravelScale <= 0.5 || u_gravelBump <= 0.0) {
    return dunes;
  }

  vec3 ci = cellInfo(p);
  float d  = ci.x; // distance to nearest pebble center

  // dome shape: 1 in center, 0 by ~0.8 (slightly sharper for pebbly look)
  float m = 1.0 - smoothstep(0.0, 0.7, d);
  m *= u_gravelMix;

  float pebble = u_gravelBump * m;
  return dunes + pebble;
}

// moving caustics for sunny look
float caustic(vec2 p){
  float s1 = sin(p.x*9.0  + p.y*6.0  + u_time*1.4);
  float s2 = sin(p.x*13.0 - p.y*11.0 + u_time*1.9);
  return 0.5 + 0.5 * (s1 + s2) * 0.3;
}

void main(){
  vec2 p = a_pos.xz;

  // surface height and derivatives for top
  float h = groundHeight(p);
  float e = 0.02;

  float h_x1 = groundHeight(p + vec2(e, 0.0));
  float h_x2 = groundHeight(p - vec2(e, 0.0));
  float h_z1 = groundHeight(p + vec2(0.0, e));
  float h_z2 = groundHeight(p - vec2(0.0, e));

  float dhdx = (h_x1 - h_x2) / (2.0 * e);
  float dhdz = (h_z1 - h_z2) / (2.0 * e);

  vec3 nTop = normalize(vec3(-dhdx, 1.0, -dhdz));

  float yTop    = h;
  float yBottom = h - u_sandDepth;

  float isTop    = step(-0.5, a_face) * (1.0 - step(0.5, a_face)); // a_face≈0
  float isSide   = step(0.5, a_face) * (1.0 - step(1.5, a_face));  // ≈1
  float isBottom = step(1.5, a_face);                              // ≥2

  vec3 world;
  vec3 n;

  if (isTop > 0.5) {
    world = vec3(p.x, yTop, p.y);
    n = nTop;
  } else if (isSide > 0.5) {
    // a_pos.y stores side vertical t: 0 bottom, 1 top
    float tSide = clamp(a_pos.y, 0.0, 1.0);
    float y = mix(yBottom, yTop, tSide);
    world = vec3(p.x, y, p.y);

    // side normal points inward based on which wall we’re on
    vec3 wn;
    float eps = 0.001;
    if (abs(abs(p.x) - u_tankHalf.x) < eps) {
      float s = sign(p.x);
      wn = vec3(-s, 0.0, 0.0);  // inward
    } else if (abs(abs(p.y) - u_tankHalf.y) < eps) {
      float s = sign(p.y);
      wn = vec3(0.0, 0.0, -s);
    } else {
      wn = nTop;
    }
    n = normalize(wn);
  } else {
    world = vec3(p.x, yBottom, p.y);
    n = vec3(0.0, -1.0, 0.0);
  }

  // micro speckling in the sand
  float sandNoise1 = hash12(p * 18.37);
  float sandNoise2 = vnoise(p * 7.0);
  float sandT = clamp(0.35 + 0.4 * sandNoise1 + 0.25 * sandNoise2, 0.0, 1.0);
  vec3 sandBase = mix(u_sandA, u_sandB, sandT);

  // cell info for gravel
  vec3 ci  = cellInfo(p);
  float d  = ci.x;
  vec2 cellId = ci.yz;
  float cellSeed = hash12(cellId);

  // how much of each cell is “pebble”
  float pebbleMask = 1.0 - smoothstep(0.0, 0.7, d);
  pebbleMask *= u_gravelMix;

  // normalized radius inside pebble
  float rNorm = clamp(d / 0.7, 0.0, 1.0);

  // core vs rim masks
  float coreMask = 1.0 - smoothstep(0.0, 0.35, rNorm);                  // dark center
  float rimMask  = exp(-pow((rNorm - 0.75) / 0.25, 2.0));               // bright rim

  // pick palette per pebble
  vec3 gravelBase;
  if (u_palette == 1) {
    // grey natural stone with warm variation
    float g = 0.45 + 0.4 * cellSeed;
    gravelBase = vec3(g) * vec3(1.0, 0.98, 0.96);
  } else if (u_palette == 2) {
    // rainbow gravel, slight pastel
    float hcol = cellSeed;
    gravelBase = h2rgb(hcol) * (0.75 + 0.35 * hash11(hcol * 91.7));
  } else {
    // “special sand” palette: mostly sand range but pebble-tinted
    float t = 0.6 + 0.4 * cellSeed;
    gravelBase = mix(u_sandA, u_sandB, t);
  }

  // modulate core / rim colour
  vec3 coreCol = gravelBase * vec3(0.65, 0.6, 0.55);
  vec3 rimCol  = gravelBase * vec3(1.25, 1.15, 1.05);
  vec3 pebbleCol = gravelBase;
  pebbleCol = mix(pebbleCol, coreCol, coreMask);
  pebbleCol = mix(pebbleCol, rimCol,  rimMask);

  // base sand darkened in low areas (fake ambient occlusion)
  float heightAO = smoothstep(-0.14, 0.10, h);
  sandBase *= mix(0.70, 1.05, heightAO);

  // Lambert lighting
  vec3 L = normalize(vec3(-0.2, 1.0, 0.3));
  float ndl = clamp(dot(normalize(n), L), 0.0, 1.0);

  // sand lighting
  vec3 sandLit = sandBase * (0.35 + 0.75 * ndl);

  // mix in pebbles
  vec3 baseCol = mix(sandLit, pebbleCol, pebbleMask);

  // subtle caustic shimmer
  float c = caustic(p * 1.6);
  baseCol *= (0.90 + 0.20 * c);

  v_color = baseCol;

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