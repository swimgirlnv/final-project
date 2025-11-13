/**
 * CatmullRomSpline3D: Generates smooth 3D curves passing through a list of control points.
 */
export class CatmullRomSpline3D {
    /**
     * @param {Array<Array<number>>} points - An array of 3D control points, e.g., [[x1, y1, z1], [x2, y2, z2], ...].
     * @param {number} alpha - The 'tension' parameter (0.0 = Uniform/Default, 0.5 = Centripetal/Recommended).
     */
    constructor(points, alpha = 0.0) {
        if (points.length < 2 || points[0].length !== 3) {
            throw new Error("CatmullRomSpline3D requires at least 2 control points, each with 3 components (x, y, z).");
        }
        this.points = points;
        this.alpha = alpha;
        
        // Caches the length of each segment for uniform speed
        this._segmentLengths = [];
        this._totalLength = 0;
        this._calculateArcLengths();
    }

    /**
     * Calculates the point and/or tangent on a single Catmull-Rom segment.
     * @param {number} t - Normalized time (0 to 1) for the current segment.
     * @param {Array<number>} p0...p3 - The four necessary 3D control points.
     * @param {boolean} getTangent - If true, returns the derivative (tangent) instead of the position.
     * @returns {Array<number>} The interpolated 3D point [x, y, z] or 3D tangent vector.
     */
    _interpolate(t, p0, p1, p2, p3, getTangent = false) {
        const t2 = t * t;
        const t3 = t2 * t;

        // Catmull-Rom basis functions (h00, h10, h01, h11)
        // Or their derivatives (dh00, dh10, dh01, dh11) if getting the tangent
        let c0, c1, c2, c3; // Coefficients for the final interpolation
        
        if (getTangent) {
            // Derivatives of the basis functions
            c0 = 6 * t2 - 6 * t; // dh00/dt
            c1 = 3 * t2 - 4 * t + 1; // dh10/dt
            c2 = -6 * t2 + 6 * t; // dh01/dt
            c3 = 3 * t2 - 2 * t; // dh11/dt
        } else {
            // Position basis functions
            c0 = 2 * t3 - 3 * t2 + 1; // h00
            c1 = t3 - 2 * t2 + t;     // h10
            c2 = -2 * t3 + 3 * t2;    // h01
            c3 = t3 - t2;             // h11
        }

        // Tangent scalar (Catmull-Rom alpha)
        const tension = (1 - this.alpha) / 2;
        
        // Calculate tangents (m1, m2) for P1 and P2
        const m1 = []; // Tangent at p1
        const m2 = []; // Tangent at p2

        for (let i = 0; i < 3; i++) {
            // m1 = tension * (p2 - p0)
            m1[i] = tension * (p2[i] - p0[i]); 
            // m2 = tension * (p3 - p1)
            m2[i] = tension * (p3[i] - p1[i]); 
        }
        
        // Perform the Hermite interpolation for each component (x, y, z)
        const result = [];
        for (let i = 0; i < 3; i++) {
            result[i] = c0 * p1[i] + c1 * m1[i] + c2 * p2[i] + c3 * m2[i];
        }

        return result;
    }
    
    /**
     * Finds the correct segment and local 't' for a given global normalized time 't'.
     * @param {number} t - Global normalized time (0.0 to 1.0).
     * @returns {{segmentIndex: number, t_local: number, p0: Array<number>, p1: Array<number>, p2: Array<number>, p3: Array<number>}} 
     */
    _getSegmentData(t) {
        if (t <= 0) return { segmentIndex: 0, t_local: 0, p0: this.points[0], p1: this.points[0], p2: this.points[1], p3: this.points[2] || this.points[1] };
        if (t >= 1) {
            const lastIdx = this.points.length - 1;
            const secondLastIdx = lastIdx - 1;
            return { segmentIndex: lastIdx - 1, t_local: 1, p0: this.points[secondLastIdx - 1] || this.points[secondLastIdx], p1: this.points[secondLastIdx], p2: this.points[lastIdx], p3: this.points[lastIdx] };
        }

        let t_reparam = t * this._totalLength;
        let segmentIndex = 0;

        for (let i = 0; i < this.points.length - 1; i++) {
            if (t_reparam < this._segmentLengths[i]) {
                segmentIndex = i;
                break;
            }
            t_reparam -= this._segmentLengths[i];
            
            if (i === this.points.length - 2) {
                segmentIndex = this.points.length - 2;
                break;
            }
        }

        const segmentLength = this._segmentLengths[segmentIndex];
        const t_local = t_reparam / segmentLength;

        // Get the four necessary control points: P_i-1, P_i, P_i+1, P_i+2
        const i = segmentIndex;
        const p1 = this.points[i];
        const p2 = this.points[i + 1];
        
        // Extrapolate P0 (before p1) and P3 (after p2)
        const p0 = (i === 0) ? p1 : this.points[i - 1];
        const p3 = (i === this.points.length - 2) ? p2 : this.points[i + 2];

        return { segmentIndex, t_local, p0, p1, p2, p3 };
    }


    /**
     * Calculates the point on the entire spline curve at a given normalized time.
     * @param {number} t - Normalized position along the entire curve (0.0 to 1.0).
     * @returns {Array<number>} The interpolated 3D point [x, y, z].
     */
    getPoint(t) {
        const { t_local, p0, p1, p2, p3 } = this._getSegmentData(t);
        return this._interpolate(t_local, p0, p1, p2, p3, false);
    }
    
    /**
     * Calculates the tangent (direction vector) on the curve at a given normalized time.
     * This vector is not necessarily normalized (length = 1).
     * @param {number} t - Normalized position along the entire curve (0.0 to 1.0).
     * @returns {Array<number>} The 3D tangent vector [dx, dy, dz].
     */
    getTangent(t) {
        const { t_local, p0, p1, p2, p3 } = this._getSegmentData(t);
        return this._interpolate(t_local, p0, p1, p2, p3, true);
    }

    // --- Arc-Length Parameterization (for uniform movement) ---

    /**
     * Approximates the arc length of the entire spline.
     */
    _calculateArcLengths() {
        this._segmentLengths = [];
        this._totalLength = 0;
        const resolution = 10; // Steps per segment for approximation

        for (let i = 0; i < this.points.length - 1; i++) {
            let segmentLength = 0;
            let lastPoint = this.points[i];
            
            const p1 = this.points[i];
            const p2 = this.points[i + 1];
            const p0 = (i === 0) ? p1 : this.points[i - 1];
            const p3 = (i === this.points.length - 2) ? p2 : this.points[i + 2];
            
            for (let j = 1; j <= resolution; j++) {
                const t = j / resolution;
                // Interpolate for position (false)
                const currentPoint = this._interpolate(t, p0, p1, p2, p3, false);
                
                // 3D Distance: sqrt(dx^2 + dy^2 + dz^2)
                const dx = currentPoint[0] - lastPoint[0];
                const dy = currentPoint[1] - lastPoint[1];
                const dz = currentPoint[2] - lastPoint[2];
                
                segmentLength += Math.hypot(dx, dy, dz); 
                
                lastPoint = currentPoint;
            }
            this._segmentLengths.push(segmentLength);
            this._totalLength += segmentLength;
        }
    }
    
    /**
     * @returns {number} The approximate total length of the spline.
     */
    getTotalLength() {
        return this._totalLength;
    }
}