export interface MemoryRecord {
  id: string;
  name?: string;
  year?: string;
  major?: string;
  message: string;
}
// Exhibition studies only: no real student data.
export const studyMemories: MemoryRecord[] = [
  { id:'study-1',name:'林同学',year:'2026',major:'视觉传达',message:'愿你始终热爱' },
  { id:'study-2',name:'陈同学',year:'2026',major:'数字媒体',message:'山海自有归期' },
  { id:'study-3',year:'2026',message:'把青春写进远方' },
];
