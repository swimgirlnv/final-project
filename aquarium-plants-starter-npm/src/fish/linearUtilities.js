// 3D Vector Operations
export const vec3 = {
    // Subtracts vector b from vector a and stores in out (a - b)
    subtract: (out, a, b) => {
        out[0] = a[0] - b[0];
        out[1] = a[1] - b[1];
        out[2] = a[2] - b[2];
        return out;
    },
    // Normalizes a vector (makes its length 1)
    normalize: (out, a) => {
        let x = a[0];
        let y = a[1];
        let z = a[2];
        let len = Math.hypot(x, y, z);
        if (len > 0) {
            len = 1 / len;
        }
        out[0] = x * len;
        out[1] = y * len;
        out[2] = z * len;
        return out;
    },
    // Computes the cross product of two vectors (a x b)
    cross: (out, a, b) => {
        let ax = a[0], ay = a[1], az = a[2];
        let bx = b[0], by = b[1], bz = b[2];
        out[0] = ay * bz - az * by;
        out[1] = az * bx - ax * bz;
        out[2] = ax * by - ay * bx;
        return out;
    },
    // Adds two vectors (a + b)
    add: (out, a, b) => {
        out[0] = a[0] + b[0];
        out[1] = a[1] + b[1];
        out[2] = a[2] + b[2];
        return out;
    }
};

// 4x4 Matrix Operations
export const mat4 = {
    // Creates a new 4x4 identity matrix (same as your existing identity function)
    create: () => {
        return [
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            0, 0, 0, 1
        ];
    },

    // Generates a look-at matrix with the given eye position, center point, and up direction.
    // Equivalent to gl-matrix's mat4.lookAt(out, eye, center, up)
    lookAt: (out, eye, center, up) => {
        let x0, x1, x2, y0, y1, y2, z0, z1, z2, len;
        
        let eyex = eye[0], eyey = eye[1], eyez = eye[2];
        let upx = up[0], upy = up[1], upz = up[2];
        let centerx = center[0], centery = center[1], centerz = center[2];
        
        // Z-axis (Forward)
        // z = normalize(eye - center)
        z0 = eyex - centerx;
        z1 = eyey - centery;
        z2 = eyez - centerz;

        len = 1 / Math.hypot(z0, z1, z2);
        z0 *= len;
        z1 *= len;
        z2 *= len;

        // X-axis (Right)
        // x = normalize(cross(up, z))
        x0 = upy * z2 - upz * z1;
        x1 = upz * z0 - upx * z2;
        x2 = upx * z1 - upy * z0;
        
        len = Math.hypot(x0, x1, x2);
        if (len > 0) {
            len = 1 / len;
        }
        x0 *= len;
        x1 *= len;
        x2 *= len;

        // Y-axis (Up)
        // y = cross(z, x)
        y0 = z1 * x2 - z2 * x1;
        y1 = z2 * x0 - z0 * x2;
        y2 = z0 * x1 - z1 * x0;

        // The View Matrix
        out[0] = x0; out[1] = y0; out[2] = z0; out[3] = 0;
        out[4] = x1; out[5] = y1; out[6] = z1; out[7] = 0;
        out[8] = x2; out[9] = y2; out[10] = z2; out[11] = 0;
        out[12] = -(x0 * eyex + x1 * eyey + x2 * eyez);
        out[13] = -(y0 * eyex + y1 * eyey + y2 * eyez);
        out[14] = -(z0 * eyex + z1 * eyey + z2 * eyez);
        out[15] = 1;

        return out;
    }
};