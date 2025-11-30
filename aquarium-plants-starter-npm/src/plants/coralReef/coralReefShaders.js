export const vs = `#version 300 es
precision highp float;

in vec3 a_pos;
in vec3 a_normal;
in vec2 a_uv;

in vec3 i_offset;   // world offset
in vec2 i_scale;    // (radius, heightScale)
in float i_hue;     // base hue 0..1
in float i_wobble;  // phase

uniform mat4 u_proj;
uniform mat4 u_view;
uniform float u_time;

out vec3 v_normal;
out vec3 v_world;
out vec3 v_local;   // position in local coral-head space (before radius)
out float v_hue;
out float v_camDist;

// small 3D value noise for lumpy surface
float hash13(vec3 p){
  return fract(sin(dot(p, vec3(127.1,311.7,74.7))) * 43758.5453123);
}
float vnoise(vec3 p){
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f*f*(3.0-2.0*f);
  float n000 = hash13(i + vec3(0.0,0.0,0.0));
  float n100 = hash13(i + vec3(1.0,0.0,0.0));
  float n010 = hash13(i + vec3(0.0,1.0,0.0));
  float n110 = hash13(i + vec3(1.0,1.0,0.0));
  float n001 = hash13(i + vec3(0.0,0.0,1.0));
  float n101 = hash13(i + vec3(1.0,0.0,1.0));
  float n011 = hash13(i + vec3(0.0,1.0,1.0));
  float n111 = hash13(i + vec3(1.0,1.0,1.0));

  float nx00 = mix(n000, n100, u.x);
  float nx10 = mix(n010, n110, u.x);
  float nx01 = mix(n001, n101, u.x);
  float nx11 = mix(n011, n111, u.x);
  float nxy0 = mix(nx00, nx10, u.y);
  float nxy1 = mix(nx01, nx11, u.y);
  return mix(nxy0, nxy1, u.z);
}

void main(){
  float radius = i_scale.x;
  float hScale = i_scale.y;

  // base lumpy position from unit pseudo-sphere
  vec3 p = a_pos;
  p.y *= hScale;

  // surface bumps
  float n = vnoise(p * 2.7 + i_offset * 3.1);
  float disp = (n - 0.5) * 0.28;
  p += a_normal * disp;

  // gentle sway near top (simulate polyps moving)
  float height01 = clamp(p.y * 0.6 + 0.5, 0.0, 1.0);
  float swayAmt = height01 * height01 * 0.07;
  float ang = u_time * 0.7 + i_wobble;
  vec2 swayDir = vec2(cos(ang), sin(ang));
  p.xz += swayDir * swayAmt;

  // keep local coordinates *before* radius for patterning
  v_local = p;

  vec3 world = i_offset + p * radius;
  v_world = world;

  // approximate normal from (displaced) position relative to center
  v_normal = normalize(p + a_normal * 0.25);
  v_hue = i_hue;

  vec4 V = u_view * vec4(world, 1.0);
  v_camDist = length(V.xyz);
  gl_Position = u_proj * V;
}
`;

