
export const vs = `#version 300 es
precision highp float;

in vec3 a_pos;
in vec3 a_normal;
in float a_height;   // 0 at base, ~1 near tips
in float a_hue;

uniform mat4 u_proj;
uniform mat4 u_view;
uniform float u_time;

out vec3 v_normal;
out float v_height;
out float v_camDist;
out float v_hue;

void main(){
  vec3 pos = a_pos;

  // gentle sway, stronger near tips
  float sway = 0.03 * a_height * a_height;
  pos.x += sway * sin(u_time * 0.7 + pos.y * 6.0);
  pos.z += 0.5 * sway * cos(u_time * 0.6 + pos.y * 4.5);

  v_normal = a_normal;
  v_height = a_height;
  v_hue = a_hue;

  vec4 V = u_view * vec4(pos, 1.0);
  v_camDist = length(V.xyz);
  gl_Position = u_proj * V;
}
`;

export const fs = `#version 300 es
precision highp float;

in vec3 v_normal;
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

void main(){
  vec3 n = normalize(v_normal);
  vec3 L = normalize(vec3(-0.4, 0.9, 0.2));
  float lam = max(dot(n, L), 0.0);

  // warm sea-fan palette
  vec3 warmA = vec3(0.78, 0.52, 0.33);
  vec3 warmB = vec3(0.96, 0.74, 0.50);
  vec3 warm = mix(warmA, warmB, v_height);
  vec3 hueTint = h2rgb(v_hue) * vec3(1.0, 0.8, 0.7);
  vec3 base = mix(warm, hueTint, 0.25);

  // simple lighting + slight rim
  float rim = pow(1.0 - lam, 3.0);
  vec3 col = base * (0.35 + 0.75 * lam) + rim * 0.25;

  // fog
  float f = smoothstep(u_fogNear, u_fogFar, v_camDist);
  col = mix(col, u_fogColor, f);

  outColor = vec4(col, 1.0);
}
`;