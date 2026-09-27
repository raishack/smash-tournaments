import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>fs.readFile(path.join(root,p),'utf8');
let failed=false;
const check=(ok,message)=>{console.log(`${ok?'OK':'CHECK'}: ${message}`);if(!ok)failed=true;};
try {
  const config=JSON.parse(await read('branding/applied.json'));
  const env=Object.fromEntries((await read('.env')).split(/\r?\n/).filter(l=>/^[A-Z_]+=/.test(l)).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1)];}));
  check(/^https:\/\//.test(config.publicBaseUrl)&&!config.publicBaseUrl.includes('your-domain.example'),'Set your HTTPS public URL and run npm run configure.');
  for(const key of ['POSTGRES_PASSWORD','DATABASE_URL','APP_CLIENT_KEY'])check(!!env[key]&&!/change_this|replace_with/.test(env[key]),key+' is configured (value hidden).');
  check(env.PUBLIC_BASE_URL===config.publicBaseUrl,'The server and clients share the same public URL.');
  check(env.APP_CLIENT_KEY===config.appClientKey,'The public client key matches the server.');
  for(const key of ['androidManageAppId','androidPlayerAppId','iosManageBundleId','iosPlayerBundleId','desktopApplicationId'])check(!config[key].startsWith('com.example.'),'Choose your own '+key+'.');
  const password=env.MANAGEMENT_BOOTSTRAP_PASSWORD;
  if(!password)console.log('NOTE: no bootstrap password; valid only if your server already has a management account.');
  else check(password.length>=10,'Initial management password has at least 10 characters (value hidden).');
  if(env.REGISTRATION_SMTP_HOST)check(!!env.REGISTRATION_MAIL_FROM,'SMTP requires REGISTRATION_MAIL_FROM.');
  console.log('NOTE: SMTP, start.gg OAuth, Firebase/APNs and device installation require checks with your own accounts. This audit does not contact them.');
} catch(error) {console.error('CHECK: create .env and branding.local.json with npm run configure -- --init, then apply your configuration.');failed=true;}
process.exitCode=failed?1:0;
