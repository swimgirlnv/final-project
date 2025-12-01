// decor/shellShaders.js

export const vs = `#version 300 es
precision highp float;

in vec3 a_pos;
in vec3 a_normal;
in vec2 a_uv;

in vec3 i_offset;   // world offset
in float i_scale;   // uniform scale
in float i_hue;     // small per-instance tint

uniform mat4 u_proj;
uniform mat4 u_view;
uniform float u_time;
uniform float u_kind;  // 0 = scallop, 1 = auger, 2 = moon

out vec3 v_normal;
out vec3 v_world;
out vec3 v_local;   // local (unscaled) coords for patterning
out float v_camDist;
out vec2 v_uv;
out float v_kind;
out float v_hue;

void main() {
  // tiny per-instance rotation so they’re not perfectly aligned
  float orient = fract(sin(dot(i_offset.xz, vec2(37.2, 81.7))) * 43758.5453);
  float ang = (orient - 0.5) * 1.2; // -~0.6..0.6
  float ca = cos(ang);
  float sa = sin(ang);

  vec3 p = a_pos;
  // assume shells built mostly in XZ plane, rotate around Y
  p.xz = mat2(ca, -sa, sa, ca) * p.xz;

  v_local = p;              // local space (before scale)
  vec3 world = i_offset + p * i_scale;

  v_world  = world;
  v_normal = normalize(a_normal);
  v_uv     = a_uv;
  v_kind   = u_kind;
  v_hue    = i_hue;

  vec4 V = u_view * vec4(world, 1.0);
  v_camDist = length(V.xyz);
  gl_Position = u_proj * V;
}
`;

