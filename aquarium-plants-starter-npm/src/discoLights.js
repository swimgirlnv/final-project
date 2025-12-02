// discoLights.js - Dancing colored lights for disco mode

export function createDiscoLights() {
  const lights = [];
  const numLights = 6;
  
  // Initialize lights with random properties
  for (let i = 0; i < numLights; i++) {
    lights.push({
      x: Math.random() * 4 - 2,
      y: Math.random() * 3 + 0.5,
      z: Math.random() * 4 - 2,
      hue: Math.random(),
      speed: 0.3 + Math.random() * 0.4,
      phase: Math.random() * Math.PI * 2,
      orbitRadius: 0.5 + Math.random() * 1.5,
      intensity: 0.6 + Math.random() * 0.4,
    });
  }
  
  // Initialize spotlight cones
  const spotlights = [];
  const numSpotlights = 4;
  
  for (let i = 0; i < numSpotlights; i++) {
    spotlights.push({
      x: 0,
      y: 3.5, // High above the scene
      z: 0,
      dirX: 0,
      dirY: -1,
      dirZ: 0,
      hue: Math.random(),
      speed: 0.2 + Math.random() * 0.3,
      phase: Math.random() * Math.PI * 2,
      sweepRadius: 1.5 + Math.random() * 1.0,
      intensity: 0.8 + Math.random() * 0.4,
      coneAngle: 0.3 + Math.random() * 0.2, // in radians
    });
  }
  
  let enabled = false;
  
  function update(time) {
    if (!enabled) return;
    
    lights.forEach((light, i) => {
      const t = time * light.speed + light.phase;
      
      // Circular orbit motion
      light.x = Math.cos(t) * light.orbitRadius;
      light.z = Math.sin(t) * light.orbitRadius;
      
      // Bob up and down
      light.y = 1.5 + Math.sin(t * 1.3) * 0.8;
      
      // Slowly shift hue
      light.hue = (light.hue + 0.001) % 1.0;
    });
    
    // Update spotlights
    spotlights.forEach((spot, i) => {
      const t = time * spot.speed + spot.phase;
      
      // Sweep in circular patterns
      const targetX = Math.cos(t) * spot.sweepRadius;
      const targetZ = Math.sin(t) * spot.sweepRadius;
      const targetY = -0.5; // Point towards the floor
      
      // Calculate direction vector
      const dx = targetX - spot.x;
      const dy = targetY - spot.y;
      const dz = targetZ - spot.z;
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      
      spot.dirX = dx / len;
      spot.dirY = dy / len;
      spot.dirZ = dz / len;
      
      // Shift hue
      spot.hue = (spot.hue + 0.0008) % 1.0;
    });
  }
  
  function getLights() {
    if (!enabled) return [];
    
    return lights.map(light => {
      const hue = light.hue;
      const r = hslToRgb(hue, 1.0, 0.5)[0];
      const g = hslToRgb(hue, 1.0, 0.5)[1];
      const b = hslToRgb(hue, 1.0, 0.5)[2];
      
      return {
        position: [light.x, light.y, light.z],
        color: [r * light.intensity, g * light.intensity, b * light.intensity],
      };
    });
  }
  
  function getSpotlights() {
    if (!enabled) return [];
    
    return spotlights.map(spot => {
      const hue = spot.hue;
      const r = hslToRgb(hue, 1.0, 0.5)[0];
      const g = hslToRgb(hue, 1.0, 0.5)[1];
      const b = hslToRgb(hue, 1.0, 0.5)[2];
      
      return {
        position: [spot.x, spot.y, spot.z],
        direction: [spot.dirX, spot.dirY, spot.dirZ],
        color: [r * spot.intensity, g * spot.intensity, b * spot.intensity],
        coneAngle: Math.cos(spot.coneAngle), // Pass cosine for dot product comparison
      };
    });
  }
  
  function setEnabled(value) {
    enabled = !!value;
  }
  
  function isEnabled() {
    return enabled;
  }
  
  return {
    update,
    getLights,
    getSpotlights,
    setEnabled,
    isEnabled,
  };
}

// Helper function to convert HSL to RGB
function hslToRgb(h, s, l) {
  let r, g, b;
  
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  
  return [r, g, b];
}
