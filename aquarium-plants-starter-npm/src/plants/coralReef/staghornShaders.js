// plants/stagHornShaders.js

export const vs = `#version 300 es
precision highp float;

in vec3 a_pos;     // cylinder local: radius in xz, axis along +y (0..1)
in vec3 a_normal;
in vec2 a_uv;

in vec3 i_base;    // world base position
in vec3 i_axis;    // direction * length
in float i_radius;
in float i_hue;
in float i_phase;

uniform mat4 u_proj;
uniform mat4 u_view;
uniform float u_time;

out vec3 v_normal;
out vec3 v_world;
out float v_hue;
out float v_height;    // 0 at base, 1 at tip
out float v_camDist;
out float v_angle;     // angle around branch (for patterning)

float hash13(vec3 p){
  return fract(sin(dot(p, vec3(127.1,311.7,74.7))) * 43758.5453123);
}

void main(){
  float len  = length(i_axis);
  vec3  axis = (len > 1e-4) ? i_axis / len : vec3(0.0,1.0,0.0);

  // build orthonormal basis (axis = "up")
  vec3 tmp  = (abs(axis.y) < 0.85) ? vec3(0.0,1.0,0.0) : vec3(1.0,0.0,0.0);
  vec3 side = normalize(cross(axis, tmp));
  vec3 up   = normalize(cross(side, axis));

  float y = clamp(a_pos.y, 0.0, 1.0);
  v_height = y;

  // safe radial direction from local xz
  vec2 r2   = a_pos.xz;
  float rl  = length(r2);
  vec3 radDir;
  if (rl > 1e-4) {
    radDir = normalize(r2.x * side + r2.y * up);
  } else {
    // very center / caps: just use some sideways direction
    radDir = side;
  }

  // gentle knobbly bumps along the branch
  float n    = hash13(vec3(r2 * 2.3, y * 3.1) + i_base * 4.1);
  float bump = (n - 0.5) * 0.20;            // smaller amplitude
  float rScale = clamp(1.0 + bump, 0.75, 1.25);
  float r = i_radius * rScale;

  vec3 core = i_base + axis * (y * len);

  // gentle sway near the tips
  float swayFactor = y * y;
  float ang = u_time * 0.8 + i_phase;
  vec3 swayDir = normalize(side * cos(ang) + up * sin(ang));
  vec3 sway = swayDir * (0.04 * swayFactor);

  vec3 world = core + radDir * r + sway;

  v_world  = world;

  // normals: mostly radial, with a bit of axis so “top” catches light
  v_normal = normalize(radDir + axis * 0.25);

  v_hue    = i_hue;

  // angle around cylinder based purely on local xz to avoid weird streaks
  v_angle = atan(r2.y, r2.x);   // -π..π

  vec4 V = u_view * vec4(world, 1.0);
  v_camDist = length(V.xyz);
  gl_Position = u_proj * V;
}
`;

export const fs = `#version 300 es
precision highp float;

in vec3 v_normal;
in vec3 v_world;
in float v_hue;
in float v_height;
in float v_camDist;
in float v_angle;
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

float caustic(float x){
  return 0.5 + 0.5 * sin(x);
}

void main(){
  vec3 N = normalize(v_normal);

  vec3 L = normalize(vec3(-0.3, 1.0, 0.2));
  vec3 V = normalize(-v_world);

  float diff    = max(dot(N, L), 0.0);
  float ndotV   = max(dot(N, V), 0.0);
  float rim     = pow(1.0 - ndotV, 2.0);
  float subsurf = pow(max(dot(-N, L), 0.0), 2.0);

  float h = clamp(v_height, 0.0, 1.0);

  // base color: blue-green → purple, lighter toward tips
  vec3 hueCol = h2rgb(v_hue);
  vec3 deep   = hueCol * vec3(0.35, 0.45, 0.60);
  vec3 mid    = hueCol * vec3(0.85, 0.95, 1.05);
  vec3 tip    = hueCol * vec3(1.25, 1.15, 1.10);

  vec3 alongCol = mix(mid, tip, h);
  vec3 base = mix(deep, alongCol, 0.6 + 0.4*h);

  // darker near base like ambient occlusion
  float ao = mix(0.45, 1.0, pow(h, 0.7));
  base *= ao;

  // soft banding along and around branch
  float band = sin(h * 10.0 + v_angle * 2.5);
  band = band * 0.5 + 0.5;
  base *= mix(0.92, 1.15, band * 0.6);

  // small “polyp” dots mostly toward tips
  float dotPattern =
      sin(h * 22.0 + v_angle * 7.0 + u_time * 0.6);
  float dotMask = smoothstep(0.55, 0.95, h) * smoothstep(0.75, 1.0, dotPattern);
  vec3 polypCol = h2rgb(v_hue + 0.10) * vec3(1.5, 1.35, 1.3);

  vec3 col = mix(base, polypCol, dotMask * 0.55);

  // lighting
  float light =
      0.30 +
      diff    * 0.85 +
      rim     * 0.40 +
      subsurf * 0.30;
  col *= light;

  // subtle caustics
  float c =
      0.06 * caustic(v_world.x * 10.0 + u_time * 1.4) +
      0.04 * caustic(v_world.z * 13.0 - u_time * 1.1);
  col *= (0.95 + 0.18 * c);

  // compress highlights a bit
  float maxC = max(col.r, max(col.g, col.b));
  if (maxC > 1.0) {
    col /= (0.75 + maxC);
  }

  float f = smoothstep(u_fogNear, u_fogFar, v_camDist);
  col = mix(col, u_fogColor, f);

  outColor = vec4(col, 1.0);
}
`;