export const fs = `#version 300 es
precision highp float;

in vec3 v_normal;
in vec3 v_world;
in vec3 v_local;    // local coral-head coords
in float v_hue;
in float v_camDist;
out vec4 outColor;

uniform vec3 u_fogColor;
uniform float u_fogNear;
uniform float u_fogFar;
uniform float u_time;

vec3 h2rgb(float h){
  float r = abs(h*6.0 - 3.0) - 1.0;
  float g = 2.0 - abs(h*6.0 - 2.0);
  float b = 2.0 - abs(h*6.0 - 4.0);
  return clamp(vec3(r,g,b),0.0,1.0);
}

float hash12(vec2 p){
  return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453123);
}

float caustic1D(float x){
  return 0.5 + 0.5 * sin(x);
}

void main(){
  vec3 n = normalize(v_normal);

  // lighting directions
  vec3 L = normalize(vec3(-0.3, 1.0, 0.25));
  vec3 V = normalize(-v_world);

  float diff   = max(dot(n, L), 0.0);
  float ndotV  = max(dot(n, V), 0.0);
  float rim    = pow(1.0 - ndotV, 2.0);
  float subsur = pow(max(dot(-n, L), 0.0), 2.0);

  // height factor: darker at base, brighter at tips
  float h01 = clamp(v_world.y * 1.7 + 0.7, 0.0, 1.0);

  // --- base colony color ---------------------------------------------------
  vec3 baseHue = h2rgb(v_hue);
  vec3 deepCol = baseHue * vec3(0.35, 0.42, 0.55);
  vec3 midCol  = baseHue * vec3(0.85, 0.90, 1.00);
  vec3 tipCol  = baseHue * vec3(1.25, 1.10, 1.05);

  vec3 heightCol = mix(midCol, tipCol, h01);
  vec3 base = mix(deepCol, heightCol, 0.65 + 0.35 * h01);

  // subtle speckling so base isn't flat
  float speck = hash12(v_world.xz * 9.0);
  base *= mix(0.9, 1.1, speck);

  // --- polyp donuts in local head space -----------------------------------
  // tile local xz so pattern follows the mound
  vec2 lp   = v_local.xz * 4.5;      // increase for more / smaller polyps
  vec2 cell = floor(lp);
  vec2 f    = fract(lp);             // 0..1 in cell

  float cellSeed = hash12(cell);

  // jittered center inside cell
  float s1 = hash12(cell + vec2(37.2, 17.7));
  float s2 = hash12(cell + vec2(11.5, 91.3));
  vec2 center = vec2(s1, s2) * 0.6 + 0.2;  // keep away from edges

  float d = length(f - center);            // distance to cell center

  // per-polyp radius
  float r = mix(0.18, 0.32, cellSeed);
  float nd = d / max(r, 0.001);            // normalized radius

  // masks: core, ring, outer tissue
  float coreMask  = 1.0 - smoothstep(0.0, 0.4, nd);        // 1 near center
  float ringInner = smoothstep(0.2, 0.55, nd);
  float ringOuter = smoothstep(0.65, 1.0, nd);
  float ringMask  = ringInner * (1.0 - ringOuter);         // band
  float outerMask = 1.0 - smoothstep(1.0, 1.25, nd);

  float polypMask = outerMask;

  // mostly on upper half of mound
  float heightMask = smoothstep(-0.1, 0.5, v_local.y);
  polypMask *= heightMask;

  // color palette: deep core + hot rim + slight outer shift
  float rimHueShift  = mix(-0.08, 0.22, cellSeed);
  float coreHueShift = mix(-0.20, 0.05,  cellSeed);
  float outerShift   = rimHueShift + 0.20;

  vec3 rimCol   = h2rgb(v_hue + rimHueShift)   * vec3(1.8, 1.5, 1.3);
  vec3 coreCol  = h2rgb(v_hue + coreHueShift)  * vec3(0.35, 0.25, 0.45);
  vec3 outerCol = h2rgb(v_hue + outerShift)    * vec3(1.1, 0.9, 1.2);

  vec3 col = base;

  // dark core
  col = mix(col, coreCol, coreMask * polypMask);
  // bright ring
  col = mix(col, rimCol,  ringMask * polypMask * 1.1);
  // gentle outer glow
  float outerBand = max(outerMask - ringMask, 0.0) * polypMask;
  col = mix(col, outerCol, outerBand * 0.5);

  // small radial ridges in the ring
  float ridge     = sin(nd * 24.0 + cellSeed * 20.0);
  float ridgeMask = ringMask * polypMask;
  col *= 1.0 + ridgeMask * ridge * 0.06;

  // --- lighting on top ----------------------------------------------------
  float light =
      0.30
    + diff   * 0.85
    + rim    * 0.40
    + subsur * 0.35;
  col *= light;

  // subtle moving caustics
  float c =
      0.06 * caustic1D(v_world.x * 10.0 + u_time * 1.5) +
      0.04 * caustic1D(v_world.z * 14.0 - u_time * 1.2);
  col *= (0.95 + 0.20 * c);

  // tone mapping: compress super-bright bits
  float maxC = max(col.r, max(col.g, col.b));
  if (maxC > 1.0) {
    col /= (0.75 + maxC);
  }

  // fog
  float fFog = smoothstep(u_fogNear, u_fogFar, v_camDist);
  col = mix(col, u_fogColor, fFog);

  outColor = vec4(col, 1.0);
}
`;