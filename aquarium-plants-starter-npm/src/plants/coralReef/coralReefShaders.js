// plants/coralReefShaders.js

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

void main(){
  vec3 n = normalize(v_normal);
  vec3 L = normalize(vec3(-0.3, 1.0, 0.2));
  float lam = clamp(dot(n, L), 0.0, 1.0);

  // vertical gradient (slightly brighter near tips)
  float h01 = clamp(v_world.y * 1.6 + 0.7, 0.0, 1.0);

  // base coral color from hue
  vec3 base = h2rgb(v_hue);
  base = mix(base * vec3(0.6,0.5,0.7), base * 1.35, h01);

  // small speckles / polyps
  float speck = hash12(v_world.xz * 12.0);
  float spots = step(0.87, speck);
  vec3 spotCol = h2rgb(v_hue + 0.13) * 1.4;
  vec3 col = mix(base, spotCol, spots * 0.7);

  // simple diffuse + little rim light
  float rim = pow(1.0 - clamp(dot(n, normalize(-v_world)), 0.0, 1.0), 2.0);
  col *= (0.35 + 0.8 * lam) + rim * 0.3;

  // fog
  float f = smoothstep(u_fogNear, u_fogFar, v_camDist);
  col = mix(col, u_fogColor, f);

  outColor = vec4(col, 1.0);
}
`;