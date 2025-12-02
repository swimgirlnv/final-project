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

out vec3 v_normal;
out vec3 v_world;
out vec3 v_local;   // rotated local space, used for patterns
out float v_part;
out float v_camDist;

void main() {
  vec3 p = a_pos;

  // --- little animations ------------------------------------------------
  if (a_part < 0.5) {
    // body/head bob
    float bob = 0.004 * sin(u_time * 3.0 + p.z * 10.0);
    p.y += bob;
  } else if (a_part < 1.5) {
    // legs/claws scuttle wiggle
    float phase = p.z * 18.0 + p.x * 9.0;
    float swing = 0.05 * sin(u_time * 10.0 + phase);
    float lift  = 0.015 * abs(sin(u_time * 12.0 + phase));
    p.z += swing;
    p.y += lift;

    // slightly stylize leg proportions
    p.x *= 1.2;
    p.y *= 0.8;
    p.z *= 0.85;
  } else {
    // shell subtle bob
    float bob = 0.003 * sin(u_time * 2.3);
    p.y += bob;

    // squash shell a bit to make it more cartoony
    p.y *= 0.9;
    p.z *= 1.05;
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
  vec3 bodyA  = vec3(1.00, 0.60, 0.50); // near shell
  vec3 bodyB  = vec3(1.00, 0.40, 0.33); // face/front
  vec3 legCol = vec3(0.93, 0.33, 0.32);

  vec3 shellBase   = vec3(0.99, 0.94, 0.87);
  vec3 shellStripe = vec3(0.97, 0.84, 0.72);

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
    float ao = clamp(0.40 + 0.60 * (v_local.y * 8.0 + 0.35), 0.2, 1.0);
    base *= ao;

    // blush on cheeks
    if (v_part < 0.5) {
      vec2 cheekL = v_local.xz - vec2(-0.045, 0.08);
      vec2 cheekR = v_local.xz - vec2( 0.045, 0.08);
      float r2 = 0.03 * 0.03;
      float cheekMask =
        smoothstep(r2, r2 * 0.4, dot(cheekL, cheekL)) +
        smoothstep(r2, r2 * 0.4, dot(cheekR, cheekR));
      vec3 cheekCol = vec3(1.0, 0.68, 0.68);
      base = mix(base, cheekCol, 0.55 * clamp(cheekMask, 0.0, 1.0));
    }

    // ------------------------------------------------------------
    // cartoon eyes?
    // ------------------------------------------------------------
    if (v_part < 0.5) {
      vec3 darkCol = vec3(0.05, 0.03, 0.03);

      // Eye centers in local xz (slightly popped forward)
      vec2 centerL = vec2(-0.040, 0.11);
      vec2 centerR = vec2( 0.040, 0.11);

      vec2 dL = v_local.xz - centerL;
      vec2 dR = v_local.xz - centerR;
      float rL = length(dL);
      float rR = length(dR);

      float rEye   = 0.028;  // white disc radius
      float rPupil = 0.012;  // black center
      float edge   = 0.004;

      // White sclera
      float scleraL = 1.0 - smoothstep(rEye, rEye + edge, rL);
      float scleraR = 1.0 - smoothstep(rEye, rEye + edge, rR);
      float scleraMask = clamp(scleraL + scleraR, 0.0, 1.0);
      vec3 scleraCol = vec3(1.0);
      base = mix(base, scleraCol, scleraMask);

      // Black pupil (centered like the fish)
      float pupilL = 1.0 - smoothstep(rPupil, rPupil + edge * 0.7, rL);
      float pupilR = 1.0 - smoothstep(rPupil, rPupil + edge * 0.7, rR);
      float pupilMask = clamp(pupilL + pupilR, 0.0, 1.0);
      vec3 pupilCol = vec3(0.0, 0.0, 0.0);
      base = mix(base, pupilCol, pupilMask);

      // Tiny white highlight near upper-left of each eye
      vec2 hiL = dL - vec2(-0.006, 0.006);
      vec2 hiR = dR - vec2(-0.006, 0.006);
      float rHi = 0.006;
      float hiMask =
        (1.0 - smoothstep(rHi, rHi + 0.003, length(hiL))) +
        (1.0 - smoothstep(rHi, rHi + 0.003, length(hiR)));
      hiMask = clamp(hiMask, 0.0, 1.0) * (1.0 - pupilMask); // stay on sclera
      base = mix(base, vec3(1.0), 0.8 * hiMask);

      // Simple smile arc under the eyes
      vec2 mouthP = v_local.xz - vec2(0.0, 0.06);
      float rM = length(mouthP);
      float smile = smoothstep(0.055, 0.045, rM) * step(mouthP.y, 0.0);
      base = mix(base, darkCol, 0.6 * smile);
    }
  }

  // -------------------------------------------------------
  // Shell pattern
  // -------------------------------------------------------
  if (v_part > 1.5) {
    float r   = length(v_local.xz);
    float ang = atan(v_local.z, v_local.x); // -pi..pi

    float spiral = 0.5 + 0.5 * sin(ang * 5.5 + r * 32.0);
    float rings  = 0.5 + 0.5 * sin(r * 40.0);

    float swirl = mix(spiral, rings, 0.45);
    vec3 lightCol = shellStripe * 1.10;
    vec3 darkCol  = shellBase * 0.78;
    base = mix(darkCol, lightCol, swirl);

    // darker where shell meets body
    float neck = smoothstep(-0.02, 0.10, v_local.z + 0.02);
    base *= mix(0.6, 1.0, neck);
  }

  // -------------------------------------------------------
  // Lighting: lambert + rim + soft spec
  // -------------------------------------------------------
  float rim = pow(1.0 - max(dot(n, V), 0.0), 2.4);

  vec3 col = base * (0.27 + 0.95 * lam) + rim * 0.40;

  float shininess = (v_part > 1.5) ? 46.0 : 24.0;
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