/*
    Stephen Gavin Sears
    Commented 12/1/2025
    This file contains a 3D boid implementation that only
    uses y rotation, and has the ability to use spatial hashing
    if needed (for this project, possibly not efficient).

    AI was used for the base, but it has been heavily modified since then,
    as many parts of the implementation were not to my liking.
    Same goes for some of the helpers.
    Vec3 class was implemented, and is different than maps {x: 0.0, y: 0.0, z: 0.0} used earlier.
    This is problematic, since in linearTools.js a barebones Vec3 is also implemented,
    but I want to keep this file's problems separate, so I'm keeping it this way
    until the need to change it arises.
*/

// GENERIC HELPER FUNCTIONS

function numClamp(a, min, max) {
    return a <= min
    ? min
    : a >= max
        ? max
        : a
}

function lerp(start, end, amt) {
    return (1 - amt) * start + amt * end;
}

// Y rotation the fish model needs to face along a horizontal heading
function headingToRot(hx, hz) {
    let forwardVal = hz; // rotation from forward vector
    forwardVal = (forwardVal + 1.0) / 2.0;
    forwardVal *= Math.PI * (hx < 0.0 ? -1.0 : 1.0); // whether or not we flip x axis
    return forwardVal + Math.PI;
}

function lerpAngle(start, end, amt) {
    let diff = end - start;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;
    return start + diff * amt;
}

// VECTOR CLASS

class Vec3 {
    constructor(x = 0, y = 0, z = 0) {
        this.x = x; this.y = y; this.z = z;
    }
    add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
    sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
    mult(n) { this.x *= n; this.y *= n; this.z *= n; return this; }
    div(n) { this.x /= n; this.y /= n; this.z /= n; return this; }
    clone() { return new Vec3(this.x, this.y, this.z); }
    mag() { return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z); }
    normalize() { const m = this.mag(); if (m !== 0) this.div(m); return this; }
    limit(max) { if (this.mag() > max) this.setMag(max); return this; }
    lowerLimit(min) { if (this.mag() < min) this.setMag(min); return this; }
    clamp(min, max) { this.limit(max).lowerLimit(min); return this; };
    vClamp(vMin, vMax) { 
        this.x = numClamp(this.x, vMin.x, vMax.x);
        this.y = numClamp(this.y, vMin.y, vMax.y);
        this.z = numClamp(this.z, vMin.z, vMax.z); 
        return this; 
    };
    setMag(n) { return this.normalize().mult(n); }
    dist(v) { 
        const dx = this.x - v.x, dy = this.y - v.y, dz = this.z - v.z; 
        return Math.sqrt(dx*dx + dy*dy + dz*dz); 
    }
    static sub(v1, v2) { return new Vec3(v1.x - v2.x, v1.y - v2.y, v1.z - v2.z); }
    static dot(v1, v2) { return v1.x * v2.x + v1.y * v2.y + v1.z * v2.z; }
}

// SPATIAL GRID
// Map of positions that uses strings based on coordinate regions
class SpatialGrid {
    constructor(cellSize) {
        this.cellSize = cellSize;
        this.cells = new Map();
    }
    clear() { this.cells.clear(); }
    getKey(pos) {
        return `${Math.floor(pos.x/this.cellSize)},${Math.floor(pos.y/this.cellSize)},${Math.floor(pos.z/this.cellSize)}`;
    }
    add(boid) {
        const key = this.getKey(boid.position);
        if (!this.cells.has(key)) this.cells.set(key, []);
        this.cells.get(key).push(boid);
    }
    getNearby(boid) {
        const nearby = [];
        const x = Math.floor(boid.position.x / this.cellSize);
        const y = Math.floor(boid.position.y / this.cellSize);
        const z = Math.floor(boid.position.z / this.cellSize);
        for (let i = -1; i <= 1; i++) {
            for (let j = -1; j <= 1; j++) {
                for (let k = -1; k <= 1; k++) {
                    const key = `${x+i},${y+j},${z+k}`;
                    if (this.cells.has(key)) {
                        for (let other of this.cells.get(key)) {
                            if (other !== boid) nearby.push(other);
                        }
                    }
                }
            }
        }
        return nearby;
    }
}

