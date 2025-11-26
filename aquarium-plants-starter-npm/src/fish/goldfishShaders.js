export const vs = `#version 300 es
precision highp float;

// attributes
in vec3 vs_Pos;
in vec3 vs_Col;
in int vs_Label;
in vec3 vs_Pivot;

// Uniforms
uniform mat4 u_proj;
uniform mat4 u_view;
uniform float u_time;
uniform vec2  u_res;         // viewport size


// Varyings
out vec3 v_pos;
out vec3 v_color;
out float v_camDist;
flat out int v_label;
out vec3 v_pivot;

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

mat3 eulerRotate(vec3 angles) {
    float cx = cos(angles.x); float sx = sin(angles.x);
    float cy = cos(angles.y); float sy = sin(angles.y);
    float cz = cos(angles.z); float sz = sin(angles.z);

    return mat3(
        // Column 1
        cy * cz, 
        cy * sz, 
        -sy,
        // Column 2
        sx * sy * cz - cx * sz, 
        sx * sy * sz + cx * cz, 
        sx * cy,
        // Column 3
        cx * sy * cz + sx * sz, 
        cx * sy * sz - sx * cz, 
        cx * cy
    );
}

vec3 rotateAroundPivot(vec3 pos, vec3 pivot, mat3 rot) {
  return ((pos - pivot) * rot) + pivot;
}

void main() {
  // just pass defined color to frag shader for now
  v_color = vs_Col;
  vec3 animatePos = vs_Pos;
  // pectoral anim
  if (vs_Label == 6) 
  {
    float side = sign(vs_Pos.x);
    animatePos = rotateAroundPivot(animatePos, vs_Pivot, eulerRotate(vec3(0.0, sin(u_time + -1.0) * 0.5 * side, sin(u_time) * 0.2 * side)));
  }
  // pelvic
  else if (vs_Label == 1)
  {
    float side = sign(vs_Pos.x);
    animatePos = rotateAroundPivot(animatePos, vs_Pivot, eulerRotate(vec3(sin(u_time) * 0.5 + 0.5, sin(u_time) * 0.1 * side, sin(u_time + 0.7) * 0.5 * side + 0.1 * side)));
  }
  // caudal
  else if (vs_Label == 7)
  {
    animatePos = rotateAroundPivot(animatePos, vs_Pivot, eulerRotate(vec3(0.0, sin(u_time) * 0.1, 0.0)));
  }
  // mouth
  else if (vs_Label == 4)
  {
    float scaleVal = ((sin(u_time * 1.7) + 1.0) / 2.0) + 0.35;
    animatePos = ((vs_Pos - vs_Pivot) * scaleVal) + vs_Pivot;
  }
  vec3 wavePos = vec3(animatePos.x + (sin(3.0 * (u_time + animatePos.z)) * 0.04), animatePos.y, animatePos.z);

  vec4 V = u_view * vec4(wavePos, 1.0);
  v_camDist = length(V.xyz);
  vec4 world = u_proj * V;

  // Project
  v_pos = vs_Pos;
  gl_Position = world + vec4(0.0, 1.0, 0.0, 0.0);
  v_label = vs_Label;
  v_pivot = vs_Pivot;
}`;

