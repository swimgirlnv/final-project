// grassShaders.js

export const vs = `#version 300 es
precision highp float;

// Base blade mesh
in vec2  a_pos;    // x = width dir (±0.5), y unused
in float a_t;
in vec2  a_uv;

// Per-instance
in vec2  i_base;       // (x,z)
in float i_height;
in float i_phase;
in float i_amp;
in float i_hue;
in float i_yaw;        // random ribbon yaw (radians)

// Uniforms
uniform mat4 u_proj;
uniform mat4 u_view;
uniform float u_time;
uniform float u_currentStrength;
uniform vec2  u_currentDir;
uniform float u_flex;

// Varyings
out float v_t;
out vec3  v_color;
out float v_camDist;
out vec3  v_worldPos;

float hash11(float n){ return fract(sin(n)*43758.5453123); }

vec3 h2rgb(float h){
  float r = abs(h*6.0 - 3.0) - 1.0;
  float g = 2.0 - abs(h*6.0 - 2.0);
  float b = 2.0 - abs(h*6.0 - 4.0);
  return clamp(vec3(r,g,b),0.0,1.0) * 0.9;
}

void main() {
  float t = clamp(a_t, 0.0, 1.0);
  float H = i_height;

  // Tip-weight (keeps base fixed)
  float tipPow = pow(t, u_flex);
  float hinge  = max(tipPow, smoothstep(0.06, 0.28, t));

  // Gentle sway + wobble
  float speed  = 0.5 + 0.3 * hash11(i_phase * 91.7);
  float phase  = i_phase + u_time * speed;

  float lenCD = length(u_currentDir);
  vec2 lateral = (lenCD < 1e-5) ? vec2(1.0, 0.0) : normalize(vec2(-u_currentDir.y, u_currentDir.x));

  // Random ribbon facing: rotate "width" axis around up by i_yaw
  vec2 perp = vec2(-lateral.y, lateral.x);              // 90° rotated in XZ
  float c = cos(i_yaw), s = sin(i_yaw);
  vec2 widthDir = normalize(c * lateral + s * perp);    // rotated width axis in XZ

  const float GENTLE = 0.15;
  float sway   = sin(phase + t*1.9) * i_amp * u_currentStrength * hinge * GENTLE;
  float wobble = 0.008 * sin(7.0*t + u_time*1.7 + i_phase*3.1) * hinge;

  // Width with taper to visually pin root
  float baseW   = 0.022 * (1.0 - 0.7*t);
  float widthW  = baseW * smoothstep(0.02, 0.20, t);

  // Assemble world position
  vec3 world;
  world.xz = i_base
           + lateral  * (sway + wobble)                 // motion sideways to current
           + widthDir * (a_pos.x * widthW);             // ribbon width in rotated facing
  world.y  = t * H;

  // slight downstream drift (tip-weighted)
  world.xz += u_currentDir * (0.035 * hinge * sin(t*2.6 + i_phase + u_time));

  // Project + fog distance
  vec4 V = u_view * vec4(world, 1.0);
  v_camDist = length(V.xyz);
  v_worldPos = world;
  gl_Position = u_proj * V;

  // Color gradient
  vec3 c0 = h2rgb(i_hue) * vec3(0.40, 0.70, 0.50);
  vec3 c1 = h2rgb(i_hue) * vec3(0.80, 1.00, 0.90);
  v_color = mix(c0, c1, t);
  v_t = t;
}
`;

export const fs = `#version 300 es
precision highp float;

in float v_t;
in vec3  v_color;
in float v_camDist;
in vec3  v_worldPos;
out vec4 outColor;

uniform float u_time;

// Fog
uniform vec3  u_fogColor;
uniform float u_fogNear;
uniform float u_fogFar;

// Disco lights
uniform int u_numDiscoLights;
uniform vec3 u_discoLightPos[6];
uniform vec3 u_discoLightColor[6];

// Disco spotlights
uniform int u_numSpotlights;
uniform vec3 u_spotlightPos[4];
uniform vec3 u_spotlightDir[4];
uniform vec3 u_spotlightColor[4];
uniform float u_spotlightAngle[4];

// Subtle animated caustics
float caustic(float x){ return 0.5 + 0.5*sin(x); }

void main() {
  float c = 0.10 * caustic(v_t*24.0 + u_time*2.0)
          + 0.05 * caustic(v_t*39.0 - u_time*1.8);
  vec3 col = v_color * (1.0 + c);

  // Add disco lights
  if (u_numDiscoLights > 0) {
    vec3 discoContribution = vec3(0.0);
    for (int i = 0; i < 6; i++) {
      if (i >= u_numDiscoLights) break;
      vec3 lightDir = u_discoLightPos[i] - v_worldPos;
      float dist = length(lightDir);
      float attenuation = 1.0 / (1.0 + dist * dist * 0.5);
      discoContribution += u_discoLightColor[i] * attenuation;
    }
    col += discoContribution * 0.8;
  }
  
  // Add spotlights
  if (u_numSpotlights > 0) {
    vec3 spotContribution = vec3(0.0);
    for (int i = 0; i < 4; i++) {
      if (i >= u_numSpotlights) break;
      vec3 lightDir = v_worldPos - u_spotlightPos[i];
      float dist = length(lightDir);
      vec3 L = lightDir / dist;
      
      // Check if point is within cone
      float spotDot = dot(L, u_spotlightDir[i]);
      if (spotDot > u_spotlightAngle[i]) {
        // Smooth falloff at cone edges
        float spotEffect = smoothstep(u_spotlightAngle[i], u_spotlightAngle[i] + 0.1, spotDot);
        float attenuation = 1.0 / (1.0 + dist * dist * 0.15);
        spotContribution += u_spotlightColor[i] * attenuation * spotEffect;
      }
    }
    col += spotContribution * 1.5;
  }

  // Fog mix
  float fog = smoothstep(u_fogNear, u_fogFar, v_camDist);
  col = mix(col, u_fogColor, fog);

  outColor = vec4(col, 1.0);
}
`;