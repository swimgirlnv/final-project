export const vs = `#version 300 es
precision highp float;

// attributes
in vec3 vs_Pos;
in vec3 vs_Col;

// Uniforms
uniform mat4 u_proj;
uniform mat4 u_view;
uniform float u_time;
uniform vec2  u_res;         // viewport size


// Varyings
out vec3 v_pos;
out vec3 v_color;

float hash11(float n){ return fract(sin(n)*43758.5453123); }

// Cheap 2D noise based on sin (good enough for water wobble)
float n2(vec2 p) {
  return sin(p.x)*sin(p.y);
}

// Convert hue to rgb (approximate), fixed s=0.6, v=0.9
vec3 h2rgb(float h){
  float r = abs(h*6.0 - 3.0) - 1.0;
  float g = 2.0 - abs(h*6.0 - 2.0);
  float b = 2.0 - abs(h*6.0 - 4.0);
  return clamp(vec3(r,g,b),0.0,1.0) * 0.9;
}

void main() {
  // just pass defined color to frag shader
  v_color = vs_Col;

  vec3 world = vs_Pos;

  // Project
  vec4 projPos = u_proj * u_view * vec4(world, 1.0);
  v_pos = vec3(projPos.x, projPos.y, projPos.z);
  gl_Position = vec4(v_pos, 1.0);
}`;

export const fs = `#version 300 es
precision highp float;

in vec3 v_color;
out vec4 outColor;

uniform float u_time;

// Simple caustics look via animated stripes
float caustic(float x){
  return 0.5 + 0.5*sin(x);
}

void main() {
  outColor = vec4(v_color, 1.0);
}
`;