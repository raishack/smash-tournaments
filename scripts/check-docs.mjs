import fs from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd();
const files=['README.md',...(await fs.readdir('docs/en')).filter(f=>f.endsWith('.md')).map(f=>'docs/en/'+f)];
const errors=[];
for(const file of files){
  const text=await fs.readFile(file,'utf8');
  for(const match of text.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)){
    const target=match[1].split('#')[0];
    if(!target||/^[a-z]+:/i.test(target))continue;
    const resolved=path.resolve(path.dirname(path.resolve(root,file)),target);
    if(!resolved.startsWith(root+path.sep)||!await fs.stat(resolved).then(()=>true,()=>false))errors.push(file+': missing '+target);
  }
}
if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}
else console.log(`Documentation links and image files checked in ${files.length} Markdown files.`);