export const fs = `#version 300 es
precision highp float;

in vec3 v_normal;
in vec3 v_world;
in vec3 v_local;
in float v_camDist;
in vec2 v_uv;
in float v_kind;
in float v_hue;
out vec4 outColor;

uniform vec3  u_fogColor;
uniform float u_fogNear;
uniform float u_fogFar;
uniform float u_time;

// --- helpers ---------------------------------------------------------------

vec3 h2rgb(float h){
  float r = abs(h*6.0 - 3.0) - 1.0;
  float g = 2.0 - abs(h*6.0 - 2.0);
  float b = 2.0 - abs(h*6.0 - 4.0);
  return clamp(vec3(r,g,b),0.0,1.0);
}

float hash12(vec2 p){
  return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453123);
}

void main() {
  vec3 n = normalize(v_normal);
  vec3 L = normalize(vec3(-0.3, 0.9, 0.2));
  vec3 Vdir = normalize(-v_world);

  float diff = max(dot(n, L), 0.0);
  float rim  = pow(1.0 - max(dot(n, Vdir), 0.0), 3.0);

  // simple specular highlight
  vec3 H = normalize(L + Vdir);
  float spec = pow(max(dot(n, H), 0.0), 24.0);

  // ambient occlusion from “contact with sand” (sand roughly around y = 0)
  float occl = smoothstep(-0.10, 0.06, v_world.y); // low y → darker
  occl = mix(0.55, 1.0, occl);                     // 0.55..1.0 multiplier

  vec3 col;

  // -------------------------------------------------------------------------
  // 0: scallop fan – radial ribs, orange/red stripes, bright rim
  // -------------------------------------------------------------------------
  if (v_kind < 0.5) {
    // assume fan lies mostly in XZ plane
    vec2 q = v_local.xz;
    float r = length(q);
    float ang = atan(q.y, q.x);          // -pi..pi
    float a = ang / 3.14159265;          // -1..1

    // map radius into 0..1 (inner cutout ≈0.2, outer rim ≈1.0)
    float rv = clamp((r - 0.2) / 0.8, 0.0, 1.0);

    // base warm gradient from hinge to rim
    vec3 warmA = vec3(0.85, 0.40, 0.29);   // deep orange
    vec3 warmB = vec3(1.00, 0.80, 0.62);   // pale peach
    vec3 base  = mix(warmA, warmB, rv);

    // radial ridges (more dense toward rim)
    float ridgeFreq = mix(6.0, 18.0, rv);
    float ridge = 0.5 + 0.5 * sin(a * ridgeFreq);
    float ridgeMask = smoothstep(0.2, 1.0, rv);
    base *= 0.85 + 0.30 * ridge * ridgeMask;

    // white calcium streaks near outer edge
    float band = smoothstep(0.75, 1.0, rv);
    float stripe = step(0.75, fract((a + 1.0) * 2.8)); // a few big wedges
    base = mix(base, vec3(1.0, 0.98, 0.96), band * stripe * 0.9);

    // darker hinge / interior
    float hinge = 1.0 - rv;
    base *= mix(1.0, 0.7, hinge * 0.8);

    col = base;
  }
  // -------------------------------------------------------------------------
  // 1: auger spiral – banding around a cone
  // -------------------------------------------------------------------------
  else if (v_kind < 1.5) {
    // auger built along +Y, radius in XZ
    float h = clamp(v_local.y * 0.5 + 0.5, 0.0, 1.0); // 0 base..1 tip
    vec2 q = v_local.xz;
    float ang = atan(q.y, q.x);          // -pi..pi

    vec3 baseA = vec3(0.93, 0.86, 0.72);
    vec3 baseB = vec3(0.99, 0.93, 0.83);
    vec3 base  = mix(baseA, baseB, h);

    // spiral bands: diagonal stripes
    float spiral = sin(ang * 10.0 + h * 18.0);
    float band = 0.5 + 0.5 * spiral;
    base *= 0.85 + 0.25 * band;

    // circumferential grooves (stacked rings)
    float ring = 0.5 + 0.5 * sin(h * 40.0);
    float grooveMask = smoothstep(0.3, 0.8, ring);
    base = mix(base * 0.80, base, grooveMask);

    // tip slightly brighter
    base = mix(base, base * 1.18, smoothstep(0.70, 1.0, h));

    col = base;
  }
  // -------------------------------------------------------------------------
  // 2: moon shell – creamy swirl with eye
  // -------------------------------------------------------------------------
  else {
    // assume “cap” in XZ plane
    vec2 q = v_local.xz;
    float r   = length(q);
    float ang = atan(q.y, q.x);

    float rn = clamp(r / 1.0, 0.0, 1.0);

    vec3 baseA = vec3(0.96, 0.88, 0.78);
    vec3 baseB = vec3(0.99, 0.95, 0.88);
    vec3 base  = mix(baseA, baseB, rn);

    // smooth swirl
    float swirl = sin(ang * 6.0 + rn * 10.0);
    float swirlMask = 0.5 + 0.5 * swirl;
    base *= 0.92 + 0.25 * swirlMask;

    // central eye
    float eye = smoothstep(0.10, 0.0, rn);
    vec3 eyeCol = vec3(0.80, 0.74, 0.86);
    base = mix(base, eyeCol, eye);

    // bright ring around the eye
    float ring = exp(-pow((rn - 0.18) / 0.04, 2.0));
    base = mix(base, vec3(1.0, 0.97, 0.93), ring * 0.8);

    // shadowed underside
    float under = smoothstep(0.35, -0.1, v_local.y);
    base *= mix(1.0, 0.75, under);

    col = base;
  }

  // per-instance subtle hue tint
  vec3 tint = h2rgb(v_hue);
  col *= mix(vec3(1.0), 0.75 + 0.35 * tint, 0.20);

  // lighting
  float light = 0.30 + diff * 0.85 + rim * 0.30 + spec * 0.45;
  col *= light * occl;

  // warm bounce from sand (up-facing parts near floor)
  float upBounce = max(n.y, 0.0) * smoothstep(-0.15, 0.08, v_world.y);
  col += vec3(0.06, 0.05, 0.04) * upBounce;

  // tiny time-varying sparkle so they feel glossy
  float sparkle = spec * (0.4 + 0.6 *
      sin(u_time * 1.4 + v_world.x * 7.0 + v_world.z * 9.0));
  col += vec3(0.03, 0.03, 0.03) * sparkle;

  // fog
  float f = smoothstep(u_fogNear, u_fogFar, v_camDist);
  col = mix(col, u_fogColor, f);

  outColor = vec4(col, 1.0);
}
`;