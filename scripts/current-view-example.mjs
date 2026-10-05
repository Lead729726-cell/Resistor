import {spawn} from 'node:child_process';
const child=spawn('docker',['exec','mos-studio-eda','python3','/workspace/workers/eda/build_current_example.py'],{stdio:'inherit',windowsHide:true});child.on('exit',code=>process.exitCode=code??1);
