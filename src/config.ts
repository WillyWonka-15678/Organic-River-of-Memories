export const config = {
  count: 65536, speed: 0.21, repulsion: 1.0, radius: 0.08,
  waveAmplitude: 0.024, waveLength: 1.35, waveSpeed: 0.10,
  noise: 0.08, trails: 0.95, size: 2.0,
  color: '#91ead7', accent: '#e7b77a', recovery: 0.65,
  demo: false, mirror: true, showMask: false, inferenceFps: 20,
};
export type RiverConfig = typeof config;