// BOID CLASS
// Physics controlled agent with bounds and y rotation
class Boid {
    constructor(x, y, z, maxSpeed = 0.005, maxForce = 0.0004) {
        this.maxSpeed = maxSpeed;
        this.maxForce = maxForce; 

        this.position = new Vec3(x, y, z);
        this.velocity = new Vec3(Math.random() - 0.5, 0.0, Math.random() - 0.5);
        this.velocity.setMag(this.maxSpeed);
        this.acceleration = new Vec3();
        
        // no other rotation
        this.yRot = 0.0;

        // nose up or down during a leap, and the active disco stunt if any
        this.pitch = 0.0;
        this.stunt = null;

        this.wanderTheta = Math.random() * Math.PI * 2;
    }

    // Update signature to accept bounds
    update(bounds, timeScale, ceiling = Infinity) { 
        this.velocity.add(this.acceleration.mult(timeScale));
        this.velocity.limit(this.maxSpeed);

        this.velocity.lowerLimit(this.maxSpeed * 0.5);

        this.position.add(this.velocity.clone().mult(timeScale));

        // ensures boids never leak out of bounds
        let lowerBounds = new Vec3(bounds.minX, bounds.minY, bounds.minZ);
        let upperBounds = new Vec3(bounds.maxX, bounds.maxY, bounds.maxZ);
        this.position.vClamp(lowerBounds, upperBounds);

        // stay under the water surface
        if (this.position.y > ceiling) {
            this.position.y = ceiling;
            if (this.velocity.y > 0.0) this.velocity.y = 0.0;
        }

        this.acceleration.mult(0);
    }

    updateRotation() {
        let horizontalMovement = new Vec3(this.velocity.x, 0.0, this.velocity.z);
        if (horizontalMovement.mag() > 0.0012) // this check reduces jittery movement
        {
            horizontalMovement.normalize(); // generally a good idea

            let newRot = headingToRot(horizontalMovement.x, horizontalMovement.z);
            this.yRot = lerpAngle(this.yRot, newRot, 0.1); // atan2 method didn't work, so I had to do this hacky custom thing
        }
    }

    applyForce(force) {
        this.acceleration.add(force);
    }

    wander() {
        const wanderR = 0.5;   // Radius
        const wanderD = 1.0;   // Distance
        const change = 0.2;    // Jitter

        this.wanderTheta += (Math.random() - 0.5) * change;

        let circlePos = this.velocity.clone();
        circlePos.normalize().mult(wanderD);
        circlePos.add(this.position);

        let h = this.wanderTheta;
        let circleOffset = new Vec3(Math.cos(h) * wanderR, 0, Math.sin(h) * wanderR);
        
        let target = circlePos.clone().add(circleOffset);
        
        let steer = Vec3.sub(target, this.position);
        steer.setMag(this.maxSpeed);
        steer.sub(this.velocity);
        steer.limit(this.maxForce);
        
        // Flatten Y to prevent wandering into floor/ceiling
        steer.y = 0; 

        return steer;
    }

    seek(target) {
        let desired = Vec3.sub(target, this.position);
        desired.setMag(this.maxSpeed);

        let steer = Vec3.sub(desired, this.velocity);
        steer.limit(this.maxForce); 
        return steer;
    }

