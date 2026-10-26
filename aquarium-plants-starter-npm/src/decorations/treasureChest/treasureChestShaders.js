// treasureChestShaders.js
import { sandHeightGLSL } from "../../tank/sandHeight.js";

export const vs = `#version 300 es
precision highp float;

in vec3 a_pos;
in vec3 a_normal;
in vec2 a_uv;
in float a_kind;   // 0 = wood, 1 = metal, 2 = treasure
in float a_isLid;  // 1 = lid, 0 = base/treasure

uniform mat4 u_proj;
uniform mat4 u_view;
${sandHeightGLSL}
uniform mat4 u_model;
uniform float u_time;
uniform float u_lidAngle;    // 0 = closed, ~1.2 rad = open
uniform vec2  u_hingeYZ;     // (hingeY, hingeZ)

out vec3 v_world;
out float v_restY;  // height before sand placement, keeps patterns fixed to the object
out vec3 v_normal;
out vec2 v_uv;
out float v_kind;
out float v_camDist;

void main() {
  vec3 pos = a_pos;
  vec3 nrm = a_normal;

  // Rotate lid around a hinge line parallel to X axis.
    if (a_isLid > 0.5) {
    vec3 pivot = vec3(0.0, u_hingeYZ.x, u_hingeYZ.y);

    vec3 hp = pos - pivot;
    vec3 hn = nrm;

    // flip sign so positive angle opens the lid "back and up"
    float ang = -u_lidAngle;
    float c = cos(ang);
    float s = sin(ang);

    // rotate around X axis -> y/z change
    float y = hp.y * c - hp.z * s;
    float z = hp.y * s + hp.z * c;
    hp.y = y;
    hp.z = z;

    float ny = hn.y * c - hn.z * s;
    float nz = hn.y * s + hn.z * c;
    hn.y = ny;
    hn.z = nz;

    pos = hp + pivot;
    nrm = hn;
    }
  vec4 world = u_model * vec4(pos, 1.0);
  v_restY = world.y;
  world.y = onSand(u_model[3].xz, world.y);
  v_world = world.xyz;

  v_normal = mat3(u_model) * normalize(nrm);
  v_uv = a_uv;
  v_kind = a_kind;

  vec4 V = u_view * world;
  v_camDist = length(V.xyz);
  gl_Position = u_proj * V;
}
`;

export const fs = `#version 300 es
precision highp float;

in vec3 v_world;
in float v_restY;
in vec3 v_normal;
in vec2 v_uv;
in float v_kind;
in float v_camDist;
out vec4 outColor;

uniform vec3  u_fogColor;
uniform float u_fogNear;
uniform float u_fogFar;
uniform float u_time;
uniform vec3  u_camPos;

// utility
float hash21(vec2 p){
  return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453123);
}

void main() {
  vec3 n = normalize(v_normal);
  vec3 L = normalize(vec3(0.4, 1.0, 0.3));
  float lam = max(dot(n, L), 0.0);

  vec3 col;

  if (v_kind < 0.5) {
    // --- Wood planks ---
    float plank = step(0.5, fract(v_uv.y * 6.0));
    vec3 base = mix(vec3(0.20,0.11,0.05), vec3(0.45,0.28,0.14), v_uv.y);
    base *= mix(0.88, 1.08, plank);

    float grain = hash21(v_uv * 14.7);
    base *= 0.9 + 0.25 * grain;

    col = base * (0.35 + 0.75 * lam);
  } else if (v_kind < 1.5) {
    // --- Metal bands / lock ---
    vec3 base = vec3(0.90,0.83,0.55);
    float stripe = 0.5 + 0.5 * sin(v_uv.x * 8.0);
    base *= 0.85 + 0.15 * stripe;

    float edge = pow(1.0 - abs(dot(n, vec3(0.0,1.0,0.0))), 2.0);
    base += edge * 0.12;

    col = base * (0.4 + 0.8 * lam);
  } else {
    // Treasure (shiny gold coins)
    // two offset grids of round coins so they overlap like a pile
    vec2 p = (v_world.xz + v_restY * 0.5) * 22.0;
    float coin = 0.0;
    float rim = 0.0;
    for (int layer = 0; layer < 2; layer++) {
      vec2 q = p + float(layer) * vec2(0.5, 0.37);
      vec2 cell = floor(q);
      vec2 jitter = vec2(hash21(cell), hash21(cell + 7.1)) * 0.3 - 0.15;
      float d = length(fract(q) - 0.5 - jitter);
      coin = max(coin, smoothstep(0.42, 0.38, d));
      rim = max(rim, smoothstep(0.30, 0.34, d) * smoothstep(0.42, 0.38, d));
    }

    vec3 darkGold = vec3(0.45, 0.30, 0.06);
    vec3 gold = vec3(1.00, 0.78, 0.30);
    vec3 base = mix(darkGold, gold, coin);
    base = mix(base, vec3(1.00, 0.90, 0.55), rim);

    // specular highlight toward the camera
    vec3 V = normalize(u_camPos - v_world);
    vec3 Hv = normalize(L + V);
    float spec = pow(max(dot(n, Hv), 0.0), 40.0);

    col = base * (0.45 + 0.7 * lam) + vec3(1.0, 0.92, 0.7) * spec * (0.4 + 0.6 * coin);
  }

  // Slight darkening very close to sand
  float foot = smoothstep(-0.12, 0.05, v_restY);
  col = mix(vec3(0.10,0.12,0.10), col, foot);

  // Fog
  float fog = smoothstep(u_fogNear, u_fogFar, v_camDist);
  col = mix(col, u_fogColor, fog);

  outColor = vec4(col, 1.0);
}
`;