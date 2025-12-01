// bubbleShaders.js

export const vs = `#version 300 es
precision highp float;

in vec3 a_pos;      // unit sphere vertex
in vec3 a_normal;   // unit sphere normal

in vec3 i_offset;   // bubble center (world space)
in float i_radius;  // bubble radius

uniform mat4 u_proj;
uniform mat4 u_view;
uniform float u_time;

out vec3 v_normal;
out vec3 v_world;
out float v_camDist;

void main() {
  // tiny breathing wobble so bubbles don’t feel perfectly rigid
  float wobble = 0.04 * sin(u_time * 2.2 + dot(a_pos, vec3(4.0, 3.0, 5.0)));
  vec3 p = a_pos * (i_radius * (1.0 + wobble));

  vec3 world = i_offset + p;
  v_world = world;

  // unit sphere normal
  v_normal = normalize(a_normal);

  vec4 V = u_view * vec4(world, 1.0);
  v_camDist = length(V.xyz);
  gl_Position = u_proj * V;
}
`;

export const fs = `#version 300 es
precision highp float;

in vec3 v_normal;
in vec3 v_world;
in float v_camDist;
out vec4 outColor;

uniform vec3  u_fogColor;
uniform float u_fogNear;
uniform float u_fogFar;
uniform float u_time;

vec3 h2rgb(float h){
  float r = abs(h*6.0 - 3.0) - 1.0;
  float g = 2.0 - abs(h*6.0 - 2.0);
  float b = 2.0 - abs(h*6.0 - 4.0);
  return clamp(vec3(r,g,b),0.0,1.0);
}

void main() {
  vec3 n = normalize(v_normal);

  // approximate view direction from tank center
  vec3 V = normalize(-v_world);

  // light from above / front
  vec3 L = normalize(vec3(0.3, 1.0, 0.2));
  float NdotL = max(dot(n, L), 0.0);

  // Fresnel rim: bright edges, dimmer center
  float NdotV = max(dot(n, V), 0.0);
  float fresnel = pow(1.0 - NdotV, 3.0);

  // specular sparkle
  vec3 R = reflect(-L, n);
  float spec = pow(max(dot(R, V), 0.0), 28.0);

  // fake environment: top of bubble sees "sky", bottom sees "deep water"
  vec3 sky   = vec3(0.86, 0.96, 1.08);
  vec3 water = u_fogColor * vec3(0.9, 1.05, 1.1);
  float up   = clamp(n.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 env   = mix(water, sky, up);

  // thin-film interference tint along rim
  float filmPhase = NdotV * 1.3
                  + sin(v_world.y * 3.1 + u_time * 1.4) * 0.12
                  + cos(v_world.x * 2.7 - u_time * 0.9) * 0.08;
  float filmHue = fract(0.55 + filmPhase * 0.15);   // blue-violet range
  vec3 filmCol = h2rgb(filmHue);

  // core vs rim
  vec3 coreCol = mix(env * 0.6, water * 0.9, 0.6);  // slightly darker middle
  vec3 rimCol  = mix(env, filmCol, 0.7);            // colorful edge

  vec3 col = mix(coreCol, rimCol, fresnel);

  // lighting: a bit of diffuse + Fresnel + spec highlight
  float light = 0.25 + 0.55 * NdotL + 0.35 * fresnel;
  col *= light;
  col += vec3(1.0, 1.0, 0.95) * spec * 1.6;

  // slight depth tint (deeper → cooler)
  float depthT = clamp(v_world.y * 0.9 + 0.4, 0.0, 1.0);
  vec3 deepTint = vec3(0.78, 0.90, 1.05);
  col = mix(deepTint, col, depthT);

  // fog to match scene
  float fog = smoothstep(u_fogNear, u_fogFar, v_camDist);
  col = mix(col, u_fogColor, fog);

  // keep alpha = 1.0 so it works even if blending is off.
  // If you turn on blending for bubbles, you can try alpha = mix(0.35, 0.9, fresnel)
  outColor = vec4(col, 1.0);
}
`;