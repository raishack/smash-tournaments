import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const script=fs.readFileSync(path.join(root,'scripts/modern-bracket-search.js'),'utf8');
const android=['android/shared-bracket/src/main/kotlin/com/gestortorneos/bracket/ModernBracketBoard.kt','android/app/src/main/java/com/gestortorneos/app/ui/ExperimentalBracketBoard.kt'].map(p=>path.join(root,p)).find(fs.existsSync);
const iosFolders=['ios-manage-main/GestorTorneosMainIOS','ios-manage/GestorTorneosSmashIOS','ios-manage/TournamentManagerIOS'];
const ios=iosFolders.map(p=>path.join(root,p,'TournamentDetailViews.swift')).filter(fs.existsSync);
ios.push(...['ios-player/SmashGaliciaPlayer/AppViews.swift','ios-player/TournamentPlayerIOS/AppViews.swift'].map(p=>path.join(root,p)).filter(fs.existsSync));
for(const [file,source]of [[android,'private val modernBracketSearchScript = """\n'+script.replaceAll('$',"${'$'}")+'\n""".trimIndent()\n'],...ios.map(file=>[file,'private let modernBracketSearchScript = #"""\n'+script+'\n"""#\n'])]) {
 if(!file)throw Error('Missing native renderer');
 const before=fs.readFileSync(file,'utf8');
 const marker='// Generated bracket search: scripts/sync-native-bracket-search.mjs';
 const clean=before.includes(marker)?before.slice(0,before.indexOf(marker)):before.trimEnd()+'\n\n';
 fs.writeFileSync(file,clean+marker+'\n'+source);
}
