// Exercise the production mailer against a private loopback SMTP/TLS sink.
// Uses fake accounts only; never reads .env or sends external mail.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import tls from 'node:tls';
import {spawnSync} from 'node:child_process';
import {once} from 'node:events';

const output=path.resolve('build/registration-smtp-review');
fs.mkdirSync(output,{recursive:true});
const certPath=path.join(output,'localhost-cert.pem');
const keyPath=path.join(output,'localhost-key.pem');
if(!process.argv.includes('--worker')){
  const openssl=process.env.OPENSSL_BIN || (process.platform==='win32'?'C:/Program Files/Git/usr/bin/openssl.exe':'openssl');
  const cert=spawnSync(openssl,['req','-x509','-newkey','rsa:2048','-nodes','-days','1',
    '-keyout',keyPath,'-out',certPath,'-subj','/CN=localhost',
    '-addext','subjectAltName=IP:127.0.0.1,DNS:localhost'],{encoding:'utf8'});
  assert.equal(cert.status,0,'Could not generate local test certificate');
  try{
    const worker=spawnSync(process.execPath,[process.argv[1],'--worker'],{
      stdio:'inherit',env:{...process.env,NODE_EXTRA_CA_CERTS:certPath},timeout:60000});
    process.exitCode=worker.status??1;
  }finally{fs.unlinkSync(keyPath);fs.unlinkSync(certPath);}
}else{
  const {SmtpRegistrationMailer}=await import('../backend/dist/modules/registration/registration-mailer.js');
  const messages=[],sockets=new Set();
  let authenticated=0,tlsConnections=0;
  const server=tls.createServer({key:fs.readFileSync(keyPath),cert:fs.readFileSync(certPath)},socket=>{
    sockets.add(socket);tlsConnections++;
    socket.on('close',()=>sockets.delete(socket));
    socket.on('error',()=>{});
    socket.setTimeout(15000,()=>socket.destroy());
    socket.setEncoding('utf8');
    socket.write('220 localhost SMTP test sink\r\n');
    let buffer='',data=null,authorized=false;
    socket.on('data',chunk=>{
      buffer+=chunk;
      while(buffer.includes('\r\n')){
        const end=buffer.indexOf('\r\n'),line=buffer.slice(0,end);buffer=buffer.slice(end+2);
        if(data!==null){
          if(line==='.'){
            messages.push(data.join('\r\n'));data=null;socket.write('250 Message accepted locally\r\n');
          }else data.push(line.startsWith('..')?line.slice(1):line);
          continue;
        }
        const command=line.split(' ',1)[0].toUpperCase();
        if(command==='EHLO'||command==='HELO')socket.write('250-localhost\r\n250 AUTH PLAIN\r\n');
        else if(command==='AUTH'){
          const fields=Buffer.from(line.split(' ')[2]||'','base64').toString().split('\0');
          authorized=fields[1]==='test-user'&&fields[2]==='test-password';
          if(authorized)authenticated++;
          socket.write(authorized?'235 Authentication successful\r\n':'535 Invalid test credentials\r\n');
        }else if(command==='MAIL'||command==='RCPT'){
          socket.write(!authorized?'530 Authentication required\r\n':line.includes('rejected@example.test')?'550 Test recipient rejected\r\n':'250 OK\r\n');
        }else if(command==='DATA'){
          if(authorized){data=[];socket.write('354 End with dot\r\n');}
          else socket.write('530 Authentication required\r\n');
        }else if(command==='QUIT')socket.end('221 Bye\r\n');
        else socket.write('250 OK\r\n');
      }
    });
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const env={REGISTRATION_MAIL_FROM:'Tournament Platform Test <sender@example.test>',REGISTRATION_SMTP_HOST:'127.0.0.1',
    REGISTRATION_SMTP_PORT:String(server.address().port),REGISTRATION_SMTP_SECURE:'true',
    REGISTRATION_SMTP_USER:'test-user',REGISTRATION_SMTP_PASSWORD:'test-password'};
  try{
    const mailer=new SmtpRegistrationMailer(env);
    assert.equal(mailer.configured,true);
    const link='https://your-domain.example/register/?tournamentId=test#token=SIMULATED_TOKEN';
    await mailer.send('player@example.test','Tournament de prueba: inscripción áéñ',link);
    await mailer.send('player@example.test','Tournament de prueba',link,'Se ha actualizado tu equipo.');
    await assert.rejects(mailer.send('rejected@example.test','Test',link),e=>e.code==='EENVELOPE');
    const badAuth=new SmtpRegistrationMailer({...env,REGISTRATION_SMTP_PASSWORD:'wrong-test-password'});
    await assert.rejects(badAuth.send('player@example.test','Test',link),e=>e.code==='EAUTH');
    assert.equal(messages.length,2);
    const decodeBody=raw=>{
      const body=raw.slice(raw.indexOf('\r\n\r\n')+4);
      if(!/Content-Transfer-Encoding: quoted-printable/i.test(raw))return body;
      const unfolded=body.replace(/=\r\n/g,'');
      return Buffer.from(unfolded.replace(/=([0-9A-F]{2})/gi,(_,hex)=>String.fromCharCode(parseInt(hex,16))),'latin1').toString('utf8');
    };
    const confirmation=decodeBody(messages[0]),notice=decodeBody(messages[1]);
    assert.match(messages[0],/From: Tournament Platform Test <sender@example\.test>/);
    assert.match(messages[0],/To: player@example\.test/);
    assert(confirmation.includes('Confirm registration'));
    assert(confirmation.includes('24 horas'));
    assert(confirmation.includes('Tournament de prueba: inscripción áéñ'));
    assert(confirmation.includes(link));
    assert(notice.includes('Se ha actualizado tu equipo.'));
    assert(notice.includes(link));
    fs.writeFileSync(path.join(output,'confirmation.eml'),messages[0]);
    fs.writeFileSync(path.join(output,'notice.eml'),messages[1]);
    const result={smtp:'loopback TLS simulator',productionMailer:true,certificateVerified:true,
      tlsConnections,authenticatedConnections:authenticated,capturedMessages:messages.length,
      confirmationContentVerified:true,noticeContentVerified:true,recipientRejectionVerified:true,
      authenticationFailureVerified:true,externalEmailsSent:0};
    fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2));
    console.log(JSON.stringify(result));
  }finally{
    for(const socket of sockets)socket.destroy();
    await new Promise(resolve=>server.close(resolve));
  }
}
