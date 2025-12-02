// critters/crab/crabShaders.js

export const vs = `#version 300 es
precision highp float;

in vec3 a_pos;
in vec3 a_normal;
in float a_part;   // 0 = body/head, 1 = legs+claws, 2 = shell

uniform mat4 u_proj;
uniform mat4 u_view;
uniform vec3 u_worldPos;
uniform float u_angle;
uniform float u_time;
uniform float u_moveAmount; // 0 = idle, 1 = full scuttle

out vec3 v_normal;
out vec3 v_world;
out vec3 v_local;   // rotated local space, used for patterns
out float v_part;
out float v_camDist;

void main() {
  vec3 p = a_pos;

  float move = clamp(u_moveAmount, 0.0, 1.0);

  // --- little animations ------------------------------------------------
  if (a_part < 0.5) {
    // body/head bob – stronger while moving
    float freq = mix(2.0, 4.2, move);
    float amp  = mix(0.002, 0.005, move);
    float bob = amp * sin(u_time * freq + p.z * 10.0);
    p.y += bob;
  } else if (a_part < 1.5) {
    // legs/claws scuttle wiggle
    float phase = p.z * 18.0 + p.x * 9.0;
    float swingAmp = mix(0.015, 0.06, move);
    float liftAmp  = mix(0.003, 0.018, move);
    float swing = swingAmp * sin(u_time * 10.0 + phase);
    float lift  = liftAmp  * abs(sin(u_time * 12.0 + phase));
    p.z += swing;
    p.y += lift;

    // slightly stylize leg proportions
    p.x *= 1.2;
    p.y *= 0.8;
    p.z *= 0.85;
  } else {
    // shell subtle bob, more pronounced when scuttling
    float freq = mix(1.8, 3.4, move);
    float amp  = mix(0.0015, 0.004, move);
    float bob = amp * sin(u_time * freq);
    p.y += bob;

    // squash shell a bit to make it more cartoony
    p.y *= 0.9;
    p.z *= 1.05;
  }

  // slight body lean when moving
  if (move > 0.0) {
    float lean = 0.10 * move;
    // rotate around X in object space for a tiny forward lean
    float cy = cos(lean);
    float sy = sin(lean);
    p = vec3(
      p.x,
      cy * p.y - sy * p.z,
      sy * p.y + cy * p.z
    );
  }

  // --- rotate + translate -----------------------------------------------
  float c = cos(u_angle);
  float s = sin(u_angle);
  mat3 R = mat3(
    c,   0.0, -s,
    0.0, 1.0, 0.0,
    s,   0.0,  c
  );

  vec3 local = R * p;
  vec3 world = u_worldPos + local;

  v_world  = world;
  v_local  = local;
  v_normal = normalize(R * a_normal);
  v_part   = a_part;

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
in float v_part;
in float v_camDist;

out vec4 outColor;

uniform vec3 u_fogColor;
uniform float u_fogNear;
uniform float u_fogFar;

// tiny hash
float hash12(vec2 p){
  return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453);
}

void main() {
  vec3 n = normalize(v_normal);
  vec3 L = normalize(vec3(-0.4, 0.9, 0.25));
  vec3 V = normalize(-v_world);
  float lam = max(dot(n, L), 0.0);

  // -------------------------------------------------------
  // Palette
  // -------------------------------------------------------
  // body/head gradient (front more saturated)
  vec3 bodyA  = vec3(1.00, 0.58, 0.46); // near shell
  vec3 bodyB  = vec3(1.00, 0.40, 0.32); // face/front
  vec3 legCol = vec3(0.93, 0.33, 0.32);
  vec3 shellBase   = vec3(0.98, 0.93, 0.85);
  vec3 shellStripe = vec3(0.96, 0.82, 0.70);

  // map local z (roughly -shell → +face) to 0..1
  float tBody = clamp((v_local.z - 0.02) / 0.20, 0.0, 1.0);
  vec3 bodyCol = mix(bodyA, bodyB, tBody);

  vec3 base;
  if (v_part < 0.5) {
    base = bodyCol;
  } else if (v_part < 1.5) {
    base = legCol;
  } else {
    base = shellBase;
  }

  // -------------------------------------------------------
  // Body / legs details
  // -------------------------------------------------------
  if (v_part < 1.5) {
    // speckled freckles
    float speck = hash12(v_local.xz * 18.3);
    float speckMask = step(0.88, speck);
    base *= (1.0 - 0.14 * speckMask);

    // darken underside (fake AO)
    float ao = clamp(0.35 + 0.65 * (v_local.y * 8.0 + 0.4), 0.2, 1.0);
    base *= ao;

    // front "cheeks"
    if (v_part < 0.5) {
      vec2 cheekL = v_local.xz - vec2(-0.045, 0.08);
      vec2 cheekR = v_local.xz - vec2( 0.045, 0.08);
      float r2 = 0.03 * 0.03;
      float cheekMask =
        smoothstep(r2, r2 * 0.4, dot(cheekL, cheekL)) +
        smoothstep(r2, r2 * 0.4, dot(cheekR, cheekR));
      vec3 cheekCol = vec3(1.0, 0.65, 0.65);
      base = mix(base, cheekCol, 0.6 * clamp(cheekMask, 0.0, 1.0));
    }

    // simple eyes + smile on the head (front hemisphere)
    if (v_part < 0.5) {
      vec3 eyeTint = vec3(0.08, 0.04, 0.04);

      // eyes in local xz
      vec2 eyeL = v_local.xz - vec2(-0.035, 0.11);
      vec2 eyeR = v_local.xz - vec2( 0.035, 0.11);
      float eyeR2 = 0.018 * 0.018;
      float eyeMask =
        step(dot(eyeL, eyeL), eyeR2) +
        step(dot(eyeR, eyeR), eyeR2);

      base = mix(base, eyeTint, clamp(eyeMask, 0.0, 1.0));

      // tiny highlight in each eye
      vec2 hiL = eyeL - vec2(-0.004, 0.004);
      vec2 hiR = eyeR - vec2(-0.004, 0.004);
      float hiR2 = 0.007 * 0.007;
      float hiMask =
        step(dot(hiL, hiL), hiR2) +
        step(dot(hiR, hiR), hiR2);
      vec3 hiCol = vec3(1.0);
      base = mix(base, hiCol, 0.7 * clamp(hiMask, 0.0, 1.0));

      // smile arc
      vec2 mouthP = v_local.xz - vec2(0.0, 0.06);
      float r = length(mouthP);
      float smile = smoothstep(0.055, 0.045, r) * step(mouthP.y, 0.0);
      base = mix(base, eyeTint, 0.6 * smile);
    }
  }

  // -------------------------------------------------------
  // Shell pattern – creamy spiral bands
  // -------------------------------------------------------
  if (v_part > 1.5) {
    float r   = length(v_local.xz);
    float ang = atan(v_local.z, v_local.x); // -pi..pi

    // spiral + ring mix
    float spiral = 0.5 + 0.5 * sin(ang * 5.5 + r * 30.0);
    float rings  = 0.5 + 0.5 * sin(r * 42.0);

    float swirl = mix(spiral, rings, 0.45);
    vec3 lightCol = shellStripe * 1.05;
    vec3 darkCol  = shellBase * 0.75;
    base = mix(darkCol, lightCol, swirl);

    // darker where shell meets body
    float neck = smoothstep(-0.02, 0.10, v_local.z + 0.02);
    base *= mix(0.6, 1.0, neck);
  }

  // -------------------------------------------------------
  // Lighting: lambert + rim + soft spec
  // -------------------------------------------------------
  float rim = pow(1.0 - max(dot(n, V), 0.0), 2.4);

  // base diffuse + rim
  vec3 col = base * (0.27 + 0.95 * lam) + rim * 0.40;

  // specular: slightly stronger on shell
  float shininess = (v_part > 1.5) ? 42.0 : 24.0;
  vec3 H = normalize(L + V);
  float spec = pow(max(dot(n, H), 0.0), shininess);
  vec3 specTint = (v_part > 1.5) ? shellStripe : vec3(1.0);
  col += specTint * spec * 0.45;

  // -------------------------------------------------------
  // Fog
  // -------------------------------------------------------
  float fog = smoothstep(u_fogNear, u_fogFar, v_camDist);
  col = mix(col, u_fogColor, fog);

  outColor = vec4(col, 1.0);
}
`;