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

float hash13(vec3 p){
  return fract(sin(dot(p, vec3(127.1,311.7,74.7))) * 43758.5453123);
}

void main(){
  float len  = length(i_axis);
  vec3  axis = i_axis / max(len, 1e-4);

  // build orthonormal basis (axis = "up")
  vec3 tmp = abs(axis.y) < 0.85 ? vec3(0.0,1.0,0.0) : vec3(1.0,0.0,0.0);
  vec3 side = normalize(cross(axis, tmp));
  vec3 up   = normalize(cross(side, axis));

  float y = clamp(a_pos.y, 0.0, 1.0);
  v_height = y;

  // cylindrical coords
  vec3 radDir = normalize(a_pos.x * side + a_pos.z * up);
  float n = hash13(radDir * 3.1 + vec3(y) + i_base * 7.3);
  float bump = (n - 0.5) * 0.25;

  float r = i_radius * (1.0 + bump);
  vec3 core = i_base + axis * (y * len);

  // gentle sway near the tips
  float swayFactor = y * y;
  float ang = u_time * 0.8 + i_phase;
  vec3 swayDir = normalize(side * cos(ang) + up * sin(ang));
  vec3 sway = swayDir * (0.05 * swayFactor);

  vec3 world = core + radDir * r + sway;

  v_world = world;
  v_normal = normalize(radDir + axis * 0.25);
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
in float v_hue;
in float v_height;
in float v_camDist;
out vec4 outColor;

uniform vec3 u_fogColor;
uniform float u_fogNear;
uniform float u_fogFar;

vec3 h2rgb(float h){
  float r = abs(h*6.0 - 3.0) - 1.0;
  float g = 2.0 - abs(h*6.0 - 2.0);
  float b = 2.0 - abs(h*6.0 - 4.0);
  return clamp(vec3(r,g,b),0.0,1.0);
}

void main(){
  vec3 n = normalize(v_normal);
  vec3 L = normalize(vec3(-0.3,1.0,0.2));
  float lam = clamp(dot(n, L), 0.0, 1.0);

  // base color: blue-green to purple depending on hue
  vec3 base = h2rgb(v_hue);
  // fade tips lighter
  base = mix(base * 0.6, base * 1.3, v_height);

  // soft rim light
  float rim = pow(1.0 - clamp(dot(n, normalize(-v_world)), 0.0, 1.0), 2.0);
  vec3 col = base * (0.35 + 0.8 * lam) + base * rim * 0.35;

  // fog
  float f = smoothstep(u_fogNear, u_fogFar, v_camDist);
  col = mix(col, u_fogColor, f);

  outColor = vec4(col, 1.0);
}
`;