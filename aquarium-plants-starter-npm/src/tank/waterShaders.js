
// Roiling surface noise shared by both shaders so the displacement and the shading line up
const waterNoiseGLSL = `
const float WATER_FREQ = 3.8;     // noise features per world unit
const float WATER_AMP  = 0.03;    // vertical displacement at the crests

float w_hash(vec2 p){
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

float w_noise(vec2 p){
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = w_hash(i);
  float b = w_hash(i + vec2(1.0,0.0));
  float c = w_hash(i + vec2(0.0,1.0));
  float d = w_hash(i + vec2(1.0,1.0));
  vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}

// 0..1 height of the surface at world xz, warped over time so it churns
float waterNoise(vec2 xz, float t){
  vec2 p = xz * WATER_FREQ;
  vec2 warp = vec2(
    w_noise(p * 0.7 + vec2( 0.30*t, -0.20*t)),
    w_noise(p * 0.7 + vec2(-0.25*t,  0.35*t) + 5.2)
  );
  vec2 r = p + (warp - 0.5) * 1.6;
  return 0.60 * w_noise(r        + vec2( 0.20*t,  0.10*t))
       + 0.30 * w_noise(r * 2.1  + vec2(-0.30*t,  0.25*t))
       + 0.10 * w_noise(r * 4.3  + vec2( 0.50*t, -0.40*t));
}
`;

export const vs = `#version 300 es
precision highp float;

in vec2 a_xz;          // tank-space xz of the surface grid

uniform mat4 u_proj;
uniform mat4 u_view;
uniform float u_time;
uniform float u_height;   // base water height (y)

out vec3 v_world;
out float v_camDist;

${waterNoiseGLSL}

void main(){
  float n = waterNoise(a_xz, u_time);
  vec3 world = vec3(a_xz.x, u_height + (n - 0.5) * 2.0 * WATER_AMP, a_xz.y);

  vec4 V = u_view * vec4(world, 1.0);
  v_world   = world;
  v_camDist = length(V.xyz);

  gl_Position = u_proj * V;
}
`;

export const fs = `#version 300 es
precision highp float;

in vec3 v_world;
in float v_camDist;

out vec4 outColor;

uniform float u_time;
uniform vec3  u_camPos;

// base water colours
uniform vec3 u_deepColor;    // e.g. vec3(0.02, 0.25, 0.45)
uniform vec3 u_shallowColor; // e.g. vec3(0.35, 0.85, 0.98)

// fog from camera distance
uniform vec3  u_fogColor;
uniform float u_fogNear;
uniform float u_fogFar;

// scene brightness, lowered in disco mode
uniform float u_bright;

${waterNoiseGLSL}

void main(){
  vec2 xz = v_world.xz;
  float n = waterNoise(xz, u_time);

  // per pixel normal from the same height field the vertices use
  float e = 0.01;
  float nx = waterNoise(xz + vec2(e, 0.0), u_time) - waterNoise(xz - vec2(e, 0.0), u_time);
  float nz = waterNoise(xz + vec2(0.0, e), u_time) - waterNoise(xz - vec2(0.0, e), u_time);
  float slope = 2.0 * WATER_AMP / (2.0 * e);
  vec3 N = normalize(vec3(-nx * slope, 1.0, -nz * slope));

  // troughs deeper, crests lighter, in a few flat tones
  float tone = floor(n * 4.0) / 3.0;
  vec3 col = mix(u_deepColor, u_shallowColor, 0.45 + 0.4 * tone);

  // bright squiggly bands that follow the crests
  float band = 1.0 - smoothstep(0.0, 0.025, abs(n - 0.62));
  col = mix(col, vec3(0.92, 0.98, 1.0), band * 0.8);

  // hard edged specular glints on the crest slopes
  vec3 L = normalize(vec3(0.3, 1.0, 0.2));
  vec3 V = normalize(u_camPos - v_world);
  vec3 H = normalize(L + V);
  float spec = step(0.85, pow(max(dot(N, H), 0.0), 32.0)) * smoothstep(0.5, 0.65, n);
  col += vec3(0.9, 0.97, 1.0) * spec * 0.6;
  col *= u_bright;

  // --- distance fog so far-away surface blends into tank colour -----
  float f = smoothstep(u_fogNear, u_fogFar, v_camDist);
  col = mix(col, u_fogColor, f);

  // slightly more transparent so we see the tank clearly
  outColor = vec4(col, 0.45 + 0.3 * max(band, spec));
}
`;
