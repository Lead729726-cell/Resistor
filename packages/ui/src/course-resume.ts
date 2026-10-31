import {courseMissions,courseRevision,type CourseWorkbook} from '../../education/src/course-workbook';
import {readPreference,writePreference} from './ui-preferences';

// Navigation only: learner answers and engine evidence remain in the workbook store.
export const coursePositionKey='resistor.edu.course-position.v1';
export type CoursePosition={project_id:string;mission_id:string};
type PositionStorage=Parameters<typeof readPreference>[1];
const isWorkbook=(w:CourseWorkbook)=>w?.edition==='edu'&&w.schema_version===1&&w.course_revision===courseRevision&&typeof w.project_id==='string'&&!!w.project_id.trim();

export function parseCoursePositions(raw:string|null):CoursePosition[]{
 try{
  const value:unknown=JSON.parse(raw??'null');
  if(!value||typeof value!=='object')return [];
  const p=value as Record<string,unknown>;
  if(p.schema_version!==1||p.edition!=='edu'||p.course_revision!==courseRevision||!Array.isArray(p.positions))return [];
  const positions:CoursePosition[]=[];
  for(const item of p.positions){
   if(!item||typeof item!=='object'||typeof item.project_id!=='string'||!item.project_id.trim()||typeof item.mission_id!=='string'||!courseMissions.some(m=>m.id===item.mission_id)||positions.some(p=>p.project_id===item.project_id))continue;
   positions.push({project_id:item.project_id,mission_id:item.mission_id});
   if(positions.length===8)break;
  }
  return positions;
 }catch{return [];}
}

export function readCoursePosition(workbook:CourseWorkbook,source?:PositionStorage):number{
 if(!isWorkbook(workbook))return 0;
 const position=parseCoursePositions(readPreference(coursePositionKey,source)).find(p=>p.project_id===workbook.project_id);
 return position?Math.max(0,courseMissions.findIndex(m=>m.id===position.mission_id)):0;
}

export function writeCoursePosition(workbook:CourseWorkbook,index:number,source?:PositionStorage):boolean{
 if(!isWorkbook(workbook)||!Number.isInteger(index)||index<0||index>=courseMissions.length)return false;
 const positions=[{project_id:workbook.project_id,mission_id:courseMissions[index].id},...parseCoursePositions(readPreference(coursePositionKey,source)).filter(p=>p.project_id!==workbook.project_id)].slice(0,8);
 return writePreference(coursePositionKey,JSON.stringify({schema_version:1,edition:'edu',course_revision:courseRevision,positions}),source);
}
