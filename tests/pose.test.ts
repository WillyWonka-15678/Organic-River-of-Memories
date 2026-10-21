import {describe,it,expect} from 'vitest';
import {mapPose,PoseTrack,type CameraLandmark} from '../src/interaction/PoseTrack';
function fixture():CameraLandmark[]{
  const points=Array.from({length:33},()=>({x:.5,y:.5,visibility:.95}));
  points[11]={x:.4,y:.35,visibility:.95};points[12]={x:.6,y:.35,visibility:.95};
  points[15]={x:.28,y:.48,visibility:.95};points[16]={x:.75,y:.4,visibility:.95};
  points[23]={x:.44,y:.65,visibility:.95};points[24]={x:.56,y:.65,visibility:.95};return points;
}
describe('单人人体星座跟踪',()=>{
  it('共用已镜像的相机坐标，只翻转 y，不再次翻转左右',()=>{
    const p=mapPose([{x:.2,y:.25,visibility:.9},{x:NaN,y:.4,visibility:1}]);
    expect(p[0].x).toBe(.2);expect(p[0].y).toBe(.75);expect(p[1].confidence).toBe(0);
  });
  it('派生胸颈髋与父关节严格对齐，手腕可产生有效影响',()=>{
    const track=new PoseTrack();for(let i=1;i<=60;i++)track.update(mapPose(fixture()),i*16,i*16,.016,.1,16/9);
    expect(track.joints[33].x).toBeCloseTo((track.joints[11].x+track.joints[12].x)/2);
    expect(track.joints[35].y).toBeCloseTo((track.joints[23].y+track.joints[24].y)/2);
    expect(track.wrist(0).strength).toBeGreaterThan(.2);
  });
  it('静止后逐渐解体，运动再次唤起星座',()=>{
    const track=new PoseTrack();let early=0;
    for(let i=1;i<=600;i++){
      track.update(mapPose(fixture()),i*16,i*16,.016,.1,16/9);
      if(i===100)early=track.formation;
    }
    expect(early).toBeGreaterThan(.3);expect(track.formation).toBeLessThan(.03);
    for(let i=601;i<=680;i++){
      const points=fixture();points[15].y+=Math.sin(i*.13)*.08;
      track.update(mapPose(points),i*16,i*16,.016,.1,16/9);
    }
    expect(track.formation).toBeGreaterThan(.3);
  });
  it('失去跟踪平滑淡出，低置信度关节不会产生手腕力',()=>{
    const track=new PoseTrack();for(let i=1;i<=60;i++)track.update(mapPose(fixture()),i*16,i*16,.016,.1,16/9);
    const before=track.formation;
    track.update([],1000,1000,.016,.1,16/9);expect(track.formation).toBeGreaterThan(before*.8);
    for(let i=1;i<=240;i++)track.update([],1000+i*16,1000+i*16,.016,.1,16/9);
    expect(track.wrist(0).strength).toBeLessThan(.001);expect(track.visibleNodes).toBe(0);
  });
  it('拒绝关节离群跳变和画外点，避免画出长距离错误连接',()=>{
    const track=new PoseTrack();for(let i=1;i<=60;i++)track.update(mapPose(fixture()),i*16,i*16,.016,.1,16/9);
    const previous=track.joints[15].x,points=fixture();points[15].x=.95;points[27].x=2;
    track.update(mapPose(points),976,976,.016,.1,16/9);
    expect(track.joints[15].x).toBeCloseTo(previous);expect(track.joints[27].confidence).toBeLessThan(.95);
  });
});