    // applies boid flocking motions
    flock(boids, config, bounds, foodPos) {
        let sep = new Vec3(), ali = new Vec3(), coh = new Vec3();
        let count = 0;
        
        const perceptionRadius = 0.8; 
        const sepRadius = 0.4;

        for (let other of boids) {
            const d = this.position.dist(other.position);
            if (d < perceptionRadius && d > 0) {
                ali.add(other.velocity);
                coh.add(other.position);
                if (d < sepRadius) {
                    let diff = Vec3.sub(this.position, other.position);
                    diff.normalize().div(d);
                    sep.add(diff);
                }
                count++;
            }
        }

        if (count > 0) {
            ali.div(count).setMag(this.maxSpeed).sub(this.velocity).limit(this.maxForce);
            coh.div(count).sub(this.position).setMag(this.maxSpeed).sub(this.velocity).limit(this.maxForce);
            sep.div(count).setMag(this.maxSpeed).sub(this.velocity).limit(this.maxForce);
        }

        this.applyForce(sep.mult(config.separation));
        this.applyForce(ali.mult(config.alignment));
        this.applyForce(coh.mult(config.cohesion));

        this.applyForce(this.calculateBoundsForce(bounds, config.boundaryForce));

        if (foodPos) {
            // If food exists, seek it with high priority (weight 2.5)
            // And ignore wander
            let hunger = this.seek(foodPos);
            this.applyForce(hunger.mult(0.1));
        } else {
            // Only wander if there is no food
            this.applyForce(this.wander().mult(0.005));
        }
    }

    // draws fish back into tank when outside
    calculateBoundsForce(bounds, strength) {
        let desired = null;
        // turn back 0.5 from each wall, or sooner in a narrow tank so the two walls never overlap
        const margin = 0.5;
        const mx = Math.min(margin, (bounds.maxX - bounds.minX) * 0.3);
        const my = Math.min(margin, (bounds.maxY - bounds.minY) * 0.3);
        const mz = Math.min(margin, (bounds.maxZ - bounds.minZ) * 0.3);

        if (this.position.x < bounds.minX + mx) desired = new Vec3(this.maxSpeed, this.velocity.y, this.velocity.z);
        else if (this.position.x > bounds.maxX - mx) desired = new Vec3(-this.maxSpeed, this.velocity.y, this.velocity.z);

        if (this.position.y < bounds.minY + my) desired = new Vec3(this.velocity.x, this.maxSpeed, this.velocity.z);
        else if (this.position.y > bounds.maxY - my) desired = new Vec3(this.velocity.x, -this.maxSpeed, this.velocity.z);

        if (this.position.z < bounds.minZ + mz) desired = new Vec3(this.velocity.x, this.velocity.y, this.maxSpeed);
        else if (this.position.z > bounds.maxZ - mz) desired = new Vec3(this.velocity.x, this.velocity.y, -this.maxSpeed);

        if (desired) {
            desired.normalize().mult(this.maxSpeed);
            let steer = Vec3.sub(desired, this.velocity);
            steer.limit(this.maxForce * strength);
            return steer;
        }
        return new Vec3(0, 0, 0);
    }
}

// BOID SYSTEM CLASS
// Optional spatial hashing, ability to tweak bounds, behaviors in real time
export class BoidSystem {
    constructor(
        count = 50,
        behaviors = { separation: 1.5, alignment: 1.0, cohesion: 1.0, boundaryForce: 2.0 },
        bounds = { minX: -2.5, maxX: 2.5, minY: -2.5, maxY: 2.5, minZ: -2.5, maxZ: 2.5 },
        movement = { maxSpeed: 0.005, maxForce: 0.0004 },
        spatialHash = { useSpatialHash: false, hashSize: 0.8 }
    ) {
        this.boids = [];
        this.useHash = spatialHash.useSpatialHash;

        if (this.useHash) this.grid = new SpatialGrid(spatialHash.hashSize);
        else this.grid = null;

        this.config = behaviors;
        this.bounds = bounds;
        this.maxSpeed = movement.maxSpeed;
        this.maxForce = movement.maxForce;

        // water surface height, fish swim no higher than this minus surfacePad
        this.waterY = 1.8;
        this.surfacePad = 0.12;
        this.initBoids(count);

        // each piece: { pos: Vec3, eatTimer: seconds left once touched, or null }
        this.foods = [];
        this.foodEatTime = 0.5;

        // disco stunts: fast circles and rare leaps out of the water
        this.stuntsEnabled = false;
        this.leapAllowed = false;
        this.splashes = []; // surface points crossed by leaping fish, read and cleared by main
    }

