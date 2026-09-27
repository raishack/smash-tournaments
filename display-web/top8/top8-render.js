import { imageUrl, selectionFor } from './top8-library.js?v=20260925-access';
const imageCache = new Map();
export const safeImage = value => typeof value === 'string' && (/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value) || /^\/api\/top8\/assets\/[a-f0-9]{40}\/(full|preview|thumb)$/.test(value));
async function image(url) {
  if (!url) return null;
  if (!safeImage(url)) throw Error('Invalid image in project');
  if (!imageCache.has(url)) {
    if(imageCache.size >= 12) imageCache.delete(imageCache.keys().next().value);
    const entry={pixels:0,promise:null};
    entry.promise=new Promise((resolve,reject)=>{
      const img=new Image();
      const timer=setTimeout(()=>{img.src='';reject(Error('The image is taking too long to load. Retry or use a custom image.'));},60000);
      img.onload=()=>{
        clearTimeout(timer);entry.pixels=img.width*img.height;
        // High-resolution originals are decoded one at a time; don't retain an entire 8K roster on a phone.
        let pixels=[...imageCache.values()].reduce((sum,item)=>sum+item.pixels,0);
        for(const [key,item] of imageCache){if(pixels<=16000000)break;if(item.pixels){imageCache.delete(key);pixels-=item.pixels;}}
        resolve(img);
      };
      img.onerror=()=>{clearTimeout(timer);reject(Error('Could not load an image. Select Retry library and images, or use your own image.'));};img.src=url;
    }).catch(error=>{if(imageCache.get(url)===entry)imageCache.delete(url);throw error;});
    imageCache.set(url,entry);
  }
  return imageCache.get(url).promise;
}
export function size(ratio, scale=1) { const base = ratio === 'wide' ? [1920,1080] : ratio === 'portrait' ? [1920,2400] : [1920,1920];return base.map(n=>Math.round(n*scale)); }
function fill(ctx,text,x,y,width,font,color,align='left') {
  let n=font.size;ctx.textAlign=align;ctx.textBaseline='middle';ctx.fillStyle=color;
  do {ctx.font=`${font.weight||700} ${n}px ${font.family}`;if(ctx.measureText(text).width<=width||n<=12)break;n-=1;}while(n>0);
  // Keep text on the card even for extreme names. Canvas maxWidth is a final guard.
  ctx.fillText(text,x,y,width);
}
function cover(ctx,img,x,y,w,h,zoom=1,px=50,py=50){if(!img)return;const s=Math.max(w/img.width,h/img.height)*zoom;const iw=img.width*s,ih=img.height*s;ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();ctx.drawImage(img,x-(iw-w)*px/100,y-(ih-h)*py/100,iw,ih);ctx.restore();}
function artwork(ctx,img,x,y,w,h,fit,zoom,px,py){if(!img)return;const s=(fit==='cover'?Math.max(w/img.width,h/img.height):Math.min(w/img.width,h/img.height))*zoom;const iw=img.width*s,ih=img.height*s;ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();ctx.drawImage(img,x+(w-iw)*px/100,y+(h-ih)*py/100,iw,ih);ctx.restore();}
function roundedCard(ctx,x,y,w,h,r){
  ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);
  ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();
}
export async function render(canvas, design, game, scale=1, current=()=>true) {
  const [width,height]=size(design.ratio,scale);
  const assets = await Promise.all([image(design.background),image(design.logo)]);
  const logoW=design.logoSize??240,logoH=logoW*.62;
  canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('Could not prepare the image. Try a lower resolution.');
  ctx.scale(scale,scale);const [w,h]=size(design.ratio);const margin=64;const gap=24;const top=assets[1]?Math.max(215,logoH+84):215;const bottom=h-95;
  ctx.fillStyle=design.backgroundColor;ctx.fillRect(0,0,w,h);cover(ctx,assets[0],0,0,w,h);
  ctx.fillStyle=`rgba(0,0,0,${design.shade/100})`;ctx.fillRect(0,0,w,h);
  ctx.fillStyle=design.accentColor;ctx.fillRect(margin,53,64,8);
  const font={family:design.font};
  fill(ctx,design.title,margin,108,w-2*margin-(assets[1]?logoW+32:0),{...font,size:68},design.textColor);
  fill(ctx,design.subtitle,margin,171,w-2*margin-(assets[1]?logoW+32:0),{...font,size:29,weight:500},design.textColor);
  if(assets[1]){const img=assets[1];const s=Math.min(logoW/img.width,logoH/img.height);ctx.drawImage(img,w-margin-img.width*s,60,img.width*s,img.height*s);}
  const count=design.players.length;const boxes=[];const areaW=w-2*margin;const areaH=bottom-top;
  if(design.layout==='podium'&&design.ratio==='wide'&&count>3){
    const firstH=areaH*.54;let x=margin;
    [0.4,0.3,0.3].forEach((part,i)=>{const cw=(areaW-2*gap)*part;boxes.push([x,top,cw,firstH]);x+=cw+gap;});
    const n=count-3;const cw=(areaW-(n-1)*gap)/n;
    for(let i=0;i<n;i++)boxes.push([margin+i*(cw+gap),top+firstH+gap,cw,areaH-firstH-gap]);
  }else{
    const cols=Math.min(count||1,design.layout==='teams'?2:design.ratio==='wide'?4:2);const rows=Math.ceil((count||1)/cols);const cw=(areaW-(cols-1)*gap)/cols;const ch=(areaH-(rows-1)*gap)/rows;
    for(let i=0;i<count;i++)boxes.push([margin+(i%cols)*(cw+gap),top+Math.floor(i/cols)*(ch+gap),cw,ch]);
  }
  for(let i=0;i<count;i++){
    if(!current())return canvas;
    const p=design.players[i];const [x,y,cw,ch]=boxes[i];const portrait=await image(p.portrait);
    ctx.save();roundedCard(ctx,x,y,cw,ch,18);ctx.clip();ctx.fillStyle=design.cardColor;ctx.globalAlpha=(design.cardOpacity??(assets[0]?35:100))/100;ctx.fillRect(x,y,cw,ch);ctx.globalAlpha=1;
    ctx.fillStyle=design.accentColor;ctx.globalAlpha=assets[0]?0:.1;ctx.beginPath();ctx.arc(x+cw*.78,y+ch*.24,cw*.6,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
    const team=design.layout==='teams'&&p.roster;const textH=team?Math.max(100,ch*.6):p.extra?106:82;const artH=ch-textH;
    if(portrait)cover(ctx,portrait,x,y,cw,artH,p.zoom,p.x,p.y);
    else if(p.characters.length){
      const each=(cw-20)/p.characters.length;
      for(let j=0;j<p.characters.length;j++){
        if(!current()){ctx.restore();return canvas;}
        const selected=selectionFor(design,game,p,j);
        if(!selected){fill(ctx,'No artwork',x+10+each*(j+.5),y+artH/2,each-12,{...font,size:20},design.textColor,'center');continue;}
        const img=await image(imageUrl(selected.image,scale<1?'preview':'full'));
        artwork(ctx,img,x+10+j*each,y+8,each,Math.max(1,artH-16),design.artFit||'contain',p.zoom,p.x,p.y);
      }
    } else { fill(ctx,p.name.trim().slice(0,1).toUpperCase()||'—',x+cw/2,y+artH/2,cw-80,{...font,size:80},design.accentColor,'center'); }
    ctx.fillStyle=design.accentColor;ctx.fillRect(x,y,65,57);fill(ctx,p.placement===null?'—':String(p.placement),x+32,y+29,53,{...font,size:34},'#101828','center');
    ctx.fillStyle=design.cardColor;ctx.globalAlpha=Math.max(.85,(design.cardOpacity??100)/100);ctx.fillRect(x,y+ch-textH,cw,textH);ctx.globalAlpha=1;
    fill(ctx,p.name,x+20,y+ch-textH+34,cw-40,{...font,size:design.nameSize},design.textColor);
    if(!team&&p.extra)fill(ctx,p.extra,x+20,y+ch-textH+75,cw-40,{...font,size:24,weight:500},design.textColor);
    if(team){
      let fontSize=22,lines=[];const available=textH-60;
      do{ctx.font=`500 ${fontSize}px ${design.font}`;lines=[];let line='';for(const member of p.roster.split(' · ')){line='';for(const word of member.split(/\s+/)){if(ctx.measureText(line+' '+word).width>cw-40&&line){lines.push(line);line=word;}else line+=(line?' ':'')+word;}if(line)lines.push(line);}if(lines.length*fontSize*1.25<=available||fontSize<=8)break;fontSize--;}while(true);
      lines.forEach((line,j)=>fill(ctx,line,x+20,y+ch-textH+64+j*fontSize*1.25,cw-40,{...font,size:fontSize,weight:500},design.textColor));
    }
    ctx.restore();
  }
  fill(ctx,design.footer,margin,h-44,w-2*margin,{...font,size:24,weight:500},design.textColor);
  return canvas;
}
