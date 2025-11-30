
export const vs = `#version 300 es
precision highp float;

in vec2 a_xz;          // tank-space xz of the surface quad

uniform mat4 u_proj;
uniform mat4 u_view;
uniform float u_time;
uniform float u_height;   // base water height (y)

out vec3 v_normal;
out vec2 v_xz;
out float v_camDist;

// ----- soft Gerstner-style waves -----------------------------------------

// Computes displaced world position for a point p in xz-plane.
vec3 waterPos(vec2 p, float t){
  // three gentle waves with different directions / scales
  vec2 d1 = normalize(vec2( 1.0, 0.2));
  vec2 d2 = normalize(vec2(-0.6, 1.0));
  vec2 d3 = normalize(vec2( 0.3,-1.0));

  // ↑ increased amplitudes so waves are more obvious
  float a1 = 0.035;     // was 0.020
  float a2 = 0.026;     // was 0.014
  float a3 = 0.020;     // was 0.010

  float k1 = 1.6;
  float k2 = 1.1;
  float k3 = 2.0;

  float s1 = 0.9;
  float s2 = 0.7;
  float s3 = 1.2;

  // ↑ slightly stronger horizontal push
  float steep = 1.0;   // was 0.65

  float w1 = dot(d1, p) * k1 + t * s1;
  float w2 = dot(d2, p) * k2 + t * s2;
  float w3 = dot(d3, p) * k3 + t * s3;

  // vertical displacement
  float dispY =
      a1 * sin(w1) +
      a2 * sin(w2) +
      a3 * sin(w3);

  // horizontal (x/z) drift
  vec2 dispXZ =
      d1 * (steep * a1 * cos(w1)) +
      d2 * (steep * a2 * cos(w2)) +
      d3 * (steep * a3 * cos(w3));

  vec2 xz = p + dispXZ;
  float y = u_height + dispY;

  return vec3(xz.x, y, xz.y);
}

void main(){
  float t = u_time * 0.25;

  vec2 p = a_xz;

  // central position
  vec3 c  = waterPos(p, t);

  // finite differences for normal using displaced positions
  float eps = 0.05; // a bit larger since waves are steeper now
  vec3 px = waterPos(p + vec2(eps, 0.0), t);
  vec3 mx = waterPos(p - vec2(eps, 0.0), t);
  vec3 pz = waterPos(p + vec2(0.0, eps), t);
  vec3 mz = waterPos(p - vec2(0.0, eps), t);

  vec3 dx = px - mx;
  vec3 dz = pz - mz;

  vec3 n = normalize(cross(dz, dx)); // oriented normal

  vec4 V = u_view * vec4(c, 1.0);
  v_normal  = n;
  v_xz      = c.xz;       // use displaced xz so ripples / caustics follow waves
  v_camDist = length(V.xyz);

  gl_Position = u_proj * V;
}
`;

export const fs = `#version 300 es
precision highp float;

in vec3 v_normal;
in vec2 v_xz;
in float v_camDist;

out vec4 outColor;

uniform float u_time;

// base water colours
uniform vec3 u_deepColor;    // e.g. vec3(0.02, 0.25, 0.45)
uniform vec3 u_shallowColor; // e.g. vec3(0.35, 0.85, 0.98)

// fog from camera distance
uniform vec3  u_fogColor;
uniform float u_fogNear;
uniform float u_fogFar;

// ---- small helpers -------------------------------------------------
float hash21(vec2 p){
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

float noise(vec2 p){
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0,0.0));
  float c = hash21(i + vec2(0.0,1.0));
  float d = hash21(i + vec2(1.0,1.0));
  vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}

float fbm(vec2 p){
  float v = 0.0;
  float a = 0.5;
  mat2 m = mat2(1.6,1.2,-1.2,1.6);
  for(int i=0;i<4;i++){
    v += a * noise(p);
    p = m * p;
    a *= 0.5;
  }
  return v;
}

void main(){
  float t = u_time * 0.35;

  // base turquoise colour: mostly shallow, gently darkened at grazing angles
  float up = max(dot(normalize(v_normal), vec3(0.0,1.0,0.0)), 0.0);
  float fresnel = pow(1.0 - up, 2.0);
  float mixAmt = 0.55 + 0.35 * up;      // keep it pretty bright overall
  vec3 base = mix(u_deepColor, u_shallowColor, mixAmt);

  // --- caustic pattern, projected in xz plane -----------------------
  vec2 p = v_xz * 2.2;

  float n1 = fbm(p * 3.0 + vec2( 0.7*t, -0.4*t));
  float n2 = fbm(p * 4.0 + vec2(-0.3*t,  0.9*t) + 7.3);
  float n  = (n1 + n2 * 0.8) * 0.75 + 0.25;

  // turn fbm into *thin bright lines* instead of big blobs
  // center around ~0.55 and tighten
  float band = clamp(1.0 - abs(n - 0.55) * 5.0, 0.0, 1.0);
  float caustic = pow(band, 3.0);  // sharper highlights

  // slight colour tilt towards white-blue on highlights
  vec3 causticCol = vec3(1.2, 1.35, 1.45);

  // mix caustics into base
  vec3 col = base + causticCol * caustic * 0.45;

  // gentle shadowing between highlights
  col *= 0.98 - 0.10 * (1.0 - caustic);

  // --- distance fog so far-away surface blends into tank colour -----
  float f = smoothstep(u_fogNear, u_fogFar, v_camDist);
  col = mix(col, u_fogColor, f);

  // slightly more transparent so we see the tank clearly
  outColor = vec4(col, 0.45);
}
`;