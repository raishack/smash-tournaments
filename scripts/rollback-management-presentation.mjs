import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
// Only the presentation switch changes. Versions, data, search and review stay intact.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const mode=process.argv[2];
if(!['--classic','--adaptive','--check'].includes(mode))throw Error('Usage: node scripts/rollback-management-presentation.mjs --classic | --adaptive | --check');
const ios=['ios-manage-main/GestorTorneosMainIOS','ios-manage/GestorTorneosSmashIOS','ios-manage/TournamentManagerIOS'].find(p=>fs.existsSync(path.join(root,p)));
const targets=[['android/shared-ui/src/main/kotlin/com/gestortorneos/ui/MainPresentation.kt',/const val forceClassicPresentation = (true|false)/], [ios+'/AppViews.swift',/static let forceClassic = (true|false)/]];
// Validate every file before any edit, so a changed source layout fails safely.
const edits=targets.map(([file,pattern])=>{const full=path.join(root,file),text=fs.readFileSync(full,'utf8'),match=text.match(pattern);if(!match)throw Error('Rollback switch not found: '+file);return {file,full,text,pattern,match};});
async function replaceFile(file,text) {
 const temp=file+'.presentation-rollback-'+process.pid+'.tmp';
 try {
  fs.writeFileSync(temp,text,{flag:'wx'});
  for(let attempt=0;;attempt++) {
   try { fs.renameSync(temp,file);return; }
   catch(error) {
    if(attempt>=5||!['EPERM','EBUSY','EACCES','UNKNOWN'].includes(error.code))throw error;
    await new Promise(resolve=>setTimeout(resolve,100*(attempt+1)));
   }
  }
 } finally { if(fs.existsSync(temp))fs.unlinkSync(temp); }
}
const changed=[];
try { for(const edit of edits){
 if(mode==='--check'){console.log(edit.file+': '+(edit.match[1]==='true'?'classic forced':'user preference (adaptive by default)'));continue;}
 const next=edit.text.replace(edit.pattern,edit.match[0].replace(/(true|false)$/,String(mode==='--classic')));
 if(next!==edit.text){await replaceFile(edit.full,next);changed.push(edit);}
 console.log(edit.file+': '+mode.slice(2));
}}catch(error){
 const failed=[];
 for(const edit of changed.reverse())try{await replaceFile(edit.full,edit.text);}catch{failed.push(edit.file);}
 if(failed.length)throw Error('Could not restore these switches after an error: '+failed.join(', '),{cause:error});
 throw Error('Rollback not applied; original switches restored.',{cause:error});
}
if(mode!=='--check')console.log('Source changed. Rebuild and publish separately. Existing app: use Appearance → Adaptive layout for an immediate local rollback.');
