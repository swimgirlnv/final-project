// plants/barclayaLongifoliaShaders.js
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

out vec3  v_rgb;
out float v_camDist;
out float v_t;

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
  float mid = pow(sin(3.14159265 * clamp(t, 0.0, 1.0)), 0.8);  // 0 at ends, 1 mid
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

  // Assemble world position
  vec3 base = vec3(i_baseXZ.x, 0.0, i_baseXZ.y);   // floor at y≈0 in your scene
  vec3 P    = base
            + tangent * (t * L)
            + normal  * (a_pos.x * width + side * undul)    // ribbon width + rippled edge
            + binorm  * arch                                 // slight "boat" cross-arch
            + lateral * (sway + wobble)                      // water sway
            + (u_currentDir.xxy).xzy * (0.02 * tipW * sin(t*2.2 + seed + u_time)); // tiny downstream drift

  // Project
  vec4 V = u_view * vec4(P,1.0);
  v_camDist = length(V.xyz);
  gl_Position = u_proj * V;

  // --- Color (green↔magenta variation + vein highlight + mottling)
  float redness = clamp(i_hueVar.y, 0.0, 1.0);              // 0=green, 1=magenta
  float hueG = 0.28 + i_hueVar.x*0.03;                      // olive green base
  float hueM = 0.92 + i_hueVar.x*0.02;                      // magenta tint
  vec3  cG = h2rgb(hueG) * vec3(0.75, 1.00, 0.70);
  vec3  cM = h2rgb(hueM) * vec3(1.05, 0.65, 0.85);
  vec3  baseCol = mix(cG, cM, redness);

  // slightly lighter tip and center vein
  float vein = exp(-pow((abs(a_pos.x)*2.0), 2.5));          // gaussian across width
  vec3  tipCol = baseCol * (0.9 + 0.25*smoothstep(0.5,1.0,t));
  vec3  withVein = mix(tipCol, tipCol*vec3(1.12,1.12,1.00), 0.18*vein);

  // subtle mottling (cheap noise)
  float mot = sin( (t*10.0 + a_pos.x*14.0 + seed*50.0) ) * 0.5 + 0.5;
  v_rgb = mix(withVein*0.95, withVein*1.08, mot*0.15);

  v_t = t;
}
`;

export const fs = `#version 300 es
precision highp float;

in vec3  v_rgb;
in float v_camDist;
in float v_t;
out vec4 outColor;

uniform float u_time;
uniform vec3  u_fogColor;
uniform float u_fogNear, u_fogFar;

// faint caustics
float caustic(float x){ return 0.5 + 0.5*sin(x); }

void main(){
  float c = 0.10 * caustic(v_t*21.0 + u_time*1.8)
          + 0.05 * caustic(v_t*37.0 - u_time*1.4);
  vec3 col = v_rgb * (1.0 + c);

  float fog = smoothstep(u_fogNear, u_fogFar, v_camDist);
  col = mix(col, u_fogColor, fog);

  outColor = vec4(col, 1.0);
}
`;