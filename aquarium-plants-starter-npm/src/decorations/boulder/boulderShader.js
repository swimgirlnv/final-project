export const vs = `#version 300 es
precision highp float;

in vec3 a_pos;
in vec3 a_normal;
in vec2 a_uv;

in vec3 i_offset; // per-instance world offset
in float i_scale;
in float i_hue;

uniform mat4 u_proj;
uniform mat4 u_view;
uniform float u_time;

out vec3 v_normal;
out vec3 v_world;
out float v_hue;
out float v_camDist;

// cheap hash / value noise
float hash13(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7))) * 43758.5453123); }
float valueNoise(vec3 p){
	vec3 i = floor(p);
	vec3 f = fract(p);
	vec3 u = f*f*(3.0-2.0*f);
	float n000 = hash13(i + vec3(0.0,0.0,0.0));
	float n100 = hash13(i + vec3(1.0,0.0,0.0));
	float n010 = hash13(i + vec3(0.0,1.0,0.0));
	float n110 = hash13(i + vec3(1.0,1.0,0.0));
	float n001 = hash13(i + vec3(0.0,0.0,1.0));
	float n101 = hash13(i + vec3(1.0,0.0,1.0));
	float n011 = hash13(i + vec3(0.0,1.0,1.0));
	float n111 = hash13(i + vec3(1.0,1.0,1.0));
	float nx00 = mix(n000, n100, u.x);
	float nx10 = mix(n010, n110, u.x);
	float nx01 = mix(n001, n101, u.x);
	float nx11 = mix(n011, n111, u.x);
	float nxy0 = mix(nx00, nx10, u.y);
	float nxy1 = mix(nx01, nx11, u.y);
	return mix(nxy0, nxy1, u.z);
}
float fbm(vec3 p){
	float v = 0.0; float a = 0.5; float f = 1.0;
	for(int i=0;i<4;i++){
		v += a * valueNoise(p * f);
		f *= 2.0; a *= 0.5;
	}
	return v;
}

vec3 h2rgb(float h){
	float r = abs(h*6.0 - 3.0) - 1.0;
	float g = 2.0 - abs(h*6.0 - 2.0);
	float b = 2.0 - abs(h*6.0 - 4.0);
	return clamp(vec3(r,g,b),0.0,1.0) * 0.9;
}

void main(){
	// world-space base position of vertex on unit sphere
	vec3 worldPos = a_pos;
	// small animated displacement along normal using FBM
	float n = fbm(worldPos * 3.5 + vec3(i_offset.x*0.5, i_offset.y*0.5, i_offset.z*0.5) + u_time*0.05);
	float disp = (n - 0.5) * 0.25; // +/- displacement
	vec3 pos = (worldPos + a_normal * disp) * i_scale + i_offset;

	v_world = pos;
	v_normal = normalize(a_normal);
	v_hue = i_hue;

	vec4 V = u_view * vec4(pos, 1.0);
	v_camDist = length(V.xyz);
	gl_Position = u_proj * V;
}
`;

export const fs = `#version 300 es
precision highp float;

in vec3 v_normal;
in vec3 v_world;
in float v_hue;
in float v_camDist;
out vec4 outColor;

uniform vec3 u_lightDir;
uniform vec3 u_fogColor;
uniform float u_fogNear;
uniform float u_fogFar;
uniform float u_time;

vec3 h2rgb(float h){
	float r = abs(h*6.0 - 3.0) - 1.0;
	float g = 2.0 - abs(h*6.0 - 2.0);
	float b = 2.0 - abs(h*6.0 - 4.0);
	return clamp(vec3(r,g,b),0.0,1.0) * 0.9;
}

void main(){
	vec3 n = normalize(v_normal);
	vec3 L = normalize(u_lightDir);
	float lam = max(dot(n, L), 0.0) * 0.9 + 0.1;

	// subtle tint variation from world-space y
	float moss = smoothstep(-0.3, 0.6, v_world.y);

	vec3 base = h2rgb(v_hue) * mix(vec3(0.45,0.4,0.36), vec3(0.75,0.7,0.62), 0.6);
	base = mix(base, vec3(0.28,0.42,0.28), moss * 0.6);

	// small animated highlight
	float shine = 0.06 * sin(v_camDist*0.9 - u_time*2.0) + 0.02;
	vec3 col = base * (lam + shine);

	float fog = smoothstep(u_fogNear, u_fogFar, v_camDist);
	col = mix(col, u_fogColor, fog);

	outColor = vec4(col, 1.0);
}
`;
