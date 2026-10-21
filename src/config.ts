export const config = {
  count: 65536, speed: 0.12, repulsion: 0.65, radius: 0.13,
  breathing: 1.0, stage: 4, silk: 0.65, memories: true, exposure: 1.35,
  noise: 0.65, trails: 0.94, size: 2.2,
  color: '#43b6aa', accent: '#e5b979', recovery: 1.8,
  demo: false, mirror: true, showMask: false, inferenceFps: 20,
  constellation: true, nodeSize: 6.0, nodeBrightness: 1.0,
  connectionOpacity: .38, poseSmoothing: .10, constellationTrails: .65, wristAttraction: .65,
};
export type RiverConfig = typeof config;
