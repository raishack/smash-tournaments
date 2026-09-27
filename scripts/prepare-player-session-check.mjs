import fs from 'node:fs';

// Execute the real refresh/logout/publication methods with controlled network
// completions. The full apps are separately compiled with Xcode.
const [sourceFile,output]=process.argv.slice(2);
if(!sourceFile||!output)throw Error('Usage: node scripts/prepare-player-session-check.mjs DataLayer.swift output.swift');
const source=fs.readFileSync(sourceFile,'utf8');
function method(name){
  const start=source.indexOf('    '+(name==='clearLocalSession'||name==='nextRefreshRequestId'||name==='replaceTournament'?'private ':'')+'func '+name+'(');
  if(start<0)throw Error('Missing '+name);
  let end=source.indexOf('{',start),depth=1;
  while(depth&&++end<source.length){if(source[end]==='{')depth++;else if(source[end]==='}')depth--;}
  return source.slice(start,end+1);
}
fs.writeFileSync(output,`import Foundation
struct PlayerSession { let sessionToken:String }
struct PlayerProfile { let name:String }
struct PlayerTournament { let tournamentId:String; let title:String }
enum SessionStore { static func clearSession() {} }
@MainActor enum PlayerLocalNotifications {
    static var calls=0
    static func syncNotifications(for tournaments:[PlayerTournament]) { calls += 1 }
}
@MainActor final class ControlledRepository {
    var pending:CheckedContinuation<[PlayerTournament],Error>?
    func getProfile(sessionToken:String) async throws -> PlayerProfile { PlayerProfile(name:sessionToken) }
    func getMyTournaments(sessionToken:String) async throws -> [PlayerTournament] {
        try await withCheckedThrowingContinuation { pending=$0 }
    }
}
@MainActor final class PlayerAppViewModel {
    var session:PlayerSession?
    var profile:PlayerProfile?
    var tournaments:[PlayerTournament]=[]
    var loginURL:URL?
    var error:String?
    private var latestRefreshRequestId=0
    private var isReloading=false
    let repository=ControlledRepository()
    func stopPolling() {}
    func accept(_ row:PlayerTournament,token:String){replaceTournament(row,sessionToken:token)}
${['reloadAll','logout','clearLocalSession','replaceTournament','nextRefreshRequestId'].map(method).join('\n')}
}
@main struct PlayerSessionChecks {
    @MainActor static func main() async {
        let vm=PlayerAppViewModel(),old=PlayerTournament(tournamentId:"t",title:"Old session")
        for scenario in 0..<3 {
            vm.session=PlayerSession(sessionToken:"A")
            vm.repository.pending=nil
            let refresh=Task { await vm.reloadAll() }
            while vm.repository.pending == nil { await Task.yield() }
            if scenario == 1 { vm.session=PlayerSession(sessionToken:"B") } else { vm.logout() }
            if scenario == 2 { vm.repository.pending!.resume(throwing:URLError(.timedOut)) }
            else { vm.repository.pending!.resume(returning:[old]) }
            await refresh.value
            precondition(vm.tournaments.isEmpty && vm.profile == nil,"A response from an old session restored private data")
            precondition(vm.error == nil,"A response from an old session restored an error")
            precondition(PlayerLocalNotifications.calls==0,"Old session scheduled notifications")
        }
        vm.session=PlayerSession(sessionToken:"B")
        vm.tournaments=[PlayerTournament(tournamentId:"t",title:"Current session")]
        vm.accept(old,token:"A")
        precondition(vm.tournaments[0].title=="Current session","Old mutation overwrote current data")
        vm.accept(PlayerTournament(tournamentId:"t",title:"New result"),token:"B")
        precondition(vm.tournaments[0].title=="New result")
        print("PASS Players: late success/error after logout or account change discarded; current-session results still apply")
    }
}
`);
