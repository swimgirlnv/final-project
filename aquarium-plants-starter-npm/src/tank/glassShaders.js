import { sandHeightGLSL } from "./sandHeight.js";

export const vs = `#version 300 es
precision highp float;

in vec3 a_pos;
in vec3 a_normal;

uniform mat4 u_proj;
uniform mat4 u_view;
uniform float u_sandDepth;
${sandHeightGLSL}

out vec3 v_normal;
out float v_camDist;
out float v_height;

void main() {
  // bottom edge vertices follow the underside of the sand slab
  vec3 p = a_pos;
  if (p.y < -0.5) p.y = sandOffset(p.xz) - 0.03 - u_sandDepth;

  vec4 world = vec4(p, 1.0);
  vec4 viewPos = u_view * world;

  v_camDist = length(viewPos.xyz);
  v_height  = p.y;

  // rotate normal into view space (ignore translation)
  mat3 nmat = mat3(u_view);
  v_normal = normalize(nmat * a_normal);

  gl_Position = u_proj * viewPos;
}
`;

export const fs = `#version 300 es
precision highp float;

in vec3 v_normal;
in float v_camDist;
in float v_height;

out vec4 outColor;

uniform vec3  u_glassColor;
uniform float u_alpha;

uniform vec3  u_fogColor;
uniform float u_fogNear;
uniform float u_fogFar;

uniform float u_yMin;
uniform float u_yMax;

// scene brightness, lowered in disco mode
uniform float u_bright;

void main() {
  vec3 n = normalize(v_normal);

  // Fresnel-ish edge highlight (stronger at glancing angles)
  float edge = pow(1.0 - abs(n.y), 3.0);

  // Vertical gradient (slightly lighter near top)
  float h = clamp((v_height - u_yMin) / max(u_yMax - u_yMin, 0.001), 0.0, 1.0);
  vec3 base = mix(u_glassColor * 0.9, u_glassColor * 1.25, h);

  vec3 col = base + edge * 0.25;

  // Blend a little with scene fog so far-away sides fade nicely
  float f = smoothstep(u_fogNear, u_fogFar, v_camDist);
  col = mix(col, u_fogColor, f * 0.4);

  col *= u_bright;

  float alpha = clamp(u_alpha + edge * 0.18, 0.05, 0.85);

  outColor = vec4(col, alpha);
}
`;