    initBoids(count) {
        for (let i = 0; i < count; i++) {
            const x = Math.random() * (this.bounds.maxX - this.bounds.minX) + this.bounds.minX;
            const yMax = Math.min(this.bounds.maxY, this.waterY - this.surfacePad);
            const y = Math.random() * (yMax - this.bounds.minY) + this.bounds.minY;
            const z = Math.random() * (this.bounds.maxZ - this.bounds.minZ) + this.bounds.minZ;
            this.boids.push(new Boid(x * 0.9, y * 0.9, z * 0.9, this.maxSpeed, this.maxForce));
        }
    }

    regenerate(newCount) {
        this.boids = [];
        
        if (this.grid) {
            this.grid.clear();
        }

        this.initBoids(newCount);
    }

    dropFood() {
        // anywhere across the tank, kept a little away from the glass
        const pad = 0.2;
        const b = this.bounds;
        const x = lerp(b.minX + pad, b.maxX - pad, Math.random());
        const z = lerp(b.minZ + pad, b.maxZ - pad, Math.random());
        this.foods.push({
            pos: new Vec3(x, this.waterY, z), // Top of tank
            eatTimer: null,
        });
    }

    nearestFood(position) {
        let nearest = null;
        let best = Infinity;
        for (let food of this.foods) {
            const d = position.dist(food.pos);
            if (d < best) {
                best = d;
                nearest = food;
            }
        }
        return nearest;
    }

    setBehaviors(newConfig) { this.config = { ...this.config, ...newConfig }; }
    setBounds(newBounds) { this.bounds = { ...this.bounds, ...newBounds }; }

    // Swim in a tight fast circle for two seconds
    startSpin(boid) {
        const v = boid.velocity;
        let hx = v.x, hz = v.z;
        const len = Math.hypot(hx, hz) || 1.0;
        hx /= len; hz /= len;

        const turn = Math.random() < 0.5 ? -1 : 1;
        const radius = 0.2;
        const b = this.bounds;
        const pad = radius + 0.05;
        const cx = numClamp(boid.position.x - hz * turn * radius, b.minX + pad, b.maxX - pad);
        const cz = numClamp(boid.position.z + hx * turn * radius, b.minZ + pad, b.maxZ - pad);

        boid.stunt = {
            type: "spin",
            time: 0.0,
            duration: 2.0,
            cx, cz, radius, turn,
            angle: Math.atan2(boid.position.z - cz, boid.position.x - cx),
            omega: 2.5 * Math.PI, // two and a half loops over the two seconds
        };
    }

    // Arc up through the surface and dive back in a little further ahead
    startLeap(boid) {
        const v = boid.velocity;
        let hx = v.x, hz = v.z;
        const len = Math.hypot(hx, hz) || 1.0;
        hx /= len; hz /= len;

        const b = this.bounds;
        const pad = 0.3;
        const reach = 1.1;
        const x1 = numClamp(boid.position.x + hx * reach, b.minX + pad, b.maxX - pad);
        const z1 = numClamp(boid.position.z + hz * reach, b.minZ + pad, b.maxZ - pad);
        if (Math.hypot(x1 - boid.position.x, z1 - boid.position.z) < 0.6) return false;

        boid.stunt = {
            type: "leap",
            time: 0.0,
            duration: 1.3,
            x0: boid.position.x, y0: boid.position.y, z0: boid.position.z,
            x1, y1: this.waterY - 0.35, z1,
            apex: this.waterY + 0.45,
            above: false,
        };
        boid.yRot = headingToRot(x1 - boid.position.x, z1 - boid.position.z);
        return true;
    }

    startStunts(dt) {
        const free = this.boids.filter(b => !b.stunt);

        // each fish starts a circle about once every 40 seconds
        for (let boid of free) {
            if (Math.random() < dt / 40.0) this.startSpin(boid);
        }

        // a leap about once every 25 seconds, from a fish near the surface
        if (this.leapAllowed && Math.random() < dt / 25.0) {
            const near = free.filter(b => !b.stunt && b.position.y > this.waterY - 0.9);
            if (near.length > 0) this.startLeap(near[Math.floor(Math.random() * near.length)]);
        }
    }

