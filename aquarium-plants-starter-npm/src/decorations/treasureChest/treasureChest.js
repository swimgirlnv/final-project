// treasureChest.js
import { vs, fs } from "./treasureChestShaders.js";

export function createTreasureChestLayer(gl, opts = {}) {
  const spawnBubble = opts.spawnBubble || (() => {});
  const position = opts.position ? [...opts.position] : [0.6, -0.05, -0.5];
  let bubbleCount = opts.bubbleCount ?? 7;
  let rotation = opts.rotation ?? 0; // rotation in radians around Y axis
  let treasureAmount = opts.treasureAmount ?? 0.5; // 0.0 to 1.0

  function compile(type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(sh) || "chest shader fail");
    }
    return sh;
  }

  function program(vsSrc, fsSrc, bindings) {
    const p = gl.createProgram();
    const v = compile(gl.VERTEX_SHADER, vsSrc);
    const f = compile(gl.FRAGMENT_SHADER, fsSrc);
    gl.attachShader(p, v);
    gl.attachShader(p, f);
    for (const [name, loc] of Object.entries(bindings)) {
      gl.bindAttribLocation(p, loc, name);
    }
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(p) || "chest link fail");
    }
    gl.deleteShader(v);
    gl.deleteShader(f);
    return p;
  }

  // ------------- chest dimensions (model space) -----------------
  const W = 0.55;  // width  (x)
  const D = 0.38;  // depth  (z)
  const H = 0.26;  // base height
  const LID_H = 0.16; // lid thickness

  const x0 = -W * 0.5;
  const x1 =  W * 0.5;
  const z0 = -D * 0.5;   // back edge (hinge side)
  const z1 =  D * 0.5;   // front edge

  const hingeY = H;      // y of hinge line
  const hingeZ = z0;     // z of hinge line (back edge)

  // ------------- geometry helpers -----------------
  function addQuad(
    mesh,
    xA, yA, zA,
    xB, yB, zB,
    xC, yC, zC,
    xD, yD, zD,
    nx, ny, nz,
    u0, v0,
    u1, v1,
    u2, v2,
    u3, v3,
    kind,    // 0 = wood, 1 = metal, 2 = treasure
    isLid    // 1 = lid, 0 = base/treasure
  ) {
    const baseIndex = mesh.pos.length / 3;

    mesh.pos.push(
      xA, yA, zA,
      xB, yB, zB,
      xC, yC, zC,
      xD, yD, zD
    );

    for (let i = 0; i < 4; i++) {
      mesh.norm.push(nx, ny, nz);
      mesh.kind.push(kind);
      mesh.isLid.push(isLid);
    }

    mesh.uv.push(
      u0, v0,
      u1, v1,
      u2, v2,
      u3, v3
    );

    mesh.idx.push(
      baseIndex,     baseIndex + 1, baseIndex + 2,
      baseIndex,     baseIndex + 2, baseIndex + 3
    );
  }

 function buildMesh() {
  const mesh = {
    pos:   [],
    norm:  [],
    uv:    [],
    kind:  [],
    isLid: [],
    idx:   [],
  };

  const yBottom = 0.0;
  const yTopBase = H;

  // ---------------- BASE BOX (wood, kind=0, isLid=0) ----------------
  // bottom
  addQuad(
    mesh,
    x0, yBottom, z0,
    x1, yBottom, z0,
    x1, yBottom, z1,
    x0, yBottom, z1,
    0, -1, 0,
    0, 0, 1, 0, 1, 1, 0, 1,
    0.0, 0.0
  );

  // front
  addQuad(
    mesh,
    x0, yBottom, z1,
    x1, yBottom, z1,
    x1, yTopBase, z1,
    x0, yTopBase, z1,
    0, 0, 1,
    0, 0, 1, 0, 1, 1, 0, 1,
    0.0, 0.0
  );

  // back
  addQuad(
    mesh,
    x1, yBottom, z0,
    x0, yBottom, z0,
    x0, yTopBase, z0,
    x1, yTopBase, z0,
    0, 0, -1,
    0, 0, 1, 0, 1, 1, 0, 1,
    0.0, 0.0
  );

  // left
  addQuad(
    mesh,
    x0, yBottom, z0,
    x0, yBottom, z1,
    x0, yTopBase, z1,
    x0, yTopBase, z0,
    -1, 0, 0,
    0, 0, 1, 0, 1, 1, 0, 1,
    0.0, 0.0
  );

  // right
  addQuad(
    mesh,
    x1, yBottom, z1,
    x1, yBottom, z0,
    x1, yTopBase, z0,
    x1, yTopBase, z1,
    1, 0, 0,
    0, 0, 1, 0, 1, 1, 0, 1,
    0.0, 0.0
  );

  // NOTE: **no interior “top rim” quad here** – chest interior is open.

  // ---------------- METAL BAND + LOCK (kind=1, isLid=0) -------------
  const bandH = H * 0.32;
  const bY0 = yBottom + bandH * 0.4;
  const bY1 = bY0 + bandH;

  // front band
  addQuad(
    mesh,
    x0, bY0, z1 + 0.001,
    x1, bY0, z1 + 0.001,
    x1, bY1, z1 + 0.001,
    x0, bY1, z1 + 0.001,
    0, 0, 1,
    0, 0, 1, 0, 1, 1, 0, 1,
    1.0, 0.0
  );

  // lock plate
  const lockW = 0.09;
  const lockH = 0.13;
  const lockY0 = bY0 + 0.02;
  addQuad(
    mesh,
    -lockW * 0.5, lockY0,          z1 + 0.01,
     lockW * 0.5, lockY0,          z1 + 0.01,
     lockW * 0.5, lockY0 + lockH,  z1 + 0.01,
    -lockW * 0.5, lockY0 + lockH,  z1 + 0.01,
    0, 0, 1,
    0, 0, 1, 0, 1, 1, 0, 1,
    1.0, 0.0
  );

  // ---------------- LID (wood, kind=0, isLid=1) ----------------------
  const lidY0 = yTopBase;
  const lidY1 = lidY0 + LID_H;

  // lid top
  addQuad(
    mesh,
    x0, lidY1, z0,
    x1, lidY1, z0,
    x1, lidY1, z1,
    x0, lidY1, z1,
    0, 1, 0,
    0, 0, 1, 0, 1, 1, 0, 1,
    0.0, 1.0
  );

  // lid bottom (inside)
  addQuad(
    mesh,
    x0, lidY0, z1,
    x1, lidY0, z1,
    x1, lidY0, z0,
    x0, lidY0, z0,
    0, -1, 0,
    0, 0, 1, 0, 1, 1, 0, 1,
    0.0, 1.0
  );

  // front of lid
  addQuad(
    mesh,
    x0, lidY0, z1,
    x1, lidY0, z1,
    x1, lidY1, z1,
    x0, lidY1, z1,
    0, 0, 1,
    0, 0, 1, 0, 1, 1, 0, 1,
    0.0, 1.0
  );

  // back of lid (hinge side)
  addQuad(
    mesh,
    x1, lidY0, z0,
    x0, lidY0, z0,
    x0, lidY1, z0,
    x1, lidY1, z0,
    0, 0, -1,
    0, 0, 1, 0, 1, 1, 0, 1,
    0.0, 1.0
  );

  // left side of lid
  addQuad(
    mesh,
    x0, lidY0, z0,
    x0, lidY0, z1,
    x0, lidY1, z1,
    x0, lidY1, z0,
    -1, 0, 0,
    0, 0, 1, 0, 1, 1, 0, 1,
    0.0, 1.0
  );

  // right side of lid
  addQuad(
    mesh,
    x1, lidY0, z1,
    x1, lidY0, z0,
    x1, lidY1, z0,
    x1, lidY1, z1,
    1, 0, 0,
    0, 0, 1, 0, 1, 1, 0, 1,
    0.0, 1.0
  );

  // ---------------- TREASURE (kind=2, isLid=0) -----------------------
  const tInsetX = 0.06;
  const tInsetZ = 0.08;
  const tX0 = x0 + tInsetX;
  const tX1 = x1 - tInsetX;
  const tZ0 = z0 + tInsetZ;
  const tZ1 = z1 - tInsetZ;
  const tY0 = yBottom + 0.02;             // just above the real bottom
  const tY1 = yTopBase * (0.4 + treasureAmount * 0.5); // height varies with amount

  // Grid density varies with treasureAmount (min 2x2, max 10x6)
  const cellsX = Math.max(2, Math.floor(2 + treasureAmount * 8));
  const cellsZ = Math.max(2, Math.floor(2 + treasureAmount * 4));
  const dx = (tX1 - tX0) / cellsX;
  const dz = (tZ1 - tZ0) / cellsZ;

  for (let ix = 0; ix < cellsX; ix++) {
    for (let iz = 0; iz < cellsZ; iz++) {
      const cx0 = tX0 + ix * dx;
      const cx1 = cx0 + dx;
      const cz0 = tZ0 + iz * dz;
      const cz1 = cz0 + dz;

      const hRand = 0.35 + 0.55 * Math.random();
      const yTop = tY0 + (tY1 - tY0) * hRand;

      addQuad(
        mesh,
        cx0, yTop, cz0,
        cx1, yTop, cz0,
        cx1, yTop, cz1,
        cx0, yTop, cz1,
        0, 1, 0,
        0, 0, 1, 0, 1, 1, 0, 1,
        2.0, 0.0
      );
    }
  }

  // little gem prism on top of the pile (still kind=2)
  const gX0 = tX1 - 0.05;
  const gX1 = tX1 - 0.01;
  const gZ0 = tZ1 - 0.05;
  const gZ1 = tZ1 - 0.01;
  const gY0 = tY0 + 0.02;
  const gY1 = gY0 + 0.10;

  // front
  addQuad(
    mesh,
    gX0, gY0, gZ1,
    gX1, gY0, gZ1,
    gX1, gY1, gZ1,
    gX0, gY1, gZ1,
    0, 0, 1,
    0, 0, 1, 0, 1, 1, 0, 1,
    2.0, 0.0
  );
  // back
  addQuad(
    mesh,
    gX1, gY0, gZ0,
    gX0, gY0, gZ0,
    gX0, gY1, gZ0,
    gX1, gY1, gZ0,
    0, 0, -1,
    0, 0, 1, 0, 1, 1, 0, 1,
    2.0, 0.0
  );
  // left
  addQuad(
    mesh,
    gX0, gY0, gZ0,
    gX0, gY0, gZ1,
    gX0, gY1, gZ1,
    gX0, gY1, gZ0,
    -1, 0, 0,
    0, 0, 1, 0, 1, 1, 0, 1,
    2.0, 0.0
  );
  // right
  addQuad(
    mesh,
    gX1, gY0, gZ1,
    gX1, gY0, gZ0,
    gX1, gY1, gZ0,
    gX1, gY1, gZ1,
    1, 0, 0,
    0, 0, 1, 0, 1, 1, 0, 1,
    2.0, 0.0
  );
  // top
  addQuad(
    mesh,
    gX0, gY1, gZ0,
    gX1, gY1, gZ0,
    gX1, gY1, gZ1,
    gX0, gY1, gZ1,
    0, 1, 0,
    0, 0, 1, 0, 1, 1, 0, 1,
    2.0, 0.0
  );

  return mesh;
}

  let mesh = buildMesh();

  // ------------- buffers / VAO -----------------
  let vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  function vbuf(data, loc, size) {
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    return b;
  }

  function rebuildBuffers() {
    gl.bindVertexArray(vao);
    
    vbuf(mesh.pos,   0, 3);
    vbuf(mesh.norm,  1, 3);
    vbuf(mesh.uv,    2, 2);
    vbuf(mesh.kind,  3, 1);
    vbuf(mesh.isLid, 4, 1);

    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(
      gl.ELEMENT_ARRAY_BUFFER,
      new Uint16Array(mesh.idx),
      gl.STATIC_DRAW
    );
  }

  rebuildBuffers();

  const prog = program(vs, fs, {
    a_pos:    0,
    a_normal: 1,
    a_uv:     2,
    a_kind:   3,
    a_isLid:  4,
  });

  const U = (n) => gl.getUniformLocation(prog, n);
  const u_proj      = U("u_proj");
  const u_view      = U("u_view");
  const u_model     = U("u_model");
  const u_time      = U("u_time");
  const u_lidAngle  = U("u_lidAngle");
  const u_hingeYZ   = U("u_hingeYZ");
  const u_fogColor  = U("u_fogColor");
  const u_fogNear   = U("u_fogNear");
  const u_fogFar    = U("u_fogFar");

  // Function to build model matrix with rotation and translation
  function buildModelMatrix() {
    const c = Math.cos(rotation);
    const s = Math.sin(rotation);
    return new Float32Array([
      c, 0, s, 0,
      0, 1, 0, 0,
      -s, 0, c, 0,
      position[0], position[1], position[2], 1,
    ]);
  }

  let model = buildModelMatrix();

  // -------- animation state --------
  let lidAngle       = 0.0;
  let targetAngle    = 0.0;          // 0 closed, OPEN_ANGLE open
  let lastTime       = 0.0;
  let nextToggleTime = 4.0;         // first random toggle after ~4s
  const OPEN_ANGLE   = 1.25;        // rad (~70°)

  function burstBubbles() {
    const chestMouthY = position[1] + H + LID_H * 0.2;
    
    // The mouth of the chest is at the front (positive Z in local space)
    // We need to rotate this offset by the chest's rotation
    const localMouthZ = 0.5 * D; // front of chest in local space
    
    // Rotate the mouth position by the chest's rotation
    const cosRot = Math.cos(rotation);
    const sinRot = Math.sin(rotation);

    for (let i = 0; i < bubbleCount; i++) {
      // Random jitter in local space
      const localJitterX = (Math.random() - 0.5) * 0.18;
      const localJitterZ = (Math.random() - 0.5) * 0.10;
      
      // Apply rotation to the local offsets
      const rotatedX = localJitterX * cosRot - (localMouthZ + localJitterZ) * sinRot;
      const rotatedZ = localJitterX * sinRot + (localMouthZ + localJitterZ) * cosRot;
      
      spawnBubble(
        position[0] + rotatedX,
        chestMouthY,
        position[2] + rotatedZ
      );
    }
  }

  function update(time) {
    const dt = Math.max(0.0, time - lastTime);
    lastTime = time;

    // random auto toggle
    if (time > nextToggleTime) {
      const opening = targetAngle <= 0.5;
      targetAngle = opening ? OPEN_ANGLE : 0.0;
      nextToggleTime = time + 6.0 + Math.random() * 6.0;
      if (opening) burstBubbles();
    }

    // ease lidAngle toward targetAngle
    const speed = 2.1; // rad/s
    const diff  = targetAngle - lidAngle;
    const step  = Math.sign(diff) * speed * dt;

    if (Math.abs(step) >= Math.abs(diff)) {
      lidAngle = targetAngle;
    } else {
      lidAngle += step;
    }
  }

  function handleClick() {
    const opening = targetAngle <= 0.5;
    targetAngle = opening ? OPEN_ANGLE : 0.0;
    nextToggleTime = lastTime + 8.0 + Math.random() * 5.0;
    if (opening) burstBubbles();
  }

  return {
    setPosition(x, y, z) {
      position[0] = x;
      position[1] = y;
      position[2] = z;
      model = buildModelMatrix();
    },

    setBubbleCount(count) {
      bubbleCount = Math.max(0, Math.floor(count));
    },

    setRotation(angle) {
      rotation = angle;
      model = buildModelMatrix();
    },

    setTreasureAmount(amount) {
      treasureAmount = Math.max(0, Math.min(1, amount));
      mesh = buildMesh();
      rebuildBuffers();
    },

    handleClick, // call this from your mouse/pick logic

    draw(shared) {
      update(shared.time);

      gl.useProgram(prog);
      gl.bindVertexArray(vao);

      // Disable back-face culling ONLY for the chest, so it's always visible.
      const hadCull = gl.isEnabled(gl.CULL_FACE);
      if (hadCull) gl.disable(gl.CULL_FACE);

      gl.uniformMatrix4fv(u_proj,  false, shared.proj);
      gl.uniformMatrix4fv(u_view,  false, shared.view);
      gl.uniformMatrix4fv(u_model, false, model);
      gl.uniform1f(u_time, shared.time);
      gl.uniform1f(u_lidAngle, lidAngle);
      gl.uniform2f(u_hingeYZ, hingeY, hingeZ);

      gl.uniform3f(
        u_fogColor,
        shared.fogColor[0],
        shared.fogColor[1],
        shared.fogColor[2]
      );
      gl.uniform1f(u_fogNear, shared.fogNear);
      gl.uniform1f(u_fogFar,  shared.fogFar);

      gl.drawElements(
        gl.TRIANGLES,
        mesh.idx.length,
        gl.UNSIGNED_SHORT,
        0
      );

      if (hadCull) gl.enable(gl.CULL_FACE);
    },
  };
}