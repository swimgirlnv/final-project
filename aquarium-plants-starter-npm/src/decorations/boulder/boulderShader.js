export const vs = `#version 300 es
precision highp float;

in vec3 a_pos;
in vec3 a_normal;
in vec2 a_uv;

in vec3 i_offset; // per-instance world offset
in float i_scale;
in float i_hue;

uniform mat4 u_proj;
uniform mat4 u_view;
uniform float u_time;

out vec3 v_normal;
out vec3 v_world;
out float v_hue;
out float v_camDist;

// cheap hash / value noise
float hash13(vec3 p){
  return fract(sin(dot(p, vec3(127.1,311.7,74.7))) * 43758.5453123);
}
float valueNoise(vec3 p){
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
float fbm(vec3 p){
  float v = 0.0;
  float a = 0.5;
  float f = 1.0;
  for(int i=0;i<4;i++){
    v += a * valueNoise(p * f);
    f *= 2.0;
    a *= 0.5;
  }
  return v;
}

void main(){
  // base position on unit sphere, slightly squashed so rocks feel heavier
  vec3 worldPos = a_pos;
  worldPos.y *= 0.8;

  // small animated displacement along normal using FBM
  float n = fbm(worldPos * 3.5 + i_offset * 0.5 + vec3(0.0, u_time*0.05, 0.0));
  float disp = (n - 0.5) * 0.25;
  vec3 displaced = worldPos + a_normal * disp;

  vec3 pos = displaced * i_scale + i_offset;

  v_world  = pos;
  // approximate normal from displaced position so bumps catch light
  v_normal = normalize(displaced);
  v_hue    = i_hue;

  vec4 V = u_view * vec4(pos, 1.0);
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

uniform vec3 u_lightDir;
uniform vec3 u_fogColor;
uniform float u_fogNear;
uniform float u_fogFar;
uniform float u_time;

vec3 h2rgb(float h){
  float r = abs(h*6.0 - 3.0) - 1.0;
  float g = 2.0 - abs(h*6.0 - 2.0);
  float b = 2.0 - abs(h*6.0 - 4.0);
  return clamp(vec3(r,g,b),0.0,1.0) * 0.9;
}

float hash12(vec2 p){
  return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453123);
}

// simple 2D value noise for color mottling
float noise2(vec2 p){
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0,0.0));
  float c = hash12(i + vec2(0.0,1.0));
  float d = hash12(i + vec2(1.0,1.0));
  float x1 = mix(a,b,u.x);
  float x2 = mix(c,d,u.x);
  return mix(x1,x2,u.y);
}

float caustic(float x){
  return 0.5 + 0.5 * sin(x);
}

void main(){
  vec3 n = normalize(v_normal);
  vec3 L = normalize(u_lightDir);
  vec3 V = normalize(-v_world); // view approx from tank center

  float lam = max(dot(n, L), 0.0);
  float rim = pow(1.0 - max(dot(n, V), 0.0), 2.0); // soft edge highlight

  // subtle "ambient occlusion": darker on downward-facing surfaces
  float up = clamp(n.y * 0.5 + 0.5, 0.0, 1.0);
  float ao = mix(0.55, 1.0, up);

  // base rock palette from hue + neutral rock tint
  vec3 hueCol   = h2rgb(v_hue);
  vec3 rockTint = mix(vec3(0.40,0.37,0.34), vec3(0.80,0.74,0.66), 0.6);
  vec3 base     = hueCol * rockTint;

  // world-space y → mossy tops
  float mossMask = smoothstep(-0.05, 0.35, v_world.y);
  vec3 mossCol   = vec3(0.24, 0.45, 0.28);
  base = mix(base, mossCol, mossMask * 0.65);

  // noisy color mottling across surface
  float n2 = noise2(v_world.xz * 4.0);
  float n3 = noise2((v_world.xz + 7.3) * 9.0);
  float var = mix(n2, n3, 0.5);
  base *= mix(0.85, 1.15, var);

  // subtle warm highlight vs cool shadow
  vec3 warm = vec3(1.02, 0.98, 0.92);
  vec3 cool = vec3(0.82, 0.88, 0.95);
  vec3 litTint = mix(cool, warm, lam);
  vec3 col = base * litTint;

  // combine lighting terms
  float light =
      0.25              // ambient
    + lam * 0.9
    + rim * 0.35;
  col *= light * ao;

  // tiny animated sparkle / caustics
  float c =
      0.04 * caustic(v_world.x * 9.0  + u_time * 1.4) +
      0.03 * caustic(v_world.z * 11.0 - u_time * 1.2);
  col *= (0.96 + 0.18 * c);

  // fog
  float fog = smoothstep(u_fogNear, u_fogFar, v_camDist);
  col = mix(col, u_fogColor, fog);

  outColor = vec4(col, 1.0);
}
`;