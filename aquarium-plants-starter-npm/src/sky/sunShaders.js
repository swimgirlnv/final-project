// sunShaders.js - sun above the tank that turns into a disco ball

export const sphereVs = `#version 300 es
precision highp float;

in vec3 a_pos; // unit sphere

uniform mat4 u_proj;
uniform mat4 u_view;
uniform vec3 u_center;
uniform float u_radius;

out vec3 v_normal;
out vec3 v_world;

void main() {
  vec3 world = u_center + a_pos * u_radius;
  v_normal = a_pos;
  v_world = world;
  gl_Position = u_proj * u_view * vec4(world, 1.0);
}
`;

export const sphereFs = `#version 300 es
precision highp float;

in vec3 v_normal;
in vec3 v_world;
out vec4 outColor;

uniform vec3 u_camPos;
uniform float u_time;
uniform float u_morph; // 0 sun, 1 disco ball

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec3 rotY(vec3 v, float a) {
  float c = cos(a), s = sin(a);
  return vec3(c * v.x + s * v.z, v.y, -s * v.x + c * v.z);
}

void main() {
  vec3 N = normalize(v_normal);
  vec3 V = normalize(u_camPos - v_world);
  float ndv = max(dot(N, V), 0.0);

  // sun: bright yellow face with an orange rim and slow surface swirl
  float swirl = sin(N.x * 9.0 + u_time * 0.8) * sin(N.y * 7.0 - u_time * 0.6) * sin(N.z * 8.0 + u_time * 0.5);
  vec3 sun = mix(vec3(1.0, 0.55, 0.08), vec3(1.0, 0.9, 0.3), smoothstep(0.0, 0.7, ndv));
  sun += vec3(0.08, 0.05, 0.0) * swirl;

  // disco ball: rows of mirror tiles on a spinning sphere
  const float BANDS = 14.0;
  float spin = u_time * 0.8;
  vec3 Nl = rotY(N, -spin);
  float lat = asin(clamp(Nl.y, -1.0, 1.0));
  float lon = atan(Nl.z, Nl.x);

  float latF = (lat / 3.14159 + 0.5) * BANDS;
  float band = floor(latF);
  float latC = ((band + 0.5) / BANDS - 0.5) * 3.14159;
  float cells = max(4.0, floor(2.0 * BANDS * cos(latC)));
  float lonF = (lon / 6.28318 + 0.5) * cells;
  float cell = floor(lonF);
  float lonC = ((cell + 0.5) / cells - 0.5) * 6.28318;

  vec2 g = vec2(fract(lonF), fract(latF));
  float tile = step(0.08, g.x) * step(g.x, 0.92) * step(0.08, g.y) * step(g.y, 0.92);

  // each tile is flat, so it reflects with the normal of its centre
  vec3 facet = rotY(vec3(cos(latC) * cos(lonC), sin(latC), cos(latC) * sin(lonC)), spin);
  float h = hash12(vec2(band, cell));
  vec3 R = reflect(-V, facet);
  float spec = pow(max(dot(R, normalize(vec3(-0.3, 1.0, 0.4))), 0.0), 30.0);
  float twinkle = step(0.93, fract(h * 13.7 + floor(u_time * 5.0) * 0.618));
  vec3 mirror = vec3(0.55 + 0.25 * h) + spec * 1.5 + twinkle * 0.8;
  vec3 ball = mix(vec3(0.22), mirror, tile);

  outColor = vec4(mix(sun, ball, u_morph), 1.0);
}
`;

// Camera facing quad behind the sphere for the rays and the sparkles
export const billboardVs = `#version 300 es
precision highp float;

in vec2 a_corner;

uniform mat4 u_proj;
uniform mat4 u_view;
uniform vec3 u_center;
uniform float u_size;

out vec2 v_q;

void main() {
  vec3 right = vec3(u_view[0][0], u_view[1][0], u_view[2][0]);
  vec3 up    = vec3(u_view[0][1], u_view[1][1], u_view[2][1]);
  vec3 world = u_center + (right * a_corner.x + up * a_corner.y) * u_size;
  v_q = a_corner;
  gl_Position = u_proj * u_view * vec4(world, 1.0);
}
`;

export const billboardFs = `#version 300 es
precision highp float;

in vec2 v_q;
out vec4 outColor;

uniform float u_time;
uniform float u_morph;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec2 q = v_q; // the sphere edge sits at radius 1/3
  float r = length(q);
  float a = atan(q.y, q.x);

  // straight rays that squiggle as waves run outward along them
  const float RAYS = 12.0;
  float sector = 6.28318 / RAYS;
  float turn = u_time * 0.15;
  // ray index wrapped to 0..RAYS-1 so the ray across the atan seam on the left matches itself
  float k = mod(floor((a - turn) / sector + 0.5), RAYS);
  float perp = r * sin(a - (k * sector + turn));
  float wiggle = 0.022 * sin(r * 40.0 - u_time * 6.0 + k * 1.7);
  float dLine = abs(perp - wiggle);
  float aa = fwidth(dLine);
  float line = 1.0 - smoothstep(0.016 - aa, 0.016 + aa, dLine);

  float rayLen = mod(k, 2.0) < 0.5 ? 0.48 : 0.34;
  float rEnd = 0.40 + rayLen + 0.04 * sin(u_time * 3.0 + k);
  float rays = line * smoothstep(0.38, 0.42, r) * (1.0 - smoothstep(rEnd - 0.06, rEnd, r));

  float halo = exp(-max(r - 0.333, 0.0) * 14.0) * 0.45;
  float sunA = clamp(rays + halo, 0.0, 1.0);
  vec3 sunCol = mix(vec3(1.0, 0.85, 0.3), vec3(1.0, 0.5, 0.05), rays / max(rays + halo, 1e-4));

  // four pointed star sparkles that pop in and out around the ball
  vec3 stars = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    float period = 1.4 + 0.5 * hash12(vec2(fi, 3.1));
    float tt = u_time / period + hash12(vec2(fi, 7.7));
    float n = floor(tt);
    float life = fract(tt);
    float show = step(0.3, hash12(vec2(fi, n)));

    float ang = hash12(vec2(n, fi + 1.3)) * 6.28318;
    float rad = 0.45 + 0.4 * hash12(vec2(fi + 2.1, n));
    vec2 dq = q - vec2(cos(ang), sin(ang)) * rad;

    float size = 0.12 * sin(3.14159 * life) + 1e-4;
    float thin = size * 0.12;
    float star = max(0.0, 1.0 - abs(dq.x) / size) * max(0.0, 1.0 - abs(dq.y) / thin)
               + max(0.0, 1.0 - abs(dq.y) / size) * max(0.0, 1.0 - abs(dq.x) / thin);
    float core = exp(-dot(dq, dq) / (size * size * 0.02));
    stars += vec3(1.0, 0.97, 0.9) * (star + core) * show;
  }

  // premultiplied: sun parts blend over the scene, stars add light
  float keepSun = 1.0 - u_morph;
  outColor = vec4(sunCol * sunA * keepSun + stars * u_morph, sunA * keepSun);
}
`;
