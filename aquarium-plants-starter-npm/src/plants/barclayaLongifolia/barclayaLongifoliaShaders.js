export const vs = `#version 300 es
precision highp float;

// Unit ribbon (two verts per row); a_pos.x = ±0.5 "width", a_t = 0..1 along leaf
in vec2  a_pos;
in float a_t;
in vec2  a_uv;

// Per-leaf instance data
in vec2  i_baseXZ;       // base position on floor (x, z)
in vec2  i_lenWidth;     // (length, halfWidth)
in vec2  i_yawPitch;     // (yaw azimuth radians, pitch 0..1) 0=flat, 1=vertical
in vec2  i_curveUndul;   // (arch curvature, edge undulation amplitude)
in vec2  i_hueVar;       // (base hue tweak, redness 0..1)

uniform mat4  u_proj, u_view;
uniform float u_time;
uniform float u_currentStrength;
uniform vec2  u_currentDir;
uniform float u_undulFreq;   // edge ripple frequency
uniform vec3  u_fogColor;
uniform float u_fogNear, u_fogFar;

// What we send to the fragment shader
out vec3  v_baseColor;
out vec3  v_normalVS;
out vec3  v_posVS;
out vec2  v_leafCoord;   // (s along, w across)
out float v_seed;
out float v_camDist;

// Helpers
float hash21(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
vec3 h2rgb(float h){
  float r = abs(h*6.0 - 3.0) - 1.0;
  float g = 2.0 - abs(h*6.0 - 2.0);
  float b = 2.0 - abs(h*6.0 - 4.0);
  return clamp(vec3(r,g,b),0.0,1.0);
}

void main() {
  float t = clamp(a_t, 0.0, 1.0);

  // Build leaf frame
  float yaw   = i_yawPitch.x;
  float pitch = clamp(i_yawPitch.y, 0.0, 1.0);
  vec3 radial = vec3(cos(yaw), 0.0, sin(yaw));
  vec3 up     = vec3(0.0, 1.0, 0.0);
  vec3 tangent= normalize(mix(radial, up, pitch));        // axis along the leaf
  vec3 ref    = abs(dot(tangent, up)) > 0.95 ? vec3(1,0,0) : up;
  vec3 binorm = normalize(cross(tangent, ref));
  vec3 normal = normalize(cross(binorm, tangent));

  // Length & width profile (wide mid, narrow base/tip)
  float L = i_lenWidth.x;
  float W = i_lenWidth.y;
  float mid = pow(sin(3.14159265 * t), 0.8);              // 0 at ends, 1 mid
  float width = W * mid;

  // Ruffled margin: push opposite sides by an undulation
  float undulA = i_curveUndul.y;
  float undul  = undulA * sin(t * u_undulFreq + yaw*0.7);
  float side   = sign(a_pos.x);                     // -1 or +1

  // Arch the blade (gentle boat shape)
  float archA = i_curveUndul.x;
  float arch  = archA * sin(3.14159265 * t);

  // Gentle water sway, base anchored
  float seed    = hash21(i_baseXZ);
  float tipW    = smoothstep(0.10, 1.0, t);
  vec2  lat2    = (length(u_currentDir) < 1e-5)
                ? vec2(1.0, 0.0)
                : normalize(vec2(-u_currentDir.y, u_currentDir.x));
  vec3  lateral = vec3(lat2.x, 0.0, lat2.y);
  float speed   = 0.45 + 0.3*seed;
  float sway    = sin(u_time*speed + t*1.7 + seed*6.28) * 0.35 * u_currentStrength * tipW;
  float wobble  = 0.02 * sin(8.0*t + u_time*1.6 + seed*20.0) * tipW;

  vec3 base = vec3(i_baseXZ.x, 0.0, i_baseXZ.y);
  vec3 P    = base
            + tangent * (t * L)
            + normal  * (a_pos.x * width + side * undul)    // ribbon width + rippled edge
            + binorm  * arch                                 // slight "boat" cross-arch
            + lateral * (sway + wobble)                      // water sway
            + (u_currentDir.xxy).xzy * (0.02 * tipW * sin(t*2.2 + seed + u_time)); // tiny downstream drift

  // Fake a bit of cross-section curvature in the normal so lighting varies across width
  float w = a_pos.x * 2.0; // -1..1
  vec3 bentNormal = normalize(normal + binorm * w * 0.6);

  // Project to view space
  vec4 V = u_view * vec4(P,1.0);
  v_posVS   = V.xyz;
  v_camDist = length(V.xyz);
  v_normalVS = mat3(u_view) * bentNormal;  // normal in view space
  gl_Position = u_proj * V;

  // ----- Base leaf color (no veins/lighting yet) -----
  float redness = clamp(i_hueVar.y, 0.0, 1.0);              // 0=green, 1=magenta
  float hueG = 0.28 + i_hueVar.x*0.03;                      // olive green base
  float hueM = 0.92 + i_hueVar.x*0.02;                      // magenta tint
  vec3  cG = h2rgb(hueG) * vec3(0.75, 1.00, 0.70);
  vec3  cM = h2rgb(hueM) * vec3(1.05, 0.65, 0.85);
  v_baseColor = mix(cG, cM, redness);

  v_leafCoord = vec2(t, w); // (along, across)
  v_seed      = seed;
}
`;

