export const config = {
  count: 65536, speed: 0.12, repulsion: 0.65, radius: 0.13,
  breathing: 1.0, stage: 4, silk: 0.65, memories: true, exposure: 1.35,
  memoryCount:5,memoryInterval:8,memorySpeed:.023,bodyTextSlowdown:.08,captureRadius:.18,captureHold:.7,memoryReleaseTime:3.5,
  noise: 0.65, trails: 0.94, size: 2.2,
  palette:'tealViolet',secondaryRatio:.20,saturation:1.0,colorSpeed:1.0,interactionColor:.65,bloom:.28,
  color: '#43b6aa', accent: '#e5b979', recovery: 1.8,
  demo: false, mirror: true, showMask: false, inferenceFps: 20,
  constellation: true, nodeSize: 6.0, nodeBrightness: 1.0,
  connectionOpacity: .38, poseSmoothing: .10, constellationTrails: .65, wristAttraction: .65,
  bodyStarDensity: .82, bodyWeb: .75, bodyAura: .8,
  wakeEnabled:true,wakeMode:'composite',wakeInput:'pose',wakeThreshold:.045,wakeSmoothing:.22,
  wakeInterval:1.2,wakeSpacing:.10,wakeRadius:.11,wakeRotation:.10,wakeDirection:'alternating',
  wakeLifetime:10,wakeExpansion:.055,wakeDissipation:1.3,wakeAdvection:.65,wakeDensity:.75,wakeMaximum:3,riverProtection:.85,
};
export type RiverConfig = typeof config;
