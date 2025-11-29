export const vs = `#version 300 es
precision highp float;

in vec3 a_pos;
in vec3 a_normal;
in vec2 a_uv;

uniform mat4 u_proj;
uniform mat4 u_view;
uniform mat4 u_model;
uniform float u_time;

out vec2 v_uv;
out vec3 v_normal;
out vec3 v_world;
out float v_camDist;

void main(){
  // Start from model-space position
  vec3 pos = a_pos;

  // Slight sway for the crown leaves (vertices higher than ~0.6 in model space)
  if (pos.y > 0.6) {
    float t = u_time * 0.7;
    // Direction away from axis in xz
    vec2 dir = normalize(pos.xz + vec2(1e-4, 0.0));
    // More bend toward the tip
    float amount = (pos.y - 0.6) * 0.05;
    float wave = sin(t + pos.y * 6.0 + pos.x * 3.0);
    pos.xz += dir * amount * wave;
  }

  vec4 world = u_model * vec4(pos, 1.0);
  v_world = world.xyz;

  // Transform normals by model (good enough for small deformations)
  v_normal = mat3(u_model) * a_normal;

  v_uv = a_uv;
  vec4 V = u_view * world;
  v_camDist = length(V.xyz);
  gl_Position = u_proj * V;
}
`;

export const fs = `#version 300 es
precision highp float;

in vec2 v_uv;
in vec3 v_normal;
in vec3 v_world;
in float v_camDist;
out vec4 outColor;

uniform float u_time;
uniform vec3 u_fogColor;
uniform float u_fogNear;
uniform float u_fogFar;

// simple 2D noise (same as before)
float hash21(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7))) * 43758.5453123); }
float noise2(vec2 p){
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  float a = hash21(i + vec2(0.0,0.0));
  float b = hash21(i + vec2(1.0,0.0));
  float c = hash21(i + vec2(0.0,1.0));
  float d = hash21(i + vec2(1.0,1.0));
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}

void main(){
  vec3 n = normalize(v_normal);
  float lam = clamp(dot(n, normalize(vec3(0.4,1.0,0.3))), 0.0, 1.0);

  // height in world space: used to switch between body / band / leaves
  float y = v_world.y;

  vec3 col;

  // --- LEAVES: top part ---
  if (y > 0.55) {
    // subtle noisy green
    float g = noise2(v_uv * 10.0 + u_time * 0.02);
    vec3 leafBase = vec3(0.10, 0.40, 0.18);
    vec3 leafHighlight = vec3(0.25, 0.75, 0.35);
    col = mix(leafBase, leafHighlight, g) * (0.4 + 0.8 * lam);
  }
  // --- BAND: just above body ---
  else if (y > 0.46) {
    vec3 bandColor = vec3(0.95, 0.85, 0.35);
    float stripe = step(0.5, fract(v_uv.x * 12.0));
    col = mix(bandColor * 0.8, bandColor, stripe) * (0.5 + 0.7 * lam);
  }
  // --- PINEAPPLE BODY ---
  else {
    // base yellow/orange varying with height so it feels rounded
    float hNorm = clamp((y + 0.1) / 0.6, 0.0, 1.0);
    vec3 baseA = vec3(0.96, 0.75, 0.26);
    vec3 baseB = vec3(1.00, 0.90, 0.40);
    vec3 base = mix(baseA, baseB, hNorm);

    // diamond pattern using UVs
    vec2 uvT = v_uv * vec2(7.0, 10.0);
    vec2 g = fract(uvT) - 0.5;

    float d1 = abs(g.x + g.y);
    float d2 = abs(g.x - g.y);
    float d = min(d1, d2);

    // 1 at line, 0 inside the diamond
    float lines = 1.0 - smoothstep(0.0, 0.09, d);

    // add a little noise so it isn't too perfect
    float n2 = noise2(uvT * 1.5);
    float lineMask = clamp(lines + (n2 - 0.5) * 0.3, 0.0, 1.0);

    vec3 darker = base * 0.65;
    vec3 shell = mix(base, darker, lineMask);

    col = shell * (0.4 + 0.8 * lam);
  }

  // --- optional: slightly darker near very bottom (wet/mossy base) ---
  float foot = smoothstep(-0.15, 0.02, y);
  col = mix(vec3(0.18, 0.30, 0.18), col, foot);

  // fog
  float fog = smoothstep(u_fogNear, u_fogFar, v_camDist);
  col = mix(col, u_fogColor, fog);

  outColor = vec4(col, 1.0);
}
`;
