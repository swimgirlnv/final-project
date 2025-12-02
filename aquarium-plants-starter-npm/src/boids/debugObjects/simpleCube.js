/*
* Function meant to test boids with directions
* repurposed for food pellets
*/

export function createSimpleCube(gl) {
    const VS = `#version 300 es
    layout(location=0) in vec3 a_pos;
    
    uniform mat4 u_view;
    uniform mat4 u_proj;
    uniform vec3 u_offset;
    uniform vec4 u_rot; // Using this for simple axis rotation if needed

    out vec3 v_pos;
    
    // Simple Axis Angle rotation matrix
    mat4 axisAngle(vec3 axis, float angle) {
        float s = sin(angle);
        float c = cos(angle);
        float oc = 1.0 - c;
        return mat4(oc * axis.x * axis.x + c,           oc * axis.x * axis.y - axis.z * s,  oc * axis.z * axis.x + axis.y * s,  0.0,
                    oc * axis.x * axis.y + axis.z * s,  oc * axis.y * axis.y + c,           oc * axis.y * axis.z - axis.x * s,  0.0,
                    oc * axis.z * axis.x - axis.y * s,  oc * axis.y * axis.z + axis.x * s,  oc * axis.z * axis.z + c,           0.0,
                    0.0,                                0.0,                                0.0,                                1.0);
    }
    
    void main() {
        vec3 pos = a_pos * 0.04; // Scale down for food pellet size
        v_pos = a_pos;
        
        // Apply rotation (u_rot.x = angle, u_rot.yzw = axis)
        if (u_rot.x != 0.0) {
             pos = (axisAngle(normalize(u_rot.yzw), u_rot.x) * vec4(pos, 1.0)).xyz;
        }

        pos += u_offset; // Move to world pos
        gl_Position = u_proj * u_view * vec4(pos, 1.0);
    }`;

    const FS = `#version 300 es
    precision highp float;
    out vec4 outColor;
    in vec3 v_pos;
    void main() {
        // Brownish food color
        outColor = vec4(0.6, 0.4, 0.2, 1.0);
    }`;

    // Compile Shader
    function createShader(gl, type, source) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
             console.error(gl.getShaderInfoLog(shader));
        return shader;
    }

    const vs = createShader(gl, gl.VERTEX_SHADER, VS);
    const fs = createShader(gl, gl.FRAGMENT_SHADER, FS);
    const prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);

    // Cube Data
    const verts = new Float32Array([
        -1,-1,1, 1,-1,1, 1,1,1, -1,1,1, -1,-1,-1, -1,1,-1, 1,1,-1, 1,-1,-1,
        -1,1,-1, -1,1,1, 1,1,1, 1,1,-1, -1,-1,-1, 1,-1,-1, 1,-1,1, -1,-1,1,
        1,-1,-1, 1,1,-1, 1,1,1, 1,-1,1, -1,-1,-1, -1,-1,1, -1,1,1, -1,1,-1
    ]);
    const indices = new Uint16Array([
        0,1,2, 0,2,3, 4,5,6, 4,6,7, 8,9,10, 8,10,11, 
        12,13,14, 12,14,15, 16,17,18, 16,18,19, 20,21,22, 20,22,23
    ]);

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    
    const vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    
    gl.bindVertexArray(null);

    // Locations
    const loc = {
        view: gl.getUniformLocation(prog, "u_view"),
        proj: gl.getUniformLocation(prog, "u_proj"),
        off: gl.getUniformLocation(prog, "u_offset"),
        rot: gl.getUniformLocation(prog, "u_rot")
    };

    return {
        draw(shared, pos, rot) {
            gl.useProgram(prog);
            gl.bindVertexArray(vao);
            gl.uniformMatrix4fv(loc.view, false, shared.view);
            gl.uniformMatrix4fv(loc.proj, false, shared.proj);
            
            gl.uniform3fv(loc.off, pos);
            // Default no rotation if not provided
            gl.uniform4fv(loc.rot, rot || [0.0, 0.0, 1.0, 0.0]); 
            
            gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
            gl.bindVertexArray(null);
        }
    };
}