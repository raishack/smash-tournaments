import { render, size, safeImage } from './top8-render.js?v=20260925-access';
import { loadIndex, loadGame, prepareDesign, collectionFor, selectionFor, imageUrl, artworkIssues, useCollection, openPicker, normalize } from './top8-library.js?v=20260925-access';
const $ = id => document.getElementById(id);
const textFields=['title','subtitle','footer','layout','ratio','font','artFit','backgroundColor','cardColor','textColor','accentColor'];
const numberFields=['nameSize','shade','cardOpacity','logoSize'];
let accessToken='',cloudRevision=0,cloudBusy=false,editRevision=0;
let libraryIndex={games:[]},artworkGame={id:'custom',characters:[],collections:[]},libraryBusy=false,mountRevision=0;
let data,design,savedDraft,saveTimer,renderRevision=0,loadingAsset=false,exporting=false;
const id=new URLSearchParams(location.search).get('tournamentId');
const session=new URLSearchParams(location.hash.slice(1)).get('session');
function status(text){$('status').textContent=text;}
function exportState(){$('export').disabled=loadingAsset||libraryBusy||exporting;}
const db=new Promise((resolve,reject)=>{const r=indexedDB.open('gt-main-top8',1);r.onupgradeneeded=()=>r.result.createObjectStore('drafts');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
// Storage may be disabled in private browsers. Editing and file export still work.
db.catch(()=>{});
async function storage(value){const database=await db;return new Promise((resolve,reject)=>{const tx=database.transaction('drafts',value?'readwrite':'readonly');const r=value?tx.objectStore('drafts').put(value,id):tx.objectStore('drafts').get(id);tx.oncomplete=()=>resolve(r.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
function initial(payload){return {title:payload.title+' · Top '+(payload.topCount??payload.players.length),subtitle:payload.gameTitle+' · '+new Date(payload.date).toLocaleDateString('en-US'),footer:payload.participantCount+(payload.teamTournament?' teams':' participants')+' · Smash Tournaments',layout:payload.teamTournament?'teams':'podium',ratio:payload.teamTournament&&payload.players.length>2?'portrait':'wide',game:payload.game,collection:'',artFit:'contain',font:'sans-serif',nameSize:38,shade:10,cardOpacity:100,logoSize:240,backgroundColor:'#111e35',cardColor:'#1d304e',textColor:'#ffffff',accentColor:'#f4c65a',background:'',logo:'',players:payload.players.map(p=>({id:p.id,name:p.name,placement:p.placement,characters:p.characters.map(c=>String(c.id)),roster:(p.roster||[]).map(m=>(m.role==='RESERVE'?'Reserve: ':'Starter: ')+m.nickname).join(' · '),extra:'',portrait:'',x:50,y:50,zoom:1}))};}
function project(){return {version:2,tournamentId:id,data,design,cloudRevision};}
function validateProject(p){
  if(!p||![1,2].includes(p.version)||p.tournamentId!==id||!p.data||p.data.tournamentId!==id||!p.design)throw Error('The project does not belong to this tournament or is incompatible.');
  const d=p.design;const enumField=(k,values)=>{if(!values.includes(d[k]))throw Error('Invalid design option: '+k);};
  for(const k of ['title','subtitle','footer'])if(typeof d[k]!=='string'||d[k].length>180)throw Error('Invalid project text');
  for(const k of ['backgroundColor','cardColor','textColor','accentColor'])if(!/^#[a-f0-9]{6}$/i.test(d[k]))throw Error('Invalid color');
  enumField('font',['sans-serif','serif','monospace']);enumField('ratio',['wide','square','portrait']);enumField('layout',['podium','grid','teams']);if(typeof d.game!=='string'||!/^[a-z0-9_-]{1,50}$/.test(d.game))throw Error('Invalid game');
  if(d.collection!==undefined&&(typeof d.collection!=='string'||!/^[a-zA-Z0-9_-]{0,100}$/.test(d.collection)))throw Error('Invalid collection');
  if(d.artFit!==undefined&&!['contain','cover'].includes(d.artFit))throw Error('Invalid crop');
  if(!Number.isFinite(d.nameSize)||d.nameSize<24||d.nameSize>60||!Number.isFinite(d.shade)||d.shade<0||d.shade>90)throw Error('Invalid size or opacity');
  for(const [key,min,max] of [['cardOpacity',0,100],['logoSize',100,360]])if(d[key]!==undefined&&(!Number.isFinite(d[key])||d[key]<min||d[key]>max))throw Error('Invalid size or opacity');
  const asset=v=>{if(v!==''&&(!safeImage(v)||!v.startsWith('data:')||v.length>16000000))throw Error('Invalid project image');};asset(d.background);asset(d.logo);
  if(!Array.isArray(d.players)||d.players.length>8)throw Error('The poster supports up to eight players');
  for(const row of d.players){
    if(row.roster!==undefined&&(typeof row.roster!=='string'||row.roster.length>4000))throw Error('Invalid roster');
    if(typeof row.name!=='string'||row.name.length>120||typeof row.extra!=='string'||row.extra.length>100)throw Error('Invalid player');
    if(row.placement!==null&&(!Number.isInteger(row.placement)||row.placement<1||row.placement>100000))throw Error('Invalid placement');
    if(!Array.isArray(row.characters)||row.characters.length>4||row.characters.some(c=>typeof c!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(c)))throw Error('Invalid characters');
    if(row.skins!==undefined&&(!Array.isArray(row.skins)||row.skins.length>4||row.skins.some(v=>typeof v!=='string'||!/^\d{1,8}$/.test(v))))throw Error('Invalid variants');
    if('collection' in row)throw Error('The entire poster must use the same collection');
    for(const k of ['x','y'])if(!Number.isFinite(row[k])||row[k]<0||row[k]>100)throw Error('Invalid crop');
    if(!Number.isFinite(row.zoom)||row.zoom<1||row.zoom>3)throw Error('Invalid zoom');asset(row.portrait);
  }
  // Catalog comes only from the server or its saved snapshot; never fetch arbitrary image URLs.
  if(!p.data.catalog||typeof p.data.catalog!=='object')throw Error('Invalid catalog');
  for(const game of ['smash','rivals','custom']){
    const entries=p.data.catalog[game];if(!Array.isArray(entries)||entries.length>200)throw Error('Invalid catalog');
    for(const c of entries)if(typeof c.name!=='string'||c.name.length>80||!Number.isInteger(c.id)||(c.image!==''&&!/^\/assets\/(smash|roa2)-stock-icons\/[a-z0-9_]+\.png$/.test(c.image)))throw Error('Invalid character');
  }
  if(!Array.isArray(p.data.warnings)||p.data.warnings.some(w=>typeof w!=='string'||w.length>500))throw Error('Invalid notification settings');
  return p;
}
function save(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>storage(project()).then(()=>{$('saved').textContent='Design saved in this browser.';}).catch(()=>{$('saved').textContent='Could not save here. Download the project to keep it.';}),500);}
function imageGuidance(){const [w,h]=size(design.ratio,Number($('resolution').value));$('background-guidance').textContent=`Recommended background: ${w} × ${h} px, matching the poster format. PNG, JPG or WebP, up to 10 MB. Cropped to fill the background.`;}
async function preview(){
  imageGuidance();
  const revision=++renderRevision;const snapshot=structuredClone(design);
  try{const canvas=document.createElement('canvas');await render(canvas,snapshot,artworkGame,.6,()=>revision===renderRevision);if(revision!==renderRevision)return;const dest=$('preview');dest.width=canvas.width;dest.height=canvas.height;dest.getContext('2d').drawImage(canvas,0,0);const [w,h]=size(design.ratio,Number($('resolution').value));$('dimensions').textContent=w+' × '+h+' px';}
  catch(error){if(revision===renderRevision)status(error.message);}
}
function updateWarnings(){
  const warnings=[...(data?.warnings||[]),...artworkIssues(design,artworkGame)];
  if(design.players.some(p=>!p.portrait&&p.characters.some((_,i)=>{const asset=selectionFor(design,artworkGame,p,i);return asset&&Math.max(asset.width,asset.height)<512;})))warnings.push('This collection includes low-resolution artwork. Exporting at 4K does not add detail; choose another collection or upload your own images.');
  $('warnings').textContent=[...new Set(warnings)].join('\n');$('warnings').hidden=!warnings.length;
}
function change(){editRevision++;updateWarnings();void preview();save();}
function button(label,action){const el=document.createElement('button');el.className='secondary';el.type='button';el.textContent=label;el.addEventListener('click',action);return el;}
function field(parent,label,value,onInput,type='text',attrs={}){
  const container=document.createElement('label');container.textContent=label;const input=document.createElement('input');input.type=type;Object.assign(input,attrs);input.value=value??'';input.addEventListener('input',()=>onInput(input.value));container.append(input);parent.append(container);return input;
}
async function readImage(file){
  if(!file)return '';if(file.size>10000000||!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('Use a PNG, JPG or WebP image of up to 10 MB.');
  const url=URL.createObjectURL(file);
  try{const img=new Image();await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('Could not open that image'));img.src=url;});
    if(img.width*img.height>64000000)throw Error('The image is too large. Use a copy of up to 64 megapixels.');
    const s=Math.min(1,4096/Math.max(img.width,img.height));const canvas=document.createElement('canvas');canvas.width=Math.round(img.width*s);canvas.height=Math.round(img.height*s);canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);const result=canvas.toDataURL('image/png');if(result.length>12000000)throw Error('The processed image is too large. Use a smaller copy.');return result;
  }finally{URL.revokeObjectURL(url);}
}
async function upload(file,apply){if(loadingAsset||!file)return;loadingAsset=true;exportState();try{const result=await readImage(file);apply(result);change();}catch(e){status(e.message);}finally{loadingAsset=false;exportState();}}
function playerFields(){
  const expanded=new Set([...$('players').children].flatMap((el,i)=>el.querySelector('details')?.open?[i]:[]));
  $('players').replaceChildren();
  design.players.forEach((row,index)=>{
    const block=document.createElement('section');block.className='player';const heading=document.createElement('div');heading.className='player-heading';const name=document.createElement('strong');name.textContent=(data.teamTournament?'Team ':'Player ')+(index+1);heading.append(name);
    const move=offset=>{const next=index+offset;if(next<0||next>=design.players.length)return;[design.players[index],design.players[next]]=[design.players[next],design.players[index]];playerFields();change();};
    const up=button('↑',()=>move(-1));up.setAttribute('aria-label','Move player up '+(index+1));up.disabled=index===0;const down=button('↓',()=>move(1));down.setAttribute('aria-label','Move player down '+(index+1));down.disabled=index===design.players.length-1;heading.append(up,down);block.append(heading);
    field(block,'Placement',row.placement,v=>{row.placement=v===''?null:Number(v);change();},'number',{min:'1',max:'100000'});
    field(block,'Name',row.name,v=>{row.name=v;change();},'text',{maxLength:120});
    if(data.teamTournament||design.layout==='teams')field(block,'Roster (separate with ·)',row.roster||'',v=>{row.roster=v;change();},'text',{maxLength:4000});
    field(block,'Additional text / social handles',row.extra,v=>{row.extra=v;change();},'text',{maxLength:100});
    const chars=document.createElement('details');const summary=document.createElement('summary');summary.textContent='Characters and image';chars.append(summary);
    chars.open=expanded.has(index);
    const collection=collectionFor(design,artworkGame);
    row.characters.forEach((characterId,slot)=>{
      const character=artworkGame.characters.find(c=>c.id===characterId),variant=selectionFor(design,artworkGame,row,slot);
      const item=document.createElement('div');item.className='character-slot';
      const img=document.createElement('img');img.alt='';img.loading='lazy';if(variant)img.src=imageUrl(variant.image,'thumb');else img.hidden=true;img.onerror=()=>{img.hidden=true;};
      const info=document.createElement('div');info.className='slot-info';info.textContent=(character?.name||characterId)+' · '+(variant?.label||'No image in this collection');if(!variant)info.classList.add('missing');
      const actions=document.createElement('div');actions.className='slot-actions';
      const pick=button('Change character',()=>openPicker({game:artworkGame,collection,selected:characterId,onSelect:(c,v)=>{row.characters[slot]=c;row.skins[slot]=v;playerFields();change();}}));pick.disabled=!collection||libraryBusy;
      const skin=button('Choose variant',()=>openPicker({game:artworkGame,collection,character,selected:row.skins[slot],onSelect:(_,v)=>{row.skins[slot]=v;playerFields();change();}}));skin.disabled=!character||!collection?.characters[characterId]?.length||libraryBusy;
      actions.append(pick,skin,button('Remove character',()=>{row.characters.splice(slot,1);row.skins.splice(slot,1);playerFields();change();}));item.append(img,info,actions);chars.append(item);
    });
    const addCharacter=button('Add character',()=>openPicker({game:artworkGame,collection,onSelect:(c,v)=>{row.characters.push(c);row.skins.push(v);playerFields();change();}}));addCharacter.disabled=row.characters.length>=4||!collection||libraryBusy;chars.append(addCharacter);
    if(row.portrait){const custom=document.createElement('img');custom.src=row.portrait;custom.className='custom-preview';custom.alt='Custom image for '+row.name;chars.append(custom);const note=document.createElement('p');note.className='hint';note.textContent='The custom image replaces characters on this card.';chars.append(note);}
    const fileLabel=document.createElement('label');fileLabel.textContent=data.teamTournament?'Team logo':'Portrait / custom image';const input=document.createElement('input');input.type='file';input.accept='image/png,image/jpeg,image/webp';input.addEventListener('change',()=>upload(input.files[0],value=>{row.portrait=value;playerFields();}));fileLabel.append(input);chars.append(fileLabel);const guidance=document.createElement('p');guidance.className='hint';guidance.textContent='Recommended custom image: at least 1024 × 1024 px; 2048 px for 8K exports. Transparent PNG for logos; adjust portrait position and zoom. Up to 10 MB.';chars.append(guidance);
    field(chars,'Horizontal position',row.x,v=>{row.x=Number(v);change();},'range',{min:'0',max:'100'});
    field(chars,'Vertical position',row.y,v=>{row.y=Number(v);change();},'range',{min:'0',max:'100'});
    field(chars,'Image zoom',row.zoom,v=>{row.zoom=Number(v);change();},'range',{min:'1',max:'3',step:'.05'});
    const actions=document.createElement('div');actions.className='actions';actions.append(button('Reset framing',()=>{row.x=50;row.y=50;row.zoom=1;playerFields();change();}),button('Remove image',()=>{row.portrait='';playerFields();change();}),button('Remove player',()=>{design.players.splice(index,1);playerFields();change();}));chars.append(actions);block.append(chars);$('players').append(block);
  });$('add-player').disabled=design.players.length>=8;
}
function gameOptions(){
  const select=$('game'),query=normalize($('game-search').value);select.replaceChildren(new Option('Custom images','custom'));
  for(const game of libraryIndex.games)if(game.id===design.game||normalize(game.name+' '+game.id).includes(query))select.add(new Option(game.name,game.id));
  if(![...select.options].some(o=>o.value===design.game))select.add(new Option(design.game,design.game));select.value=design.game;
}
function collectionFields(){
  gameOptions();const select=$('collection');select.replaceChildren();
  for(const collection of artworkGame.collections)select.add(new Option(collection.name+' · '+Object.keys(collection.characters).length+' characters',collection.id));
  select.value=design.collection;select.disabled=!artworkGame.collections.length||libraryBusy;
  const current=collectionFor(design,artworkGame);$('collection-gallery').replaceChildren();
  for(const collection of artworkGame.collections.slice(0,8)){
    const sample=collection.characters[design.players.flatMap(p=>p.characters).find(c=>collection.characters[c])]?.[0]||Object.values(collection.characters)[0]?.[0];
    const tile=button('',()=>chooseCollection(collection.id));tile.className='collection-tile';tile.setAttribute('aria-pressed',String(collection.id===design.collection));tile.disabled=libraryBusy;
    const img=document.createElement('img');img.alt='';img.loading='lazy';if(sample)img.src=imageUrl(sample.image,'thumb');img.onerror=()=>{img.hidden=true;};
    const title=document.createElement('strong');title.textContent=collection.name;const hint=document.createElement('small');hint.textContent=collection.kind==='icon'?'Icons':collection.kind==='artwork'?'Character artwork':'Portraits';tile.append(img,title,hint);$('collection-gallery').append(tile);
  }
  $('collection-info').textContent=current?`${Object.keys(current.characters).length} characters available. ${current.description}\nChanging collections updates all players; custom images are kept.`:design.game==='custom'?'Upload images for each player, the background or the logo.':'Could not load the collection.';
  $('collection-credits').textContent=current?.credits||artworkGame.credits||'This collection lists no additional credits. Check its source page.';
  $('collection-source').hidden=!current;if(current)$('collection-source').href=current.source;
}
function chooseCollection(id){if(libraryBusy)return;try{const changed=useCollection(design,artworkGame,id);collectionFields();playerFields();change();status('Collection applied to the entire poster.'+(changed?' Unavailable variants have been adjusted.':''));}catch(error){status(error.message);}}
async function mount(){
  design.cardOpacity??=design.background?35:100;design.logoSize??=240;
  const revision=++mountRevision;
  try{libraryIndex=await loadIndex();const game=await prepareDesign(design,data);if(revision!==mountRevision)return;artworkGame=game;}
  catch(error){if(revision!==mountRevision)return;artworkGame={id:design.game,characters:[],collections:[]};status(error.message);}
  for(const row of design.players)row.skins||=[];
  for(const k of [...textFields,...numberFields])$(k).value=design[k];
  collectionFields();playerFields();$('editor').hidden=false;$('restore').hidden=true;updateWarnings();void preview();
}
$('game-search').addEventListener('input',gameOptions);
$('collection').addEventListener('change',()=>chooseCollection($('collection').value));
$('game').addEventListener('change',async()=>{
  const next=$('game').value;if(libraryBusy||next===design.game)return;
  if(design.players.some(p=>p.characters.length)&&!confirm('Changing the game clears selected characters. Players and custom images are kept. Continue?')){gameOptions();return;}
  libraryBusy=true;$('game').disabled=true;$('collection').disabled=true;$('export').disabled=true;
  try{const game=await loadGame(next);design.game=next;design.collection='';design.players.forEach(p=>{p.characters=[];p.skins=[];});artworkGame=game;if(game.collections.length)useCollection(design,game,game.collections[0].id);status('Library game updated.');}
  catch(error){status(error.message);}
  finally{libraryBusy=false;$('game').disabled=false;exportState();collectionFields();playerFields();change();}
});
$('library-retry').onclick=async()=>{await mount();};
function download(blob,filename){const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
for(const key of [...textFields,...numberFields])$(key).addEventListener('input',()=>{if(!design)return;design[key]=numberFields.includes(key)?Number($(key).value):$(key).value;if(key==='layout')playerFields();change();});
$('resolution').addEventListener('change',()=>{void preview();});
for(const kind of ['background','logo']){
  $(kind+'-file').addEventListener('change',()=>upload($(kind+'-file').files[0],value=>{design[kind]=value;if(kind==='background'&&value){design.shade=10;design.cardOpacity=35;$('shade').value=10;$('cardOpacity').value=35;}}));
  $('clear-'+kind).addEventListener('click',()=>{design[kind]='';change();});
}
$('add-player').addEventListener('click',()=>{if(design.players.length>=8)return;design.players.push({id:crypto.randomUUID(),name:'',placement:null,characters:[],skins:[],extra:'',portrait:'',x:50,y:50,zoom:1});playerFields();change();});
$('save-project').addEventListener('click',()=>{download(new Blob([JSON.stringify(project())],{type:'application/json'}),'Smash Tournaments-top8-'+id+'.json');});
$('project-file').addEventListener('change',async()=>{try{const file=$('project-file').files[0];if(!file)return;if(file.size>80000000)throw Error('Project too large (maximum 80 MB)');const p=validateProject(JSON.parse(await file.text()));data=p.data;design=p.design;await mount();save();}catch(e){status(e.message);}});
$('restore-draft').addEventListener('click',async()=>{
  const fresh=data;design=savedDraft.design;
  // Repair only missing ranks from current official results; preserve deliberate edits and artwork.
  for(const player of design.players)if(player.placement===null){const current=fresh?.players.find(p=>p.id===player.id);if(current?.placement)player.placement=current.placement;}
  data=fresh||savedDraft.data;data.warnings=[...new Set([...(data.warnings||[]),'Design restored: available empty placements have been filled. Review placements you edited manually.'])];await mount();save();
});
$('new-draft').addEventListener('click',async()=>{await mount();save();});
$('export').addEventListener('click',async()=>{
  if(loadingAsset||libraryBusy||exporting)return;exporting=true;const button=$('export');exportState();button.textContent='Generating PNG…';
  try{if(!design.players.length||design.players.some(p=>!p.name.trim()||!Number.isInteger(p.placement)||p.placement<1||p.placement>100000))throw Error('Complete the name and placement of every player before exporting.');
    const issues=artworkIssues(design,artworkGame);if(issues.length)throw Error(issues.join('\n'));
    const canvas=document.createElement('canvas');const scale=Number($('resolution').value);const [w,h]=size(design.ratio,scale);if(w*h>64000000)throw Error('Use a lower resolution for this format (up to 64 megapixels).');
    await render(canvas,structuredClone(design),artworkGame,scale);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('This device could not generate an image this large. Try 4K or 1920 px.');
    download(blob,'Smash Tournaments-top8-'+id+'.png');canvas.width=1;canvas.height=1;status('PNG generated at '+w+' × '+h+' pixels.');
  }catch(e){status(e.message||'Could not export. Try a lower resolution.');}finally{exporting=false;exportState();button.textContent='Download PNG';}
});
async function cloud(path,body){
  if(!accessToken)throw Error('Reopen the editor from the app to access the server.');
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),60000);
  try{const response=await fetch('/api/top8/'+path,{method:body?'POST':'GET',credentials:'omit',cache:'no-store',headers:{Authorization:'Bearer '+accessToken,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:controller.signal});const result=await response.json();if(!response.ok)throw Error(result.message||'Could not access the server');return result;}finally{clearTimeout(timeout);}
}
async function cloudAction(fn){if(cloudBusy)return;cloudBusy=true;for(const id of ['cloud-save','cloud-load','refresh-results'])$(id).disabled=true;try{await fn();}catch(e){status(e.message);}finally{cloudBusy=false;for(const id of ['cloud-save','cloud-load','refresh-results'])$(id).disabled=false;}}
$('cloud-save').onclick=()=>cloudAction(async()=>{validateProject(project());const snapshot=structuredClone(design);const result=await cloud('project',{revision:cloudRevision,design:snapshot});cloudRevision=result.revision;await storage(project()).catch(()=>{});status(JSON.stringify(design)===JSON.stringify(snapshot)?'Design saved on the server. Available on your other devices.':'The submitted version was saved. You have newer unsent changes: select Save to server again.');});
// An async load must not silently discard changes made after its confirmation.
async function loadUnchangedDesign(path){
  const current=design,revision=editRevision;
  const result=await cloud(path);
  if(design!==current||editRevision!==revision)throw Error('You edited the design while loading. Your changes are preserved; click again if you want to replace them.');
  return result;
}
$('cloud-load').onclick=()=>cloudAction(async()=>{if(!confirm('Replace the open design with the server version? Download the project first if you want to keep it.'))return;const remote=await loadUnchangedDesign('project');if(!remote)throw Error('No design has been saved on the server yet');const p=validateProject(remote.project);cloudRevision=remote.revision;data=p.data;design=p.design;await mount();save();});
$('refresh-results').onclick=()=>cloudAction(async()=>{if(!confirm('Names, placements, characters and rosters will update. Colors, text, images and crops are preserved. Continue?'))return;const fresh=await loadUnchangedDesign('data'),defaults=initial(fresh);design.players=defaults.players.map(p=>({...design.players.find(old=>old.id===p.id),...p,skins:[],portrait:design.players.find(old=>old.id===p.id)?.portrait||'',x:design.players.find(old=>old.id===p.id)?.x??50,y:design.players.find(old=>old.id===p.id)?.y??50,zoom:design.players.find(old=>old.id===p.id)?.zoom??1,extra:design.players.find(old=>old.id===p.id)?.extra||''}));data=fresh;await mount();save();});
try{accessToken=sessionStorage.getItem('top-session:'+id)||'';}catch{}
async function boot(){
  if(!id||!/^[a-zA-Z0-9_-]{1,100}$/.test(id)){status('Open the poster from a completed tournament in the Smash Tournaments app.');return;}
  try{const saved=await storage();if(saved){savedDraft=validateProject(saved);cloudRevision=Number.isInteger(saved.cloudRevision)&&saved.cloudRevision>=0?saved.cloudRevision:0;}}catch{/* Use server data when storage is unavailable or invalid. */}
  if(session){
    try{const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),15000);let response;try{response=await fetch('/api/top8/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:session}),cache:'no-store',credentials:'omit',signal:controller.signal});}finally{clearTimeout(timer);}
      const payload=await response.json();if(!response.ok)throw Error(payload.message||'Could not open the poster.');
      if(payload.tournamentId!==id)throw Error('The link does not belong to this tournament.');accessToken=payload.accessToken||'';delete payload.accessToken;try{sessionStorage.setItem('top-session:'+id,accessToken);}catch{}data=payload;design=initial(data);
      let cloudWarning='';
      if(accessToken){try{const remote=await cloud('project');if(!savedDraft){cloudRevision=remote?.revision??0;if(remote?.project)savedDraft=validateProject(remote.project);}else if(!remote)cloudRevision=0;}catch{cloudWarning='Could not retrieve the design from the server. You can edit and download the project; use Load from server to retrieve the shared design.';}}
      if(!savedDraft)await storage(project()).catch(()=>{});
      history.replaceState(null,'',location.pathname+location.search);
      if(savedDraft){$('restore').hidden=false;status('Choose whether to restore the design or use current data.');}else{await mount();save();status('Edit the poster and download the PNG when ready.');}
      if(cloudWarning)status(cloudWarning);
    }catch(e){status(e.message||'Could not load the tournament. Reopen the editor from the app.');if(savedDraft){data=savedDraft.data;design=savedDraft.design;await mount();status('Link unavailable. The latest saved design has been restored.');}}
  }else if(savedDraft){data=savedDraft.data;design=savedDraft.design;await mount();}
  else status('Open the editor from the Smash Tournaments app to load players.');
}
window.addEventListener('hashchange',()=>location.reload());
void boot();
