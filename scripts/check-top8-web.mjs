import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import express from 'express';
import { Top8Assets, createTop8AssetRouter } from '../backend/dist/modules/top8/top8-assets.js';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import sharp from 'sharp';
import { buildTop8Data } from '../backend/dist/modules/top8/top8-data.js';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const output=path.resolve('build/top8-review');await fs.mkdir(output,{recursive:true});
const participants=Array.from({length:8},(_,i)=>({id:'p'+i,displayName:['Raishack','Nova','Kragg Master','Orion','GT | Luna','Falcon','Arce','Player with a very long name'][i],externalRef:{entrantId:String(i)}}));
const payload=buildTop8Data({id:'test',title:'Tournament Platform · Rivals Night',gameTitle:'Rivals of Aether II',startsAt:'2026-09-22T18:00:00Z',settings:{format:'DOUBLE_ELIMINATION'},importSource:{provider:'START_GG'}},participants,[{status:'COMPLETED',gameCharacterSelections:[{gameNum:1,selections:participants.map((p,i)=>({participantId:p.id,characterId:[2499,2500,2504,2501,2503,2498,2502,2505][i],characterName:'Character'}))}]}],participants.map((p,i)=>({entrantId:String(i),name:p.displayName,placement:[1,2,3,4,5,5,7,7][i]})));
const errors=[];let redemptionCount=0;
const app=express();app.use('/api/top8/assets',createTop8AssetRouter(new Top8Assets(path.resolve('display-web/assets/top8-library'),path.resolve('build/top8-assets-review/cache'))));
app.use(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/api/top8/session'){
    assert.equal(req.headers['x-app-key'],undefined);redemptionCount++;
    res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify(payload));return;
  }
  try{const file=path.resolve('display-web','.'+(url.pathname.endsWith('/')?url.pathname+'index.html':url.pathname));if(!file.startsWith(path.resolve('display-web')+path.sep))throw Error('path');res.setHeader('Content-Type',{'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.json':'application/json'}[path.extname(file)]||'application/octet-stream');res.end(await fs.readFile(file));}catch{res.writeHead(404).end();}
});
const server=http.createServer(app);
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}/top8/?tournamentId=test`;
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true});
try{
  const page=await browser.newPage({viewport:{width:1600,height:1100},acceptDownloads:true});page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.goto(base+'#session='+'a'.repeat(64));await page.locator('#editor').waitFor();await page.waitForFunction(()=>document.querySelector('#preview').width>1000);
  assert.equal(await page.locator('.player').count(),8);assert.equal(new URL(page.url()).hash,'');assert.equal(redemptionCount,1);
  await page.screenshot({path:path.join(output,'editor-desktop.png'),fullPage:true});
  await page.locator('.player details').first().locator('summary').click();
  assert.equal(await page.locator('#game').inputValue(),'roa2');assert.equal(await page.locator('#collection').inputValue(),'full');assert.equal(await page.locator('#game option').count(),241);assert((await page.locator('.character-slot').first().innerText()).includes('Zetterburn'));
  await page.locator('#collection').selectOption('art');await page.waitForFunction(()=>document.querySelector('#collection').value==='art');
  await page.locator('.player').first().getByRole('button',{name:'Cambiar personaje',exact:true}).click();await page.locator('#asset-picker').waitFor();await page.locator('#asset-search').fill('Kragg');assert.equal(await page.locator('#asset-grid button').count(),1);await page.locator('#asset-grid button').click();
  await page.locator('#collection').selectOption('costume');await page.locator('.player').first().getByRole('button',{name:'Elegir variante',exact:true}).click();await page.locator('#asset-search').fill('Red');assert(await page.locator('#asset-grid button').count()>0);await page.screenshot({path:path.join(output,'asset-picker-variants.png')});await page.locator('#asset-grid button').first().click();assert((await page.locator('.character-slot').first().innerText()).includes('Red'));
  await page.locator('#collection').selectOption('art');assert(!(await page.locator('.character-slot').first().innerText()).includes('Red'));
  assert.equal(await page.locator('img[src*=stock-icons]').count(),0);
  await page.locator('#title').fill('Top 8 <script>literal</script>');
  await page.locator('.player').first().getByLabel('Texto adicional / redes').fill('@demo-admin');
  const artwork=await sharp({create:{width:700,height:900,channels:4,background:{r:35,g:80,b:150,alpha:1}}}).png().toBuffer();
  await page.locator('.player input[type=file]').first().setInputFiles({name:'portrait.png',mimeType:'image/png',buffer:artwork});
  await page.waitForFunction(()=>!document.querySelector('#export').disabled);
  await page.waitForFunction(()=>document.querySelector('#saved').textContent.includes('guardado'));
  const pngPromise=page.waitForEvent('download');await page.locator('#export').click();const png=await pngPromise;const pngPath=path.join(output,'top8-4k.png');await png.saveAs(pngPath);
  const meta=await sharp(pngPath).metadata();assert.equal(meta.width,3840);assert.equal(meta.height,2160);assert.equal(meta.format,'png');
  await page.getByText('Guardar y recuperar',{exact:true}).click();
  const projectPromise=page.waitForEvent('download');await page.locator('#save-project').click();const project=await projectPromise;const projectPath=path.join(output,'project.json');await project.saveAs(projectPath);const saved=JSON.parse(await fs.readFile(projectPath,'utf8'));assert(saved.design.players[0].portrait.startsWith('data:image/png;base64,'));assert.equal(saved.design.players[0].extra,'@demo-admin');assert.equal(saved.version,2);assert.equal(saved.design.collection,'art');assert.equal(saved.design.game,'roa2');assert.deepEqual(saved.design.players[0].characters,['Kragg']);assert(saved.design.players.every(p=>!('collection' in p)));
  await page.locator('#collection').selectOption('full');assert.equal(await page.locator('.custom-preview').count(),1);
  await page.reload();await page.locator('#editor').waitFor();assert.equal(await page.locator('#title').inputValue(),'Top 8 <script>literal</script>');assert.equal(redemptionCount,1);
  await page.goto(base+'#session='+'b'.repeat(64));await page.locator('#restore').waitFor();await page.locator('#new-draft').click();await page.locator('#editor').waitFor();assert.equal(await page.locator('#title').inputValue(),payload.title+' · Top 8');
  await page.locator('#project-file').setInputFiles(projectPath);
  await page.waitForFunction(()=>document.querySelector('#title').value.includes('<script>literal'));
  assert.equal(await page.locator('script:not([src])').count(),0);
  await page.locator('#ratio').selectOption('portrait');await page.waitForFunction(()=>document.querySelector('#preview').height===1440);await page.screenshot({path:path.join(output,'editor-portrait.png'),fullPage:true});
  await page.locator('.player').first().getByLabel('Puesto',{exact:true}).fill('');await page.locator('#export').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Completa el nombre y el puesto'));
  const bad=structuredClone(saved);bad.design.players[0].portrait='https://example.test/tracking.png';await page.locator('#project-file').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(bad))});await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Imagen de proyecto no válida'));
  // All games are searchable and the full-body Smash collections use the same picker.
  await page.locator('#game-search').fill('Street Fighter 6');assert(await page.locator('#game option').count()<5);await page.locator('#game').selectOption('sf6');await page.waitForFunction(()=>!document.querySelector('#game').disabled);assert(await page.locator('#collection option').count()>2);
  await page.locator('#game-search').fill('Smash');await page.locator('#game').selectOption('ssbu');await page.waitForFunction(()=>!document.querySelector('#game').disabled);assert.equal(await page.locator('#collection').inputValue(),'website');
  if(!await page.locator('.player details').first().evaluate(e=>e.open))await page.locator('.player details').first().locator('summary').click();await page.locator('.player').first().getByRole('button',{name:'Añadir personaje',exact:true}).click();await page.locator('#asset-search').fill('Mario');await page.getByRole('button',{name:'Mario · Original',exact:true}).click();await page.locator('#collection').selectOption('mural_art');assert.equal(await page.locator('.custom-preview').count(),1);
  const mobile=await browser.newPage({viewport:{width:390,height:844}});mobile.on('pageerror',e=>errors.push(e.message));await mobile.goto(base+'#session='+'c'.repeat(64));await mobile.locator('#editor').waitFor();await mobile.waitForFunction(()=>document.querySelector('#preview').width>1000);
  assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await mobile.locator('.player details').first().locator('summary').click();await mobile.locator('.player').first().getByRole('button',{name:'Cambiar personaje',exact:true}).click();assert.equal(await mobile.evaluate(()=>document.querySelector('dialog').scrollWidth>document.querySelector('dialog').clientWidth),false);await mobile.waitForFunction(()=>[...document.querySelectorAll('#asset-grid img')].filter(e=>e.getBoundingClientRect().top<innerHeight).every(e=>e.complete&&e.naturalWidth>0));await mobile.screenshot({path:path.join(output,'picker-mobile.png')});await mobile.locator('#asset-close').click();
  await mobile.screenshot({path:path.join(output,'editor-mobile.png'),fullPage:true});
  assert.deepEqual(errors,[]);console.log('PASS Top8 library: 240 games, global collection, search, costumes, no stock icons, uploads preserved, prefill, desktop/mobile, custom image, editing, draft restore, project roundtrip, bad project rejection, missing placement, 3840×2160 PNG.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
