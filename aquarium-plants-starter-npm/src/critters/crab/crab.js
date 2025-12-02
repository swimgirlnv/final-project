// critters/crab/crab.js
import { vs, fs } from "./crabShaders.js";
import { TANK_X_HALF, TANK_Z_HALF } from "../../tank/tankFloor.js";
import { checkCollision2D } from "../../sceneCollision.js";

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(sh) || "crab shader fail");
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
    throw new Error(gl.getProgramInfoLog(p) || "crab link fail");
  }
  gl.deleteShader(v);
  gl.deleteShader(f);
  return p;
}

function normalize3(v) {
  const len = Math.hypot(v[0], v[1], v[2]) || 1.0;
  return [v[0] / len, v[1] / len, v[2] / len];
}

// Append a low-res sphere into a shared mesh
function appendSphere(
  pos,
  norm,
  part,
  idx,
  center,
  radius,
  partId,
  stacks,
  slices
) {
  const baseIndex = pos.length / 3;

  for (let i = 0; i <= stacks; i++) {
    const v = i / stacks;
    const theta = v * Math.PI;
    const sy = Math.cos(theta);
    const sr = Math.sin(theta);

    for (let j = 0; j <= slices; j++) {
      const u = j / slices;
      const phi = u * Math.PI * 2.0;
      const sx = sr * Math.cos(phi);
      const sz = sr * Math.sin(phi);

      const nx = sx;
      const ny = sy;
      const nz = sz;

      pos.push(
        center[0] + radius * sx,
        center[1] + radius * sy,
        center[2] + radius * sz
      );
      norm.push(...normalize3([nx, ny, nz]));
      part.push(partId);
    }
  }

  const stride = slices + 1;
  for (let i = 0; i < stacks; i++) {
    for (let j = 0; j < slices; j++) {
      const a = baseIndex + i * stride + j;
      const b = a + stride;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
}

function makeHermitCrabMesh(gl) {
  const pos = [];
  const norm = [];
  const part = [];
  const idx = [];

  // Body/head sits in front of shell (part 0)
  appendSphere(
    pos,
    norm,
    part,
    idx,
    [0.0, 0.035, 0.08],
    0.07,
    0.0,
    10,
    16
  );

  // Legs & claws (part 1)
  const legY = 0.015;
  const legR = 0.03;
  const legZ = [0.05, 0.09, 0.13];
  for (let i = 0; i < legZ.length; i++) {
    const z = 0.06 + legZ[i];
    appendSphere(pos, norm, part, idx, [-0.06, legY, z], legR, 1.0, 6, 10); // left
    appendSphere(pos, norm, part, idx, [ 0.06, legY, z], legR, 1.0, 6, 10); // right
  }

  // Claws slightly bigger in very front
  appendSphere(pos, norm, part, idx, [-0.055, 0.025, 0.19], 0.04, 1.0, 8, 12);
  appendSphere(pos, norm, part, idx, [ 0.055, 0.025, 0.19], 0.04, 1.0, 8, 12);

  // Shell: stack of spheres behind body (part 2)
  appendSphere(pos, norm, part, idx, [0.0, 0.055, -0.02], 0.11, 2.0, 10, 16);
  appendSphere(pos, norm, part, idx, [0.0, 0.07,  -0.10], 0.09, 2.0, 10, 16);
  appendSphere(pos, norm, part, idx, [0.0, 0.085, -0.18], 0.07, 2.0, 10, 16);
  appendSphere(pos, norm, part, idx, [0.0, 0.095, -0.24], 0.05, 2.0, 10, 16);

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  function vbuf(data, loc, size) {
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    return b;
  }

  vbuf(pos, 0, 3);
  vbuf(norm, 1, 3);
  vbuf(part, 2, 1);

  const ib = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);

  return { vao, count: idx.length };
}

// helper for angle lerp (shortest path)
function lerpAngle(a, b, t) {
  const TWO_PI = Math.PI * 2.0;
  let diff = (b - a) % TWO_PI;
  if (diff > Math.PI) diff -= TWO_PI;
  if (diff < -Math.PI) diff += TWO_PI;
  return a + diff * t;
}

export function createCrabLayer(gl) {
  const prog = makeProgram(gl, vs, fs, {
    a_pos: 0,
    a_normal: 1,
    a_part: 2,
  });

  const mesh = makeHermitCrabMesh(gl);

  const U = (n) => gl.getUniformLocation(prog, n);
  const u_proj = U("u_proj");
  const u_view = U("u_view");
  const u_worldPos = U("u_worldPos");
  const u_angle = U("u_angle");
  const u_time = U("u_time");
  const u_fogColor = U("u_fogColor");
  const u_fogNear = U("u_fogNear");
  const u_fogFar = U("u_fogFar");
  const u_moveAmount = U("u_moveAmount");

  // --- wander state ------------------------------------------------------
  const crab = {
    pos: [
      (Math.random() * 2 - 1) * (TANK_X_HALF * 0.4),
      0.0,
      (Math.random() * 2 - 1) * (TANK_Z_HALF * 0.4),
    ],
    angle: Math.random() * Math.PI * 2.0,   // visual facing
    state: "rest",                          // "rest" | "move"
    stateTime: 2.0 + Math.random() * 3.0,   // time remaining in current state
    speed: 0.03 + Math.random() * 0.02,     // base sideways speed
    target: [0.0, 0.0],                     // x,z target on sand
  };

  const BODY_RADIUS = 0.07;
  const MARGIN = 0.08;
  const USE_SCENE_COLLISION = false; // flip true if you want rock avoidance

  function clampToTank(x, half, margin) {
    const limit = half - margin;
    if (x < -limit) return -limit;
    if (x >  limit) return  limit;
    return x;
  }

  function pickNewTarget() {
    // random spot in tank, slightly biased toward center
    const rx = (Math.random() * 2 - 1) * (TANK_X_HALF * 0.8);
    const rz = (Math.random() * 2 - 1) * (TANK_Z_HALF * 0.8);
    crab.target[0] = clampToTank(rx, TANK_X_HALF, MARGIN);
    crab.target[1] = clampToTank(rz, TANK_Z_HALF, MARGIN);
  }

  // pick an initial target
  pickNewTarget();

  let lastTime = 0;

  function step(time, floorYOffset) {
    const dt = Math.max(0.0, time - lastTime);
    lastTime = time;

    crab.stateTime -= dt;
    crab.pos[1] = floorYOffset + 0.022; // sit just above sand

    // ----- resting: groom + occasional wander decision -----
    if (crab.state === "rest") {
      if (crab.stateTime <= 0.0) {
        crab.state = "move";
        crab.stateTime = 3.0 + Math.random() * 5.0; // length of next trip
        crab.speed = 0.024 + Math.random() * 0.02;

        // head towards a fresh target
        pickNewTarget();
      }
      return;
    }

    // ----- moving: scuttle sideways toward target ----------
    const dx = crab.target[0] - crab.pos[0];
    const dz = crab.target[1] - crab.pos[2];
    const dist = Math.hypot(dx, dz);

    // if we reached the spot, chill for a bit
    if (dist < 0.03) {
      crab.state = "rest";
      crab.stateTime = 1.5 + Math.random() * 3.0;
      return;
    }

    // forward direction toward target
    const moveDir = Math.atan2(dz, dx);

    // crab body "facing": a bit offset from the move direction,
    // so it looks like it’s scuttling sideways
    const desiredFacing = moveDir - Math.PI * 0.5;
    crab.angle = lerpAngle(crab.angle, desiredFacing, Math.min(1.0, 4.0 * dt));

    // sideways (velocity) direction
    const sideAngle = crab.angle + Math.PI * 0.5;
    const stepLen = crab.speed * dt;
    let nx = crab.pos[0] + Math.cos(sideAngle) * stepLen;
    let nz = crab.pos[2] + Math.sin(sideAngle) * stepLen;

    // tank bounds
    const inside =
      Math.abs(nx) < (TANK_X_HALF - MARGIN) &&
      Math.abs(nz) < (TANK_Z_HALF - MARGIN);

    const collides = (USE_SCENE_COLLISION && checkCollision2D)
      ? checkCollision2D(nx, nz, BODY_RADIUS, 0.0)
      : false;

    if (!inside || collides) {
      // clamp to tank and choose a new wander target
      nx = clampToTank(nx, TANK_X_HALF, MARGIN);
      nz = clampToTank(nz, TANK_Z_HALF, MARGIN);
      crab.pos[0] = nx;
      crab.pos[2] = nz;

      pickNewTarget();
      crab.stateTime = Math.min(crab.stateTime, 1.0 + Math.random() * 1.0);
    } else {
      crab.pos[0] = nx;
      crab.pos[2] = nz;

      // tiny random heading jitter for organic arcs
      crab.angle += (Math.random() - 0.5) * 0.5 * dt;
    }

    if (crab.stateTime <= 0.0) {
      crab.state = "rest";
      crab.stateTime = 1.2 + Math.random() * 2.5;
    }
  }

  function draw(shared) {
    step(shared.time, shared.floorYOffset);

    // how "active" he is: drives leg animation strength
    const moveAmount =
      crab.state === "move"
        ? Math.min(1.0, crab.speed / 0.04)
        : 0.0;

    // Temporarily disable culling so animated shell/body never pop
    const wasCull = gl.isEnabled(gl.CULL_FACE);
    if (wasCull) gl.disable(gl.CULL_FACE);

    gl.useProgram(prog);
    gl.bindVertexArray(mesh.vao);

    gl.uniformMatrix4fv(u_proj, false, shared.proj);
    gl.uniformMatrix4fv(u_view, false, shared.view);
    gl.uniform3f(u_worldPos, crab.pos[0], crab.pos[1], crab.pos[2]);
    gl.uniform1f(u_angle, crab.angle);
    gl.uniform1f(u_time, shared.time);
    gl.uniform1f(u_moveAmount, moveAmount);
    gl.uniform3f(
      u_fogColor,
      shared.fogColor[0],
      shared.fogColor[1],
      shared.fogColor[2]
    );
    gl.uniform1f(u_fogNear, shared.fogNear);
    gl.uniform1f(u_fogFar, shared.fogFar);

    gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);

    if (wasCull) gl.enable(gl.CULL_FACE);
  }

  return { draw };
}