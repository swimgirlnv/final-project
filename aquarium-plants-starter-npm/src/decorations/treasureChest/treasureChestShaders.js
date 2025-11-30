// treasureChestShaders.js

export const vs = `#version 300 es
precision highp float;

in vec3 a_pos;
in vec3 a_normal;
in vec2 a_uv;
in float a_kind;   // 0 = wood, 1 = metal, 2 = treasure
in float a_isLid;  // 1 = lid, 0 = base/treasure

uniform mat4 u_proj;
uniform mat4 u_view;
uniform mat4 u_model;
uniform float u_time;
uniform float u_lidAngle;    // 0 = closed, ~1.2 rad = open
uniform vec2  u_hingeYZ;     // (hingeY, hingeZ)

out vec3 v_world;
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
in vec3 v_normal;
in vec2 v_uv;
in float v_kind;
in float v_camDist;
out vec4 outColor;

uniform vec3  u_fogColor;
uniform float u_fogNear;
uniform float u_fogFar;
uniform float u_time;

// utility
float hash21(vec2 p){
  return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453123);
}

vec3 h2rgb(float h){
  float r = abs(h*6.0 - 3.0) - 1.0;
  float g = 2.0 - abs(h*6.0 - 2.0);
  float b = 2.0 - abs(h*6.0 - 4.0);
  return clamp(vec3(r,g,b), 0.0, 1.0);
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
    // --- Treasure (coins + jewels) ---
    float noise = hash21(v_world.xz * 9.7 + u_time * 0.3);
    float type = step(0.5, noise); // 0 = coin, 1 = jewel

    if (type < 0.5) {
      // coin: warm gold
      float sparkle = hash21(v_world.xz * 22.7 + u_time * 1.9);
      vec3 gold = mix(vec3(1.00,0.88,0.46), vec3(1.00,0.96,0.70), sparkle);
      float pulse = 0.4 + 0.6 * sin(u_time * 5.0 + sparkle * 20.0);
      gold *= 0.7 + 0.5 * pulse;
      col = gold * (0.5 + 0.8 * lam);
    } else {
      // jewel: bright colored gem
      float h = hash21(v_world.xz * 17.3);
      vec3 gem = h2rgb(h) * vec3(0.9,0.95,1.0);
      float sparkle = hash21(v_uv * 40.0 + u_time * 3.3);
      gem *= 0.75 + 0.35 * sparkle;
      col = gem * (0.4 + 0.9 * lam);
    }
  }

  // Slight darkening very close to sand
  float foot = smoothstep(-0.12, 0.05, v_world.y);
  col = mix(vec3(0.10,0.12,0.10), col, foot);

  // Fog
  float fog = smoothstep(u_fogNear, u_fogFar, v_camDist);
  col = mix(col, u_fogColor, fog);

  outColor = vec4(col, 1.0);
}
`;