export const fs = `#version 300 es
precision highp float;

in vec3  v_baseColor;
in vec3  v_normalVS;
in vec3  v_posVS;
in vec2  v_leafCoord;   // (s along, w across)
in float v_seed;
in float v_camDist;

out vec4 outColor;

uniform float u_time;
uniform vec3  u_fogColor;
uniform float u_fogNear, u_fogFar;

// faint caustics
float caustic(float x){ return 0.5 + 0.5*sin(x); }

void main(){
  float s = v_leafCoord.x;      // 0..1 along leaf
  float w = v_leafCoord.y;      // -1..1 across

  vec3 col = v_baseColor;

  // --- Shape-based shading (fake thickness) ---
  // darker at base, gently brighter at tip
  float alongShade  = mix(0.78, 1.12, s);
  // slightly brighter center, not too dark at edges
  float acrossShade = mix(1.08, 0.86, abs(w));
  col *= alongShade * acrossShade;

  // --- Veins: midrib + angled side veins ---
  float centerVein = exp(-pow(abs(w), 2.0));   // 1 at w=0, fades to edges

  float diag      = s * 9.0 + w * 3.0 + v_seed * 6.0;
  float sideRaw   = abs(sin(diag));
  float sideVeins = smoothstep(0.86, 0.98, sideRaw);
  sideVeins *= smoothstep(0.18, 0.88, s);
  sideVeins *= (1.0 - centerVein);

  float veinMask = clamp(0.65 * centerVein + 0.9 * sideVeins, 0.0, 1.0);

  // softer vein highlight so it’s not neon
  col = mix(col, col * vec3(1.15, 1.10, 1.05), veinMask * 0.85);

  // --- Lighting: directional + rim for dimension (toned down) ---
  vec3 N = normalize(v_normalVS);
  vec3 L = normalize(vec3(-0.3, 0.8, 0.25)); // light from above/side
  float diff = max(0.0, dot(N, L));

  vec3 V = normalize(-v_posVS);              // view direction in view space
  float rim = pow(1.0 - max(dot(N, V), 0.0), 2.0);

  float light = 0.35 + diff * 0.6 + rim * 0.35;
  col *= light;

  // --- Subtle mottling so it's not flat (also toned down) ---
  float mot = sin((s*9.0 + w*11.0 + v_seed*40.0) + u_time*0.7) * 0.5 + 0.5;
  col = mix(col * 0.98, col * 1.05, mot * 0.22);

  // --- Water caustics (weaker) ---
  float c = 0.06 * caustic(s*21.0 + u_time*1.8)
          + 0.03 * caustic(s*37.0 - u_time*1.4);
  col *= (1.0 + c);

  // --- Gentle tone mapping so super-bright pixels are pulled back ---
  float maxC = max(col.r, max(col.g, col.b));
  if (maxC > 1.0) {
    col /= (0.6 + maxC);  // compress highlights but keep mid-tones
  }

  // --- Fog ---
  float fog = smoothstep(u_fogNear, u_fogFar, v_camDist);
  col = mix(col, u_fogColor, fog);

  outColor = vec4(col, 1.0);
}
`;
