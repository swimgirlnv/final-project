// egeriaDensaShaders.js

export const vs = `#version 300 es
precision highp float;

// Ribbon
in vec2  a_pos;           // x = ±0.5 width dir, y = t (unused)
in float a_t;
in vec2  a_uv;

// Per-instance
in vec2  i_originXZ;      // base xz
in vec2  i_originYLen;    // (y0, length)
in vec2  i_phiTilt;       // (leaf azimuth phi, tilt 0..1)
in vec2  i_curveWidth;    // (curvature, base width)
in vec2  i_hueKind;       // (hue, kind: 0 leaf, 1 stem)

// Uniforms
uniform mat4  u_proj, u_view;
uniform float u_time;
uniform float u_currentStrength;
uniform vec2  u_currentDir;
uniform float u_leafWidthScale;

// Varyings
out vec3 v_rgb;
out float v_t;
out float v_camDist;

// Helpers
float hash21(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453123); }
vec3 h2rgb(float h){
  float r = abs(h*6.0 - 3.0) - 1.0;
  float g = 2.0 - abs(h*6.0 - 2.0);
  float b = 2.0 - abs(h*6.0 - 4.0);
  return clamp(vec3(r,g,b),0.0,1.0);
}

void main(){
  float t = clamp(a_t, 0.0, 1.0);
  float isStem = step(0.5, i_hueKind.y);      // 1 = stem, 0 = leaf
  float hue    = fract(i_hueKind.x);

  vec3 base = vec3(i_originXZ.x, i_originYLen.x, i_originXZ.y);

  // Leaf/stem frames
  vec3 up = vec3(0.0,1.0,0.0);
  float phi  = i_phiTilt.x;
  float tilt = clamp(i_phiTilt.y, 0.0, 1.0);
  vec3 radial   = vec3(cos(phi), 0.0, sin(phi));                 // outward from stem
  vec3 tanLeaf  = normalize(mix(radial, up, tilt));
  vec3 tangent  = mix(tanLeaf, up, isStem);                      // stems force vertical
  vec3 ref      = abs(dot(tangent, up)) > 0.95 ? vec3(1,0,0) : up;
  vec3 binorm   = normalize(cross(tangent, ref));
  vec3 normal   = normalize(cross(binorm, tangent));

  // Shape profiles
  float s = t*(1.0 - t);                                        // 0 at ends, peak mid
  float curve  = i_curveWidth.x;
  float width0 = i_curveWidth.y * u_leafWidthScale;
  float arch   = mix(curve, 0.25*curve, isStem) * s;            // stems get subtler swell

    // Water sway (BASE FIXED, gentle)
  float j = hash21(i_originXZ);                           // per-plant phase
  float phase = 6.2831853*j + u_time*(0.6 + 0.4*j);       // a bit slower
  float tipW  = mix(pow(t, 1.6), smoothstep(0.15, 1.0, t), isStem);
  vec3 lateral = (abs(u_currentDir.x)+abs(u_currentDir.y) < 1e-5)
               ? vec3(1.0,0.0,0.0)
               : normalize(vec3(-u_currentDir.y, 0.0, u_currentDir.x));

  // ↓ overall mellowing factor so even big UI values stay gentle
  const float GENTLE = 0.35;

  float sway   = sin(phase + t*1.6) * u_currentStrength * tipW * GENTLE;
  float wobble = 0.015 * sin(7.0*t + u_time*1.7 + j*20.0) * tipW; // tiny secondary

  // Width taper
  float taper = mix(1.0 - 0.85*t, mix(1.0, 0.7, t), isStem);
  float w = width0 * taper;

  // Assemble world position
  vec3 P = base
         + tangent * (t * i_originYLen.y)          // grow up the stem/leaf axis
         + normal  * (a_pos.x * w)                 // ribbon width
         + radial  * arch                          // gentle outward bulge
         + lateral * (sway + wobble);              // lateral sway (anchored at t=0)

  vec4 V = u_view * vec4(P, 1.0);
  v_camDist = length(V.xyz);
  gl_Position = u_proj * V;

  // gl_Position = u_proj * u_view * vec4(P, 1.0);

  // Color
  vec3 stemC = h2rgb(hue) * vec3(0.22, 0.90, 0.35);
  vec3 leafC = h2rgb(hue + 0.02) * vec3(0.55, 1.05, 0.60);
  vec3 col   = mix(leafC, stemC, isStem);
  col *= 0.9 + 0.25 * smoothstep(0.6, 1.0, t);

  v_rgb = col;
  v_t = t;
}
`;

export const fs = `#version 300 es
precision highp float;
in vec3  v_rgb;
in float v_t;
in float v_camDist;
out vec4 outColor;

uniform float u_time;

uniform vec3  u_fogColor;
uniform float u_fogNear;
uniform float u_fogFar;

// faint animated "caustics"
float caustic(float x){ return 0.5 + 0.5*sin(x); }

void main(){
  float c = 0.10 * caustic(v_t*24.0 + u_time*2.0)
          + 0.05 * caustic(v_t*39.0 - u_time*1.8);
  vec3 col = v_rgb * (1.0 + c);
  // soft translucency at edges
  //float edge = smoothstep(0.98, 0.75, abs(2.0*v_t - 1.0));
  //col *= mix(0.95, 1.05, edge);

  float fog = smoothstep(u_fogNear, u_fogFar, v_camDist); // 0 near -> 1 far
  col = mix(col, u_fogColor, fog);
  
  outColor = vec4(col, 1.0);
}
`;
