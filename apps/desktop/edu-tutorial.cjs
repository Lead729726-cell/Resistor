const path=require('node:path');
const {existsSync}=require('node:fs');

// Fixed packaged media only. Renderer input cannot select a path or external URL.
async function openEduTutorial({rendererRoot,edition,openPath}){
 if(edition!=='edu')throw Error('Resistor Edu 전용 튜토리얼입니다.');
 const file=path.join(rendererRoot,'edu-study-tutorial','Resistor-Edu-AI-Study-KO.mp4');
 if(!existsSync(file))throw Error('이 빌드에는 자율학습 영상 파일이 없습니다. 제공된 튜토리얼 MP4를 열거나 영상 포함 빌드를 준비하세요.');
 const error=await openPath(file);if(error)throw Error('기본 동영상 플레이어에서 열지 못했습니다: '+error);
 return {opened:true,edition:'edu',player:'system-default',paid_calls:0};
}
module.exports={openEduTutorial};
