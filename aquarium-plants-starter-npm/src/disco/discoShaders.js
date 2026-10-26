// Shaders for the darkened disco scene, light beams and glow sprites

// Full screen triangle generated from the vertex id
export const compositeVs = `#version 300 es
out vec2 v_uv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  v_uv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

// Darkens the scene and adds the spotlight pools and mirror ball flecks
// at the world position of each pixel, then restores the scene depth
export const compositeFs = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 outColor;

uniform sampler2D u_color;
uniform highp sampler2D u_depth;
uniform mat4 u_invViewProj;
uniform vec3 u_ballPos;
uniform float u_time;
uniform float u_dark;    // share of the normal lighting kept at full disco
uniform float u_amount;  // 0 normal scene, 1 full disco

uniform int u_numSpots;
uniform vec3 u_spotDir[4];
uniform vec3 u_spotColor[4];
uniform float u_spotCos[4];

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec3 base = texture(u_color, v_uv).rgb;
  float d = texture(u_depth, v_uv).r;
  gl_FragDepth = d;

  float keep = mix(1.0, u_dark, u_amount);
  if (d >= 1.0) {
    outColor = vec4(base * keep, 1.0);
    return;
  }

  // world position of this pixel
  vec4 w = u_invViewProj * vec4(v_uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  vec3 P = w.xyz / w.w;
  vec3 L = normalize(P - u_ballPos);

  // coloured pools where the beams land
  vec3 light = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    if (i >= u_numSpots) break;
    float c = dot(L, u_spotDir[i]);
    light += u_spotColor[i] * smoothstep(u_spotCos[i], mix(u_spotCos[i], 1.0, 0.35), c);
  }

  // small white flecks thrown by the spinning mirror ball
  float spin = u_time * 0.5;
  vec3 R = vec3(cos(spin) * L.x - sin(spin) * L.z, L.y, sin(spin) * L.x + cos(spin) * L.z);
  vec2 sph = vec2(atan(R.y, R.z), asin(clamp(R.x, -1.0, 1.0))) * (18.0 / 3.14159);
  vec2 f = fract(sph) - 0.5;
  float fleck = step(0.55, hash12(floor(sph))) * (1.0 - smoothstep(0.08, 0.16, length(f)));
  light += vec3(0.9, 0.92, 1.0) * fleck * 0.8;

  outColor = vec4(base * (keep + light * 1.4 * u_amount), 1.0);
}
`;

// Cone from the ball along a spotlight, unit length and radius
export const beamVs = `#version 300 es
precision highp float;

in vec3 a_pos; // (cos, sin, t) where t runs from the tip to the open end

uniform mat4 u_proj;
uniform mat4 u_view;
uniform vec3 u_apex;
uniform vec3 u_axis;
uniform float u_len;
uniform float u_radius;

out vec3 v_world;
out vec3 v_normal;
out float v_t;

void main() {
  vec3 z = u_axis;
  vec3 helper = abs(z.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 x = normalize(cross(z, helper));
  vec3 y = cross(z, x);

  vec3 radial = x * a_pos.x + y * a_pos.y;
  vec3 world = u_apex + radial * (u_radius * a_pos.z) + z * (u_len * a_pos.z);

  v_world = world;
  v_normal = radial;
  v_t = a_pos.z;
  gl_Position = u_proj * u_view * vec4(world, 1.0);
}
`;

export const beamFs = `#version 300 es
precision highp float;

in vec3 v_world;
in vec3 v_normal;
in float v_t;
out vec4 outColor;

uniform vec3 u_camPos;
uniform vec3 u_color;
uniform float u_strength;

void main() {
  // brightest through the middle of the cone, fading at its silhouette
  float facing = abs(dot(normalize(v_normal), normalize(u_camPos - v_world)));
  float a = u_strength * pow(facing, 1.5) * (1.0 - 0.6 * v_t) * smoothstep(0.0, 0.08, v_t);
  outColor = vec4(u_color * a, 1.0);
}
`;

// Soft camera facing halo drawn around glowing objects
export const glowVs = `#version 300 es
precision highp float;

in vec2 a_corner;
in vec3 i_pos;
in float i_radius;
in vec3 i_color;

uniform mat4 u_proj;
uniform mat4 u_view;

out vec2 v_q;
out vec3 v_color;

void main() {
  vec3 right = vec3(u_view[0][0], u_view[1][0], u_view[2][0]);
  vec3 up    = vec3(u_view[0][1], u_view[1][1], u_view[2][1]);
  vec3 world = i_pos + (right * a_corner.x + up * a_corner.y) * i_radius;

  v_q = a_corner;
  v_color = i_color;
  gl_Position = u_proj * u_view * vec4(world, 1.0);
}
`;

export const glowFs = `#version 300 es
precision highp float;

in vec2 v_q;
in vec3 v_color;
out vec4 outColor;

uniform float u_strength;

void main() {
  float r = length(v_q);
  float a = exp(-r * r * 5.0) * (1.0 - smoothstep(0.8, 1.0, r));
  outColor = vec4(v_color * a * u_strength, 1.0);
}
`;
