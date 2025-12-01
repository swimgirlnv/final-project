// tank/driftwoodShaders.js
export const vs = `#version 300 es
precision highp float;

in vec3 a_pos;   // world position
in vec3 a_nrm;   // world normal
in vec2 a_uv;    // (u around, v along)
in float a_hue;  // per-piece hue bias

uniform mat4 u_proj, u_view;

out vec3  v_nrmW;
out vec3  v_posW;
out vec2  v_uv;
out float v_hue;
out float v_camDist;

void main(){
  v_posW = a_pos;
  v_nrmW = normalize(a_nrm);
  v_uv   = a_uv;
  v_hue  = a_hue;

  vec4 V = u_view * vec4(a_pos, 1.0);
  v_camDist = length(V.xyz);
  gl_Position = u_proj * V;
}
`;

export const fs = `#version 300 es
precision highp float;

in vec3  v_nrmW;
in vec3  v_posW;
in vec2  v_uv;
in float v_hue;
in float v_camDist;
out vec4 outColor;

uniform vec3  u_lightDir;
uniform vec3  u_ambient;
uniform vec3  u_fogColor;
uniform float u_fogNear, u_fogFar;

uniform float u_floorAmp;
uniform float u_floorScale;
uniform float u_floorYOffset;

// Procedural controls
uniform float u_grainFreq;
uniform float u_grainMix;
uniform float u_colorWarm;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float n2(vec2 p){
  vec2 i=floor(p), f=fract(p);
  float a=hash(i), b=hash(i+vec2(1.,0.)), c=hash(i+vec2(0.,1.)), d=hash(i+vec2(1.,1.));
  vec2 u=f*f*(3.-2.*f);
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}
float fbm(vec2 p){
  float a=0.5, s=0., fr=1.;
  for(int i=0;i<4;i++){ s+=a*n2(p*fr); a*=0.5; fr*=2.; }
  return s;
}
vec3 h2rgb(float h){
  float r = abs(h*6.0 - 3.0) - 1.0;
  float g = 2.0 - abs(h*6.0 - 2.0);
  float b = 2.0 - abs(h*6.0 - 4.0);
  return clamp(vec3(r,g,b),0.0,1.0);
}

void main(){
  float baseHue = mix(0.07, 0.12, u_colorWarm) + v_hue*0.03;
  vec3 base = h2rgb(baseHue) * vec3(1.05, 0.90, 0.70);
  vec3 dark = base * vec3(0.62, 0.54, 0.45);

  float ring = 0.5 + 0.5*sin(v_uv.y * u_grainFreq + fbm(v_uv*3.0)*2.6);
  float ray  = 0.5 + 0.5*sin(v_uv.x * (u_grainFreq*0.58) + fbm(v_uv.yx*2.0+3.1)*2.0);
  float grain = mix(ring, ray, 0.25);
  grain = mix(grain, pow(grain, 3.0), u_grainMix);
  grain *= (0.90 + 0.18*fbm(v_uv*8.0));

  vec3 albedo = mix(dark, base, grain);

  vec3  N = normalize(v_nrmW);
  vec3  L = normalize(u_lightDir);
  float ndl = max(dot(N,L), 0.0);
  float wrap = clamp((ndl + 0.35) / 1.35, 0.0, 1.0);

  float cavity = (1.0 - grain) * 0.35 + pow(1.0 - abs(dot(N, L)), 2.0) * 0.20;
  vec3 lit = albedo * (u_ambient + wrap*0.9) * (1.0 - cavity*0.35);

  float sandH = (fbm(v_posW.xz * u_floorScale) - 0.5) * u_floorAmp + u_floorYOffset;
  float bury  = smoothstep(0.03, -0.01, v_posW.y - sandH); // >0 when inside sand
  // darken + slight desaturation when buried
  vec3 buried = mix(lit, mix(lit, vec3(dot(lit, vec3(0.299,0.587,0.114))), 0.35), 0.65);
  lit = mix(lit, buried, clamp(bury, 0.0, 1.0));

  float fog = smoothstep(u_fogNear, u_fogFar, v_camDist);
  vec3 col = mix(lit, u_fogColor, fog);

  outColor = vec4(col, 1.0);
}
`;