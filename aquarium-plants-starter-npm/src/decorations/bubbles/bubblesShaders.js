// bubbleShaders.js

export const vs = `#version 300 es
precision highp float;

in vec3 a_pos;      // unit sphere vertex
in vec3 a_normal;   // unit sphere normal

in vec3 i_offset;   // bubble center (world space)
in float i_radius;  // bubble radius

uniform mat4 u_proj;
uniform mat4 u_view;
uniform float u_time;

out vec3 v_normal;
out float v_camDist;
out vec3 v_world;

void main() {
  // sphere scaled and translated into world space
  vec3 world = i_offset + a_pos * i_radius;
  v_world = world;

  // normal = scaled normal (unit sphere so same as a_normal)
  v_normal = normalize(a_normal);

  vec4 V = u_view * vec4(world, 1.0);
  v_camDist = length(V.xyz);
  gl_Position = u_proj * V;
}
`;

export const fs = `#version 300 es
precision highp float;

in vec3 v_normal;
in float v_camDist;
in vec3 v_world;
out vec4 outColor;

uniform vec3  u_fogColor;
uniform float u_fogNear;
uniform float u_fogFar;

// Simple bubble color: bright rim, slightly darker core
void main() {
  vec3 n = normalize(v_normal);
  vec3 L = normalize(vec3(0.3, 1.0, 0.2));
  float lam = max(dot(n, L), 0.0);

  // fake "rim" highlight based on normal pointing away from up
  float rim = pow(1.0 - abs(n.y), 2.0);

  vec3 core  = vec3(0.75, 0.93, 1.0);
  vec3 edge  = vec3(0.95, 1.0, 1.0);
  vec3 col   = mix(core, edge, rim) * (0.35 + 0.65 * lam);

  // slight darkening deeper in the tank
  float depthTint = smoothstep(-0.3, 0.8, v_world.y);
  col *= mix(0.85, 1.05, depthTint);

  // fog to match rest of scene
  float fog = smoothstep(u_fogNear, u_fogFar, v_camDist);
  col = mix(col, u_fogColor, fog);

  outColor = vec4(col, 1.0);
}
`;