export const fs = `#version 300 es
precision highp float;

in vec3 v_pos;
in vec3 v_color;
in float v_camDist;
flat in int v_label;
in vec3 v_pivot;
out vec4 outColor;

uniform float u_time;
uniform vec3  u_fogColor;
uniform float u_fogNear;
uniform float u_fogFar;

float random (in vec3 _st) {
    return fract(sin(dot(_st.xyz,
                         vec3(12.9898,78.233,53.026)))*
        43758.5453123);
}

// This noise function is featured
// in the book of shaders section on Fractal Brownian Motion,
// but from shadertoy (https://www.shadertoy.com/view/4dS3Wd)
// I am going to add explanations for future use/tweaking, and
// modify this for 3D noise
float noise (in vec3 _st) {

    // Creating grid from points (similar to voronoi setup)
    vec3 i = floor(_st);
    // also getting fractional component for interpolation
    vec3 fc = fract(_st);

    float a = random(i);
    float b = random(i + vec3(1.0, 0.0, 0.0));
    float c = random(i + vec3(1.0, 1.0, 0.0));
    float d = random(i + vec3(0.0, 1.0, 0.0));
    float e = random(i + vec3(1.0, 1.0, 1.0));
    float f = random(i + vec3(1.0, 0.0, 1.0));
    float g = random(i + vec3(0.0, 1.0, 1.0));
    float h = random(i + vec3(0.0, 0.0, 1.0));

    // These are interpolation terms for smoothing
    // ( discussed 9/8/2025 in class)
    vec3 u = fc * fc * (3.0 - 2.0 * fc);

    // 3D interpolation using the smoothed factor from before.
    // This can probably be vastly simplified similar to the 2D
    // version of the function

    return mix(
        mix(
            mix(a, b, u.x),     // segment 1
            mix(d, c, u.x),     // segment 2
            u.y
        ),                      // plane 1 (bottom)
        mix(
            mix(h, f, u.x),     // segment 3
            mix(g, e, u.x),     // segment 4
            u.y
        ),                      // plane 2
        u.z
    );
}

#define NUM_OCTAVES 5

// This is also from book of shaders,
// and is the FBM implementation.
// I changed it so that it works in three
// dimensions, but the 2D one is here: https://thebookofshaders.com/13/
float fbm ( in vec3 _st) {
    float v = 0.0;                      // final output
    float a = 0.5;                      // amplitude of wave
    vec3 shift = vec3(100.0);           // offset for wave

    mat3 rot = mat3(
        1., 0., 0.,
        0., cos(0.5), sin(0.5),
        0., -sin(0.5), cos(0.50)
    );

    for (int i = 0; i < NUM_OCTAVES; ++i) {
        v += a * noise(_st);

        // "2.0" is the lacunarity, or the factor by which frequency is multiplied each octave
        _st = rot * _st * 2.0 + shift; 

        // Gain (factor by which amplitude is multiplied each octave)
        a *= 0.5;
    }
    return v;
}

// Based off of a blender node network that tiled better in 2D
float fish_scale(vec3 pos) {
  vec3 gridVal1 = (fract(pos) - vec3(0.5, 0.5, 0.5)) * 2.0;
  vec3 gridVal2 = (fract(pos + vec3(0.5, 0.5, 0.5)) - vec3(0.5, 0.5, 0.5)) * 2.0;

  float zMixFactor = 1.0 - smoothstep(0.0, 0.0, gridVal1.z);

  float len1 = smoothstep(0.9, 1.0, clamp(length(gridVal1), 0.0, 1.0));
  float len2 = smoothstep(0.9, 1.0, clamp(length(gridVal2), 0.0, 1.0));

  float gridSphere1 = len1 < 1.0? 0.0 : 1.0;
  float gridSphere2 = len2 < 1.0? 0.0 : 1.0;

  float sphereMix1 = mix(len1, len2, gridSphere1);
  float sphereMix2 = mix(len2, len1, gridSphere2);

  float sphereMix3 = mix(sphereMix1, len1, zMixFactor);
  float sphereMix4 = mix(len2, sphereMix2, zMixFactor);

  float finalMix = mix(sphereMix3, sphereMix4, zMixFactor);

  return 1.0 - finalMix;
}

// Simple caustics look via animated stripes
float caustic(float x){
  return 0.5 + 0.5*sin(x);
}

vec3 palette( in float t, in vec3 a, in vec3 b, in vec3 c, in vec3 d )
{
    return a + b*cos( 6.283185*(c*t+d) );
}

void main() {
  vec3 newCol = vec3(1.0);

  float fog = smoothstep(u_fogNear, u_fogFar, v_camDist); // 0 near -> 1 far
  vec3 col = mix(newCol, u_fogColor, fog);
  outColor = vec4(col, 1.0);
  // Head and Body
  if (v_label == 0 || v_label == 2) 
  {
    vec3 scaledPos = vec3(v_pos.x + 1.2, v_pos.y + 1.3, v_pos.z * 2.0);
    float fishScale = fish_scale(scaledPos * 10.0);
    float noisy = fbm(v_pos * 10.0);
    
    vec3 localDir = normalize(v_pos - v_pivot);
    vec3 lookDir = vec3(0.0, 1.0, 0.0);

    float alignment = clamp(dot(localDir, lookDir), 0.0, 1.0);
    float noiseMask = mix(0.0, noisy, alignment);

    float noisyFishScale = mix(fishScale, 1.0 - fishScale, noisy);
    outColor = vec4(vec3(noisyFishScale), 1.0);
  }
  // Fins (pelvic, caudal)
  else if (v_label == 1 || v_label == 7) 
  {
    vec3 finDir = v_pos - v_pivot;

    float angle = 0.0;
    
    if (abs(v_pivot.x) > 0.1) {
      angle = atan(finDir.x, finDir.z); 
    } 
    // Otherwise, it's a center fin (Tail/Dorsal/Anal)
    // We calculate the angle on the Y/Z plane (Vertical spread)
    else {
        angle = atan(finDir.y, finDir.z);
    }

    float freq = 40.0; 
    
    float pattern = 0.5 + 0.5 * sin(angle * freq);

    pattern = smoothstep(0.4, 0.6, pattern);
    
    float distFromPivot = length(finDir);
    float fade = smoothstep(0.2, 0.3, distFromPivot); // 0 at pivot, 1 further out
    
    // Mix the pattern based on distance
    float finalMix = pattern * fade;

    outColor = vec4(mix(vec3(1.0), vec3(0.0), finalMix), 1.0);
  }
  // Eyes
  else if (v_label == 3)
  {
    vec3 localDir = normalize(v_pos - v_pivot);

    float side = sign(v_pivot.x);

    vec3 lookDir = normalize(vec3(side * 1.0 + sin(u_time * 0.4) * 0.5, -0.1, -0.8));

    float alignment = dot(localDir, lookDir);

    float pupilSize = 0.96; // Higher number = smaller pupil
    float pupilMask = smoothstep(pupilSize, pupilSize + 0.01, alignment);
    
    vec3 scleraColor = vec3(0.95);
    vec3 pupilColor = vec3(0.05);

    vec3 finalEye = mix(scleraColor, pupilColor, pupilMask);

    outColor = vec4(finalEye, 1.0);
  }
  // Fins cont. (dorsal and anal)
  else if (v_label == 5)
  {
    float side = sign(v_pivot.y);
    float stripes = sin(v_pos.z * 80.0) * 2.0;
    float fade = smoothstep(0.6, 1.0, mix(0.0, stripes, v_pos.y * side));
    outColor = vec4(vec3(mix(1.0, 0.0, fade)), 1.0);
  }
    // Fins cont. (pectoral)
  else if (v_label == 6)
  {
    vec3 finDir = v_pos - v_pivot;

    float angle = atan(finDir.x, finDir.y);

    float freq = 40.0; 
    
    float pattern = 0.5 + 0.5 * sin(angle * freq);

    pattern = smoothstep(0.4, 0.6, pattern);
    
    float distFromPivot = length(finDir);
    float fade = smoothstep(0.2, 0.3, distFromPivot); // 0 at pivot, 1 further out
    
    // Mix the pattern based on distance
    float finalMix = pattern * fade;

    outColor = vec4(mix(vec3(1.0), vec3(0.0), finalMix), 1.0);
  }
  else
  {
    outColor = vec4(0.0, 0.0, 0.0, 1.0);
  }

  if (v_label != 3) {
    // apply color palette  
    outColor = vec4(
      palette(
        outColor.r, 
        vec3(0.5), 
        vec3(0.5), 
        vec3(1.0, 1.0, 1.0), 
        vec3(0.0, 0.33, 0.67)
      ), 
      1.0
    );
  }
}
`;