    updateStunt(boid, dt) {
        const s = boid.stunt;
        s.time += dt;

        if (s.type === "spin") {
            // ease in and out of the circle
            const ramp = Math.max(0.3, Math.min(1.0, s.time / 0.25, (s.duration - s.time) / 0.25));
            s.angle += s.turn * s.omega * ramp * dt;

            const ca = Math.cos(s.angle), sa = Math.sin(s.angle);
            boid.position.x = s.cx + ca * s.radius;
            boid.position.z = s.cz + sa * s.radius;

            // tangent of the circle in the turning direction
            const tx = -sa * s.turn, tz = ca * s.turn;
            boid.velocity = new Vec3(tx, 0.0, tz).mult(boid.maxSpeed);
            boid.yRot = headingToRot(tx, tz);
        } else {
            const u = Math.min(1.0, s.time / s.duration);
            const lift = s.apex - (s.y0 + s.y1) * 0.5;
            boid.position.x = lerp(s.x0, s.x1, u);
            boid.position.z = lerp(s.z0, s.z1, u);
            boid.position.y = lerp(s.y0, s.y1, u) + 4.0 * lift * u * (1.0 - u);

            // tilt the nose along the arc
            const dy = (s.y1 - s.y0) + 4.0 * lift * (1.0 - 2.0 * u);
            const dh = Math.hypot(s.x1 - s.x0, s.z1 - s.z0);
            boid.pitch = Math.atan2(dy, dh);

            // record each crossing of the water surface
            const above = boid.position.y > this.waterY;
            if (above !== s.above) {
                this.splashes.push({ x: boid.position.x, y: this.waterY, z: boid.position.z });
                s.above = above;
            }

            boid.velocity = new Vec3(s.x1 - s.x0, 0.0, s.z1 - s.z0).setMag(boid.maxSpeed);
        }

        if (s.time >= s.duration) {
            boid.stunt = null;
            boid.pitch = 0.0;
        }
    }

    update(dt) {
        let timeScale = dt * 120.0;

        if (this.stuntsEnabled) this.startStunts(dt);

        // sink food, count down pieces being eaten, and drop finished ones
        for (let food of this.foods) {
            food.pos.y -= 0.0005 * timeScale; // Sink speed
            if (food.eatTimer !== null) food.eatTimer -= dt;
        }
        this.foods = this.foods.filter(f => f.pos.y >= 0.0 && (f.eatTimer === null || f.eatTimer > 0.0));

        // update spatial grid only if we are hashing
        if (this.useHash)
        {
            this.grid.clear();
            for (let boid of this.boids) this.grid.add(boid);
        }
        
        for (let boid of this.boids) {
            if (boid.stunt) {
                this.updateStunt(boid, dt);
                continue;
            }

            const food = this.nearestFood(boid.position);
            if (food && food.eatTimer === null && boid.position.dist(food.pos) < 0.1) {
                food.eatTimer = this.foodEatTime;
            }

            // either use spatial hash neighbors or
            // all boids depending on settings
            let others;
            if (this.useHash) others = this.grid.getNearby(boid);
            else others = this.boids;

            boid.flock(this.boids, this.config, this.bounds, food ? food.pos : null);
            boid.updateRotation();
            boid.update(this.bounds, timeScale, this.waterY - this.surfacePad);
        }
    }

    setBoidMaxSpeed(speed) {
        // remembered so fish created later use the same speed
        this.maxSpeed = speed;
        for (let boid of this.boids) {
            boid.maxSpeed = speed;
        }
    }

    getBoidPositions() {
        return this.boids.map(b => ({
            // for drawing instances
            x: b.position.x,
            y: b.position.y,
            z: b.position.z,
            // for controlling speed-based animations
            vx: b.velocity.x,
            vy: b.velocity.y,
            vz: b.velocity.z,
            // y rotation
            rotY: b.yRot,
            pitch: b.pitch
        }));
    }
}