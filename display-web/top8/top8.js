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
function initial(payload){return {title:payload.title+' · Top '+(payload.topCount??payload.players.length),subtitle:payload.gameTitle+' · '+new Date(payload.date).toLocaleDateString('es-ES'),footer:payload.participantCount+(payload.teamTournament?' equipos':' participantes')+' · Smash Tournaments',layout:payload.teamTournament?'teams':'podium',ratio:payload.teamTournament&&payload.players.length>2?'portrait':'wide',game:payload.game,collection:'',artFit:'contain',font:'sans-serif',nameSize:38,shade:10,cardOpacity:100,logoSize:240,backgroundColor:'#111e35',cardColor:'#1d304e',textColor:'#ffffff',accentColor:'#f4c65a',background:'',logo:'',players:payload.players.map(p=>({id:p.id,name:p.name,placement:p.placement,characters:p.characters.map(c=>String(c.id)),roster:(p.roster||[]).map(m=>(m.role==='RESERVE'?'Reserva: ':'Titular: ')+m.nickname).join(' · '),extra:'',portrait:'',x:50,y:50,zoom:1}))};}
function project(){return {version:2,tournamentId:id,data,design,cloudRevision};}
function validateProject(p){
  if(!p||![1,2].includes(p.version)||p.tournamentId!==id||!p.data||p.data.tournamentId!==id||!p.design)throw Error('El proyecto no corresponde a este torneo o no es compatible.');
  const d=p.design;const enumField=(k,values)=>{if(!values.includes(d[k]))throw Error('Opción de diseño no válida: '+k);};
  for(const k of ['title','subtitle','footer'])if(typeof d[k]!=='string'||d[k].length>180)throw Error('Texto de proyecto no válido');
  for(const k of ['backgroundColor','cardColor','textColor','accentColor'])if(!/^#[a-f0-9]{6}$/i.test(d[k]))throw Error('Color no válido');
  enumField('font',['sans-serif','serif','monospace']);enumField('ratio',['wide','square','portrait']);enumField('layout',['podium','grid','teams']);if(typeof d.game!=='string'||!/^[a-z0-9_-]{1,50}$/.test(d.game))throw Error('Juego no válido');
  if(d.collection!==undefined&&(typeof d.collection!=='string'||!/^[a-zA-Z0-9_-]{0,100}$/.test(d.collection)))throw Error('Colección no válida');
  if(d.artFit!==undefined&&!['contain','cover'].includes(d.artFit))throw Error('Encuadre no válido');
  if(!Number.isFinite(d.nameSize)||d.nameSize<24||d.nameSize>60||!Number.isFinite(d.shade)||d.shade<0||d.shade>90)throw Error('Tamaño u opacidad no válidos');
  for(const [key,min,max] of [['cardOpacity',0,100],['logoSize',100,360]])if(d[key]!==undefined&&(!Number.isFinite(d[key])||d[key]<min||d[key]>max))throw Error('Tamaño u opacidad no válidos');
  const asset=v=>{if(v!==''&&(!safeImage(v)||!v.startsWith('data:')||v.length>16000000))throw Error('Imagen de proyecto no válida');};asset(d.background);asset(d.logo);
  if(!Array.isArray(d.players)||d.players.length>8)throw Error('El cartel admite hasta ocho jugadores');
  for(const row of d.players){
    if(row.roster!==undefined&&(typeof row.roster!=='string'||row.roster.length>4000))throw Error('Plantilla no válida');
    if(typeof row.name!=='string'||row.name.length>120||typeof row.extra!=='string'||row.extra.length>100)throw Error('Jugador no válido');
    if(row.placement!==null&&(!Number.isInteger(row.placement)||row.placement<1||row.placement>100000))throw Error('Puesto no válido');
    if(!Array.isArray(row.characters)||row.characters.length>4||row.characters.some(c=>typeof c!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(c)))throw Error('Personajes no válidos');
    if(row.skins!==undefined&&(!Array.isArray(row.skins)||row.skins.length>4||row.skins.some(v=>typeof v!=='string'||!/^\d{1,8}$/.test(v))))throw Error('Variantes no válidas');
    if('collection' in row)throw Error('La colección debe ser común para todo el cartel');
    for(const k of ['x','y'])if(!Number.isFinite(row[k])||row[k]<0||row[k]>100)throw Error('Encuadre no válido');
    if(!Number.isFinite(row.zoom)||row.zoom<1||row.zoom>3)throw Error('Zoom no válido');asset(row.portrait);
  }
  // Catalog comes only from the server or its saved snapshot; never fetch arbitrary image URLs.
  if(!p.data.catalog||typeof p.data.catalog!=='object')throw Error('Catálogo no válido');
  for(const game of ['smash','rivals','custom']){
    const entries=p.data.catalog[game];if(!Array.isArray(entries)||entries.length>200)throw Error('Catálogo no válido');
    for(const c of entries)if(typeof c.name!=='string'||c.name.length>80||!Number.isInteger(c.id)||(c.image!==''&&!/^\/assets\/(smash|roa2)-stock-icons\/[a-z0-9_]+\.png$/.test(c.image)))throw Error('Personaje no válido');
  }
  if(!Array.isArray(p.data.warnings)||p.data.warnings.some(w=>typeof w!=='string'||w.length>500))throw Error('Avisos no válidos');
  return p;
}
function save(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>storage(project()).then(()=>{$('saved').textContent='Diseño guardado en este navegador.';}).catch(()=>{$('saved').textContent='No se pudo guardar aquí. Descarga el proyecto para conservarlo.';}),500);}
function imageGuidance(){const [w,h]=size(design.ratio,Number($('resolution').value));$('background-guidance').textContent=`Fondo recomendado: ${w} × ${h} px, mismo formato que el cartel. PNG, JPG o WebP, hasta 10 MB. Se recorta para llenar el fondo.`;}
async function preview(){
  imageGuidance();
  const revision=++renderRevision;const snapshot=structuredClone(design);
  try{const canvas=document.createElement('canvas');await render(canvas,snapshot,artworkGame,.6,()=>revision===renderRevision);if(revision!==renderRevision)return;const dest=$('preview');dest.width=canvas.width;dest.height=canvas.height;dest.getContext('2d').drawImage(canvas,0,0);const [w,h]=size(design.ratio,Number($('resolution').value));$('dimensions').textContent=w+' × '+h+' px';}
  catch(error){if(revision===renderRevision)status(error.message);}
}
function updateWarnings(){
  const warnings=[...(data?.warnings||[]),...artworkIssues(design,artworkGame)];
  if(design.players.some(p=>!p.portrait&&p.characters.some((_,i)=>{const asset=selectionFor(design,artworkGame,p,i);return asset&&Math.max(asset.width,asset.height)<512;})))warnings.push('Hay ilustraciones de baja resolución en esta colección. Exportar a 4K no añade detalle al original; puedes elegir otra colección o subir imágenes propias.');
  $('warnings').textContent=[...new Set(warnings)].join('\n');$('warnings').hidden=!warnings.length;
}
function change(){editRevision++;updateWarnings();void preview();save();}
function button(label,action){const el=document.createElement('button');el.className='secondary';el.type='button';el.textContent=label;el.addEventListener('click',action);return el;}
function field(parent,label,value,onInput,type='text',attrs={}){
  const container=document.createElement('label');container.textContent=label;const input=document.createElement('input');input.type=type;Object.assign(input,attrs);input.value=value??'';input.addEventListener('input',()=>onInput(input.value));container.append(input);parent.append(container);return input;
}
async function readImage(file){
  if(!file)return '';if(file.size>10000000||!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('Usa una imagen PNG, JPG o WebP de hasta 10 MB.');
  const url=URL.createObjectURL(file);
  try{const img=new Image();await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('No se pudo abrir esa imagen'));img.src=url;});
    if(img.width*img.height>64000000)throw Error('La imagen es demasiado grande. Usa una copia de hasta 64 megapíxeles.');
    const s=Math.min(1,4096/Math.max(img.width,img.height));const canvas=document.createElement('canvas');canvas.width=Math.round(img.width*s);canvas.height=Math.round(img.height*s);canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);const result=canvas.toDataURL('image/png');if(result.length>12000000)throw Error('La imagen ocupa demasiado tras prepararla. Usa una copia más pequeña.');return result;
  }finally{URL.revokeObjectURL(url);}
}
async function upload(file,apply){if(loadingAsset||!file)return;loadingAsset=true;exportState();try{const result=await readImage(file);apply(result);change();}catch(e){status(e.message);}finally{loadingAsset=false;exportState();}}
function playerFields(){
  const expanded=new Set([...$('players').children].flatMap((el,i)=>el.querySelector('details')?.open?[i]:[]));
  $('players').replaceChildren();
  design.players.forEach((row,index)=>{
    const block=document.createElement('section');block.className='player';const heading=document.createElement('div');heading.className='player-heading';const name=document.createElement('strong');name.textContent=(data.teamTournament?'Equipo ':'Jugador ')+(index+1);heading.append(name);
    const move=offset=>{const next=index+offset;if(next<0||next>=design.players.length)return;[design.players[index],design.players[next]]=[design.players[next],design.players[index]];playerFields();change();};
    const up=button('↑',()=>move(-1));up.setAttribute('aria-label','Subir jugador '+(index+1));up.disabled=index===0;const down=button('↓',()=>move(1));down.setAttribute('aria-label','Bajar jugador '+(index+1));down.disabled=index===design.players.length-1;heading.append(up,down);block.append(heading);
    field(block,'Puesto',row.placement,v=>{row.placement=v===''?null:Number(v);change();},'number',{min:'1',max:'100000'});
    field(block,'Nombre',row.name,v=>{row.name=v;change();},'text',{maxLength:120});
    if(data.teamTournament||design.layout==='teams')field(block,'Plantilla (separar con ·)',row.roster||'',v=>{row.roster=v;change();},'text',{maxLength:4000});
    field(block,'Texto adicional / redes',row.extra,v=>{row.extra=v;change();},'text',{maxLength:100});
    const chars=document.createElement('details');const summary=document.createElement('summary');summary.textContent='Personajes e imagen';chars.append(summary);
    chars.open=expanded.has(index);
    const collection=collectionFor(design,artworkGame);
    row.characters.forEach((characterId,slot)=>{
      const character=artworkGame.characters.find(c=>c.id===characterId),variant=selectionFor(design,artworkGame,row,slot);
      const item=document.createElement('div');item.className='character-slot';
      const img=document.createElement('img');img.alt='';img.loading='lazy';if(variant)img.src=imageUrl(variant.image,'thumb');else img.hidden=true;img.onerror=()=>{img.hidden=true;};
      const info=document.createElement('div');info.className='slot-info';info.textContent=(character?.name||characterId)+' · '+(variant?.label||'Sin imagen en esta colección');if(!variant)info.classList.add('missing');
      const actions=document.createElement('div');actions.className='slot-actions';
      const pick=button('Cambiar personaje',()=>openPicker({game:artworkGame,collection,selected:characterId,onSelect:(c,v)=>{row.characters[slot]=c;row.skins[slot]=v;playerFields();change();}}));pick.disabled=!collection||libraryBusy;
      const skin=button('Elegir variante',()=>openPicker({game:artworkGame,collection,character,selected:row.skins[slot],onSelect:(_,v)=>{row.skins[slot]=v;playerFields();change();}}));skin.disabled=!character||!collection?.characters[characterId]?.length||libraryBusy;
      actions.append(pick,skin,button('Quitar personaje',()=>{row.characters.splice(slot,1);row.skins.splice(slot,1);playerFields();change();}));item.append(img,info,actions);chars.append(item);
    });
    const addCharacter=button('Añadir personaje',()=>openPicker({game:artworkGame,collection,onSelect:(c,v)=>{row.characters.push(c);row.skins.push(v);playerFields();change();}}));addCharacter.disabled=row.characters.length>=4||!collection||libraryBusy;chars.append(addCharacter);
    if(row.portrait){const custom=document.createElement('img');custom.src=row.portrait;custom.className='custom-preview';custom.alt='Imagen propia de '+row.name;chars.append(custom);const note=document.createElement('p');note.className='hint';note.textContent='La imagen propia sustituye a los personajes de esta tarjeta.';chars.append(note);}
    const fileLabel=document.createElement('label');fileLabel.textContent=data.teamTournament?'Logo del equipo':'Retrato / imagen propia';const input=document.createElement('input');input.type='file';input.accept='image/png,image/jpeg,image/webp';input.addEventListener('change',()=>upload(input.files[0],value=>{row.portrait=value;playerFields();}));fileLabel.append(input);chars.append(fileLabel);const guidance=document.createElement('p');guidance.className='hint';guidance.textContent='Imagen propia recomendada: al menos 1024 × 1024 px; 2048 px para exportar a 8K. PNG transparente para logos; el retrato se recorta con posición y zoom. Hasta 10 MB.';chars.append(guidance);
    field(chars,'Posición horizontal',row.x,v=>{row.x=Number(v);change();},'range',{min:'0',max:'100'});
    field(chars,'Posición vertical',row.y,v=>{row.y=Number(v);change();},'range',{min:'0',max:'100'});
    field(chars,'Zoom de la imagen',row.zoom,v=>{row.zoom=Number(v);change();},'range',{min:'1',max:'3',step:'.05'});
    const actions=document.createElement('div');actions.className='actions';actions.append(button('Restablecer encuadre',()=>{row.x=50;row.y=50;row.zoom=1;playerFields();change();}),button('Quitar imagen',()=>{row.portrait='';playerFields();change();}),button('Quitar jugador',()=>{design.players.splice(index,1);playerFields();change();}));chars.append(actions);block.append(chars);$('players').append(block);
  });$('add-player').disabled=design.players.length>=8;
}
function gameOptions(){
  const select=$('game'),query=normalize($('game-search').value);select.replaceChildren(new Option('Imágenes propias','custom'));
  for(const game of libraryIndex.games)if(game.id===design.game||normalize(game.name+' '+game.id).includes(query))select.add(new Option(game.name,game.id));
  if(![...select.options].some(o=>o.value===design.game))select.add(new Option(design.game,design.game));select.value=design.game;
}
function collectionFields(){
  gameOptions();const select=$('collection');select.replaceChildren();
  for(const collection of artworkGame.collections)select.add(new Option(collection.name+' · '+Object.keys(collection.characters).length+' personajes',collection.id));
  select.value=design.collection;select.disabled=!artworkGame.collections.length||libraryBusy;
  const current=collectionFor(design,artworkGame);$('collection-gallery').replaceChildren();
  for(const collection of artworkGame.collections.slice(0,8)){
    const sample=collection.characters[design.players.flatMap(p=>p.characters).find(c=>collection.characters[c])]?.[0]||Object.values(collection.characters)[0]?.[0];
    const tile=button('',()=>chooseCollection(collection.id));tile.className='collection-tile';tile.setAttribute('aria-pressed',String(collection.id===design.collection));tile.disabled=libraryBusy;
    const img=document.createElement('img');img.alt='';img.loading='lazy';if(sample)img.src=imageUrl(sample.image,'thumb');img.onerror=()=>{img.hidden=true;};
    const title=document.createElement('strong');title.textContent=collection.name;const hint=document.createElement('small');hint.textContent=collection.kind==='icon'?'Iconos':collection.kind==='artwork'?'Ilustraciones de personajes':'Retratos';tile.append(img,title,hint);$('collection-gallery').append(tile);
  }
  $('collection-info').textContent=current?`${Object.keys(current.characters).length} personajes disponibles. ${current.description}\nAl cambiar de colección se actualizan todos los jugadores; las imágenes propias se mantienen.`:design.game==='custom'?'Sube imágenes en cada jugador, el fondo o el logo.':'No se ha podido cargar la colección.';
  $('collection-credits').textContent=current?.credits||artworkGame.credits||'Esta colección no indica créditos adicionales. Consulta su página de origen.';
  $('collection-source').hidden=!current;if(current)$('collection-source').href=current.source;
}
function chooseCollection(id){if(libraryBusy)return;try{const changed=useCollection(design,artworkGame,id);collectionFields();playerFields();change();status('Colección aplicada a todo el cartel.'+(changed?' Se han ajustado las variantes que no existían en ella.':''));}catch(error){status(error.message);}}
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
  if(design.players.some(p=>p.characters.length)&&!confirm('Cambiar de juego quita los personajes seleccionados. Se mantienen los jugadores y las imágenes propias. ¿Continuar?')){gameOptions();return;}
  libraryBusy=true;$('game').disabled=true;$('collection').disabled=true;$('export').disabled=true;
  try{const game=await loadGame(next);design.game=next;design.collection='';design.players.forEach(p=>{p.characters=[];p.skins=[];});artworkGame=game;if(game.collections.length)useCollection(design,game,game.collections[0].id);status('Juego de la biblioteca actualizado.');}
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
$('project-file').addEventListener('change',async()=>{try{const file=$('project-file').files[0];if(!file)return;if(file.size>80000000)throw Error('Proyecto demasiado grande (máximo 80 MB)');const p=validateProject(JSON.parse(await file.text()));data=p.data;design=p.design;await mount();save();}catch(e){status(e.message);}});
$('restore-draft').addEventListener('click',async()=>{
  const fresh=data;design=savedDraft.design;
  // Repair only missing ranks from current official results; preserve deliberate edits and artwork.
  for(const player of design.players)if(player.placement===null){const current=fresh?.players.find(p=>p.id===player.id);if(current?.placement)player.placement=current.placement;}
  data=fresh||savedDraft.data;data.warnings=[...new Set([...(data.warnings||[]),'Diseño recuperado: se han completado los puestos vacíos disponibles. Revisa las posiciones que habías editado manualmente.'])];await mount();save();
});
$('new-draft').addEventListener('click',async()=>{await mount();save();});
$('export').addEventListener('click',async()=>{
  if(loadingAsset||libraryBusy||exporting)return;exporting=true;const button=$('export');exportState();button.textContent='Generando PNG…';
  try{if(!design.players.length||design.players.some(p=>!p.name.trim()||!Number.isInteger(p.placement)||p.placement<1||p.placement>100000))throw Error('Completa el nombre y el puesto de todos los jugadores antes de exportar.');
    const issues=artworkIssues(design,artworkGame);if(issues.length)throw Error(issues.join('\n'));
    const canvas=document.createElement('canvas');const scale=Number($('resolution').value);const [w,h]=size(design.ratio,scale);if(w*h>64000000)throw Error('Para este formato utiliza una resolución menor (hasta 64 megapíxeles).');
    await render(canvas,structuredClone(design),artworkGame,scale);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('El dispositivo no pudo generar una imagen tan grande. Prueba con 4K o 1920 px.');
    download(blob,'Smash Tournaments-top8-'+id+'.png');canvas.width=1;canvas.height=1;status('PNG generado a '+w+' × '+h+' píxeles.');
  }catch(e){status(e.message||'No se pudo exportar. Prueba una resolución menor.');}finally{exporting=false;exportState();button.textContent='Descargar PNG';}
});
async function cloud(path,body){
  if(!accessToken)throw Error('Abre de nuevo el editor desde la aplicación para acceder al servidor.');
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),60000);
  try{const response=await fetch('/api/top8/'+path,{method:body?'POST':'GET',credentials:'omit',cache:'no-store',headers:{Authorization:'Bearer '+accessToken,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:controller.signal});const result=await response.json();if(!response.ok)throw Error(result.message||'No se pudo acceder al servidor');return result;}finally{clearTimeout(timeout);}
}
async function cloudAction(fn){if(cloudBusy)return;cloudBusy=true;for(const id of ['cloud-save','cloud-load','refresh-results'])$(id).disabled=true;try{await fn();}catch(e){status(e.message);}finally{cloudBusy=false;for(const id of ['cloud-save','cloud-load','refresh-results'])$(id).disabled=false;}}
$('cloud-save').onclick=()=>cloudAction(async()=>{validateProject(project());const snapshot=structuredClone(design);const result=await cloud('project',{revision:cloudRevision,design:snapshot});cloudRevision=result.revision;await storage(project()).catch(()=>{});status(JSON.stringify(design)===JSON.stringify(snapshot)?'Diseño guardado en el servidor. Disponible en tus otros dispositivos.':'Se guardó la versión enviada. Tienes cambios posteriores sin enviar: pulsa Guardar en servidor otra vez.');});
// An async load must not silently discard changes made after its confirmation.
async function loadUnchangedDesign(path){
  const current=design,revision=editRevision;
  const result=await cloud(path);
  if(design!==current||editRevision!==revision)throw Error('Has editado el diseño durante la carga. Se conservan tus cambios; vuelve a pulsar el botón si quieres reemplazarlos.');
  return result;
}
$('cloud-load').onclick=()=>cloudAction(async()=>{if(!confirm('¿Reemplazar el diseño abierto por la versión del servidor? Descarga antes el proyecto si quieres conservarlo.'))return;const remote=await loadUnchangedDesign('project');if(!remote)throw Error('Todavía no hay diseño guardado en el servidor');const p=validateProject(remote.project);cloudRevision=remote.revision;data=p.data;design=p.design;await mount();save();});
$('refresh-results').onclick=()=>cloudAction(async()=>{if(!confirm('Se actualizarán nombres, puestos, personajes y plantillas. Se conservarán colores, textos, imágenes y encuadres. ¿Continuar?'))return;const fresh=await loadUnchangedDesign('data'),defaults=initial(fresh);design.players=defaults.players.map(p=>({...design.players.find(old=>old.id===p.id),...p,skins:[],portrait:design.players.find(old=>old.id===p.id)?.portrait||'',x:design.players.find(old=>old.id===p.id)?.x??50,y:design.players.find(old=>old.id===p.id)?.y??50,zoom:design.players.find(old=>old.id===p.id)?.zoom??1,extra:design.players.find(old=>old.id===p.id)?.extra||''}));data=fresh;await mount();save();});
try{accessToken=sessionStorage.getItem('top-session:'+id)||'';}catch{}
async function boot(){
  if(!id||!/^[a-zA-Z0-9_-]{1,100}$/.test(id)){status('Abre el cartel desde un torneo terminado en la aplicación de Smash Tournaments.');return;}
  try{const saved=await storage();if(saved){savedDraft=validateProject(saved);cloudRevision=Number.isInteger(saved.cloudRevision)&&saved.cloudRevision>=0?saved.cloudRevision:0;}}catch{/* Use server data when storage is unavailable or invalid. */}
  if(session){
    try{const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),15000);let response;try{response=await fetch('/api/top8/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:session}),cache:'no-store',credentials:'omit',signal:controller.signal});}finally{clearTimeout(timer);}
      const payload=await response.json();if(!response.ok)throw Error(payload.message||'No se pudo abrir el cartel.');
      if(payload.tournamentId!==id)throw Error('El enlace no corresponde a este torneo.');accessToken=payload.accessToken||'';delete payload.accessToken;try{sessionStorage.setItem('top-session:'+id,accessToken);}catch{}data=payload;design=initial(data);
      let cloudWarning='';
      if(accessToken){try{const remote=await cloud('project');if(!savedDraft){cloudRevision=remote?.revision??0;if(remote?.project)savedDraft=validateProject(remote.project);}else if(!remote)cloudRevision=0;}catch{cloudWarning='No se pudo recuperar el diseño del servidor. Puedes editar y descargar el proyecto; usa Cargar del servidor para recuperar el diseño compartido.';}}
      if(!savedDraft)await storage(project()).catch(()=>{});
      history.replaceState(null,'',location.pathname+location.search);
      if(savedDraft){$('restore').hidden=false;status('Elige si quieres recuperar el diseño o usar los datos actuales.');}else{await mount();save();status('Edita el cartel y descarga el PNG cuando esté listo.');}
      if(cloudWarning)status(cloudWarning);
    }catch(e){status(e.message||'No se pudo cargar el torneo. Abre de nuevo el editor desde la aplicación.');if(savedDraft){data=savedDraft.data;design=savedDraft.design;await mount();status('Enlace no disponible. Se ha recuperado el último diseño guardado.');}}
  }else if(savedDraft){data=savedDraft.data;design=savedDraft.design;await mount();}
  else status('Abre el editor desde la aplicación de Smash Tournaments para cargar los jugadores.');
}
window.addEventListener('hashchange',()=>location.reload());
void boot();
