
export const vs = `#version 300 es
precision highp float;

in vec3 a_pos;
in vec3 a_normal;
in float a_height;   // 0 at base, ~1 near tips
in float a_hue;

uniform mat4 u_proj;
uniform mat4 u_view;
uniform float u_time;

out vec3 v_normalVS;
out vec3 v_posVS;
out vec3 v_world;
out float v_height;
out float v_camDist;
out float v_hue;

void main(){
  vec3 pos = a_pos;

  // gentle sway, stronger near tips
  float sway = 0.03 * a_height * a_height;
  pos.x += sway * sin(u_time * 0.7 + pos.y * 6.0);
  pos.z += 0.5 * sway * cos(u_time * 0.6 + pos.y * 4.5);

  // world position (fan geometry is already in world space)
  v_world  = pos;
  v_height = a_height;
  v_hue    = a_hue;

  // to view space
  vec4 V = u_view * vec4(pos, 1.0);
  v_posVS   = V.xyz;
  v_camDist = length(V.xyz);

  // normal in view space
  v_normalVS = normalize(mat3(u_view) * a_normal);

  gl_Position = u_proj * V;
}
`;

export const fs = `#version 300 es
precision highp float;

in vec3 v_normalVS;
in vec3 v_posVS;
in vec3 v_world;
in float v_height;
in float v_camDist;
in float v_hue;
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
  return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453);
}

// tiny 1D caustic helper
float caustic(float x){
  return 0.5 + 0.5 * sin(x);
}

void main(){
  vec3 n = normalize(v_normalVS);
  vec3 L = normalize(vec3(-0.3, 0.9, 0.2));   // light from above/front
  vec3 V = normalize(-v_posVS);               // view dir

  float diff  = max(dot(n, L), 0.0);
  float rim   = pow(1.0 - max(dot(n, V), 0.0), 2.2);  // soft glow on edges

  float h = clamp(v_height, 0.0, 1.0);

  // --- base warm sea-fan palette -----------------------------------
  vec3 warmA = vec3(0.78, 0.52, 0.33);
  vec3 warmB = vec3(0.96, 0.74, 0.50);
  vec3 warm  = mix(warmA, warmB, h);

  vec3 hueTint = h2rgb(v_hue) * vec3(1.1, 0.85, 0.80);
  vec3 base    = mix(warm, hueTint, 0.35);

  // darken near the base → fake ambient occlusion
  float ao = mix(0.45, 1.0, pow(h, 0.7));
  base *= ao;

  // --- stripes along branches (height-based, a bit of x variation) ---
  float stripe = sin(h * 20.0 + v_world.x * 4.0);
  stripe = stripe * 0.5 + 0.5; // 0..1
  base *= mix(0.9, 1.18, stripe * 0.7);

  // --- tiny polyps near outer portions of the fan -------------------
  vec2 p = v_world.xz * 3.5;
  vec2 cell = floor(p);
  vec2 fpos = fract(p) - 0.5;
  float d   = length(fpos);

  float cellSeed = hash12(cell);
  float radius   = mix(0.22, 0.32, cellSeed);
  float nd       = d / radius;

  // dot-shaped bright spots, mostly near the upper half of the fan
  float dotShape   = 1.0 - smoothstep(0.0, 1.0, nd);
  float heightMask = smoothstep(0.45, 1.0, h);
  float polypMask  = dotShape * heightMask;

  vec3 polypCol = h2rgb(v_hue + 0.12) * vec3(1.4, 1.15, 1.0);
  vec3 col = mix(base, polypCol, polypMask * 0.45);

  // --- lighting -----------------------------------------------------
  float light = 0.30 + diff * 0.80 + rim * 0.55;
  col *= light;

  // subtle moving caustics
  float c =
      0.06 * caustic(v_posVS.x * 8.0  + u_time * 1.4) +
      0.04 * caustic(v_posVS.z * 10.0 - u_time * 1.2);
  col *= (0.95 + 0.18 * c);

  // fog
  float f = smoothstep(u_fogNear, u_fogFar, v_camDist);
  col = mix(col, u_fogColor, f);

  outColor = vec4(col, 1.0);
}
`;