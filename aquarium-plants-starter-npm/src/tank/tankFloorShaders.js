
export const vs = `#version 300 es
  precision highp float;

  in vec2 a_xz;                 // grid position in tank space (x,z)

  uniform mat4  u_proj, u_view;
  uniform float u_time;
  uniform vec2  u_size;         // half-extents (xHalf, zHalf)
  uniform float u_amp;          // dune amplitude
  uniform float u_scale;        // noise frequency
  uniform vec3  u_sandA;        // colors
  uniform vec3  u_sandB;

  out vec3 v_color;
  out float v_camDist;

  // --- noise (value noise + fbm)
  float fract1(float x){ return x - floor(x); }
  float hash2(float i, float j){ return fract1(sin(i*127.1 + j*311.7)*43758.5453); }
  float vnoise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    float a = hash2(i.x, i.y);
    float b = hash2(i.x+1.0, i.y);
    float c = hash2(i.x, i.y+1.0);
    float d = hash2(i.x+1.0, i.y+1.0);
    vec2 u = f*f*(3.0-2.0*f);
    return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
  }
  float fbm(vec2 p){
    float f=0.0, a=0.5, fr=1.0;
    for(int k=0;k<4;k++){ f+=a*vnoise(p*fr); a*=0.5; fr*=2.0; }
    return f;
  }

  void main(){
    // world position on flat grid
    vec2 p = a_xz; // already in world tank space
    // dunes (biased slightly below y=0 so plants sit above)
    float h = (fbm(p * u_scale) - 0.5) * u_amp - 0.03;

    // finite diff for normal
    float e = 0.02;
    float hx = ((fbm((p+vec2(e,0.0))*u_scale) - fbm((p-vec2(e,0.0))*u_scale)) * u_amp) / (2.0*e);
    float hz = ((fbm((p+vec2(0.0,e))*u_scale) - fbm((p-vec2(0.0,e))*u_scale)) * u_amp) / (2.0*e);
    vec3 n = normalize(vec3(-hx, 1.0, -hz));

    vec3 world = vec3(p.x, h, p.y);

    // simple top light
    vec3 L = normalize(vec3(-0.2, 1.0, 0.3));
    float ndl = clamp(dot(n, L), 0.0, 1.0);
    vec3 sand = mix(u_sandA, u_sandB, 0.5 + 0.5*ndl);

    // slight color modulation from height
    sand *= 0.95 + 0.1 * smoothstep(-0.08, 0.06, h);

    v_color = sand;

    vec4 V = u_view * vec4(world, 1.0);
    v_camDist = length(V.xyz);

    gl_Position = u_proj * u_view * vec4(world, 1.0);
  }`;

  export const fs = `#version 300 es
  precision highp float;
  in vec3  v_color;
  in float v_camDist;
  out vec4 outColor;

  // fog
  uniform vec3  u_fogColor;
  uniform float u_fogNear;
  uniform float u_fogFar;

  void main(){
    float f = smoothstep(u_fogNear, u_fogFar, v_camDist); // 0 near -> 1 far
    vec3 col = mix(v_color, u_fogColor, f);
    outColor = vec4(col, 1.0);
  }`;