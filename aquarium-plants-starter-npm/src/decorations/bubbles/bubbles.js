// bubbles.js
import { vs, fs } from "./bubblesShaders.js";

const MAX_BUBBLES = 256;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(sh) || "bubble shader fail");
  }
  return sh;
}
function makeProgram(gl, vsSrc, fsSrc, bindings) {
  const p = gl.createProgram();
  const v = compile(gl, gl.VERTEX_SHADER, vsSrc);
  const f = compile(gl, gl.FRAGMENT_SHADER, fsSrc);
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  for (const [name, loc] of Object.entries(bindings)) {
    gl.bindAttribLocation(p, loc, name);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(p) || "bubble link fail");
  }
  gl.deleteShader(v);
  gl.deleteShader(f);
  return p;
}

// simple sphere for bubbles
function makeSphere(gl, stacks = 8, slices = 12) {
  const pos = [];
  const norm = [];
  const idx  = [];

  for (let i = 0; i <= stacks; i++) {
    const v = i / stacks;
    const theta = v * Math.PI;
    const y = Math.cos(theta);
    const r = Math.sin(theta);
    for (let j = 0; j <= slices; j++) {
      const u = j / slices;
      const phi = u * Math.PI * 2.0;
      const x = r * Math.cos(phi);
      const z = r * Math.sin(phi);
      pos.push(x, y, z);
      norm.push(x, y, z);
    }
  }

  for (let i = 0; i < stacks; i++) {
    for (let j = 0; j < slices; j++) {
      const a = i * (slices + 1) + j;
      const b = a + (slices + 1);
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  function vbuf(arr, loc, size) {
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    return b;
  }

  vbuf(pos, 0, 3);   // a_pos
  vbuf(norm, 1, 3);  // a_normal

  const ib = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
  gl.bufferData(
    gl.ELEMENT_ARRAY_BUFFER,
    new Uint16Array(idx),
    gl.STATIC_DRAW
  );

  return { vao, count: idx.length };
}

function makeInstBuffers(gl, max) {
  function mk(loc, comps) {
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, max * comps * 4, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, comps, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(loc, 1);
    return b;
  }
  return {
    offset: mk(2, 3), // i_offset
    radius: mk(3, 1), // i_radius
    count: 0,
    update(gl, offsets, radii, count) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.offset);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, offsets);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.radius);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, radii);
      this.count = count;
    },
  };
}

function rand(a, b) {
  return a + Math.random() * (b - a);
}

export function createBubbleLayer(gl) {
  const prog = makeProgram(gl, vs, fs, {
    a_pos: 0,
    a_normal: 1,
    i_offset: 2,
    i_radius: 3,
  });

  const sphere = makeSphere(gl);
  gl.bindVertexArray(sphere.vao);
  const inst = makeInstBuffers(gl, MAX_BUBBLES);

  const U = (n) => gl.getUniformLocation(prog, n);
  const u_proj = U("u_proj");
  const u_view = U("u_view");
  const u_time = U("u_time");
  const u_fogColor = U("u_fogColor");
  const u_fogNear = U("u_fogNear");
  const u_fogFar = U("u_fogFar");

  // bubble simulation state
  let bubbles = []; // {x,y,z, vy, radius, age, life}
  let lastTime = 0;

  function spawnBubble(x, y, z) {
    // reuse oldest if full
    if (bubbles.length >= MAX_BUBBLES) {
      bubbles.shift();
    }
    const radius = rand(0.01, 0.03);
    const life = rand(3.0, 6.0);
    const vy = rand(0.25, 0.55);

    bubbles.push({
      x,
      y,
      z,
      vy,
      radius,
      age: 0.0,
      life,
    });
  }

  function update(time) {
    const dt = Math.max(0, time - lastTime);
    lastTime = time;

    const next = [];
    for (let i = 0; i < bubbles.length; i++) {
      const b = bubbles[i];
      b.age += dt;
      b.y += b.vy * dt;

      // small gentle expansion as it rises
      b.radius *= 1.0 + 0.1 * dt;

      if (b.age < b.life && b.y < 1.8) {
        next.push(b);
      }
    }
    bubbles = next;
  }

  function draw(shared) {
    update(shared.time);
    if (bubbles.length === 0) return;

    // pack instance data
    const count = bubbles.length;
    const offsets = new Float32Array(count * 3);
    const radii = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const b = bubbles[i];
      const j = i * 3;
      offsets[j] = b.x;
      offsets[j + 1] = b.y;
      offsets[j + 2] = b.z;
      radii[i] = b.radius;
    }
    inst.update(gl, offsets, radii, count);

    gl.useProgram(prog);
    gl.bindVertexArray(sphere.vao);

    gl.uniformMatrix4fv(u_proj, false, shared.proj);
    gl.uniformMatrix4fv(u_view, false, shared.view);
    gl.uniform1f(u_time, shared.time);
    gl.uniform3f(
      u_fogColor,
      shared.fogColor[0],
      shared.fogColor[1],
      shared.fogColor[2]
    );
    gl.uniform1f(u_fogNear, shared.fogNear);
    gl.uniform1f(u_fogFar, shared.fogFar);

    gl.drawElementsInstanced(
      gl.TRIANGLES,
      sphere.count,
      gl.UNSIGNED_SHORT,
      0,
      inst.count
    );
  }

  return {
    draw,
    spawnBubble,
  };
}