package com.gestortorneos.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

data class LadderSettings(val mode: String = "CASUAL", val bestOf: Int = 5, val readySeconds: Int = 300, val rematchWaitSeconds: Int = 180, val minimumSets: Int = 3, val requireConfirmation: Boolean = false, val setupNumbers: List<Int> = emptyList(), val opensAt: String? = null, val closesAt: String? = null)
data class LadderOptions(val settings: LadderSettings = LadderSettings(), val paused: Boolean = false, val closing: Boolean = false, val revision: String? = null)
data class LadderSession(val status: String = "", val options: LadderOptions? = null)
data class LadderEntrant(val participantId: String = "", val displayName: String = "", val score: Int = 0)
data class LadderDetails(val revision: String? = null, val suspensionReason: String? = null, val disputeReason: String? = null)
data class LadderSet(val id: String = "", val status: String = "", val bestOf: Int = 5, val stationLabel: String? = null, val participants: List<LadderEntrant> = emptyList(), val details: LadderDetails? = null)
data class LadderQueue(val participantId: String = "", val displayName: String = "", val queuedAt: String = "", val waitingReason: String? = null)
data class LadderRank(val displayName: String = "", val wins: Int = 0, val losses: Int = 0, val rating: Int = 1000, val eligible: Boolean = false, val winRate: Int = 0)
data class LadderEvent(val action: String = "", val actor: String = "", val createdAt: String = "", val reason: String? = null)
data class LadderBoard(val session: LadderSession? = null, val queue: List<LadderQueue> = emptyList(), val activeMatches: List<LadderSet> = emptyList(), val completedMatches: List<LadderSet> = emptyList(), val standings: List<LadderRank> = emptyList(), val activity: List<LadderEvent> = emptyList())
data class LadderScore(val participantId: String, val score: Int)
data class LadderControl(val action: String, val actor: String = "staff", val expectedRevision: String? = null, val participantId: String? = null, val matchId: String? = null, val reason: String? = null, val settings: LadderSettings? = null, val winnerParticipantId: String? = null, val scores: List<LadderScore>? = null)

fun ladderStatus(status: String) = when(status) {
    "READY_CHECK" -> "Confirming attendance"; "PLAYING" -> "Playing"; "SUSPENDED" -> "Waiting for bracket / setup"
    "AWAITING_CONFIRMATION" -> "Result awaiting opponent"; "DISPUTED" -> "Disputed · review result"
    "COMPLETED" -> "Completed"; "CANCELLED" -> "Cancelled"; "EXPIRED" -> "Awaiting absence confirmation"; else -> status
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun LadderConsole(load: suspend () -> LadderBoard, control: suspend (LadderControl) -> LadderBoard, participants: List<Pair<String,String>>, onClose: () -> Unit) {
    var board by remember { mutableStateOf<LadderBoard?>(null) }
    var busy by remember { mutableStateOf(false) }
    var generation by remember { mutableStateOf(0) }
    var error by remember { mutableStateOf<String?>(null) }
    var editing by remember { mutableStateOf(false) }
    var editRevision by remember { mutableStateOf<String?>(null) }
    var editSnapshot by remember { mutableStateOf(LadderSettings()) }
    var selected by remember { mutableStateOf<LadderSet?>(null) }
    val scope = rememberCoroutineScope()
    val currentLoad by rememberUpdatedState(load)
    val currentControl by rememberUpdatedState(control)
    fun send(input: LadderControl) { if (busy) return; busy = true; generation++; error = null; scope.launch {
        try { board = currentControl(input); selected = null; editing = false } catch(e: Exception) { error = e.message ?: "Could not save" } finally { busy = false }
    } }
    LaunchedEffect(Unit) { while (true) { if (!busy) { try { val current = generation; val next = currentLoad(); if (!busy && current == generation) board = next } catch(e: Exception) { error = e.message ?: "Offline" } }; delay(5000) } }
    AlertDialog(onDismissRequest = { if (!busy) onClose() }, confirmButton = { TextButton(onClick=onClose,enabled=!busy) { Text("Close") } }, title = { Text("Ladder control") }, text = {
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()), verticalArrangement=Arrangement.spacedBy(12.dp)) {
            if(busy) LinearProgressIndicator(Modifier.fillMaxWidth())
            error?.let { Text(it,color=MaterialTheme.colorScheme.error) }
            val session = board?.session
            val options = session?.options ?: LadderOptions()
            Text(when { session == null -> "Start the ladder from the tournament"; session.status == "COMPLETED" -> "Finished"; options.closing -> "Closing · open sets may finish"; options.paused -> "Paused · no new pairings"; else -> "Active" })
            Text("${options.settings.mode} · Bo${options.settings.bestOf} · ${board?.queue?.size ?: 0} queued · ${board?.activeMatches?.size ?: 0} open sets")
            if(session?.status == "ACTIVE") {
                FlowRow(horizontalArrangement=Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(enabled=!busy,onClick={send(LadderControl(if(options.paused) "RESUME" else "PAUSE",expectedRevision=options.revision))}) { Text(if(options.paused) "Resume" else "Pause") }
                    OutlinedButton(enabled=!busy,onClick={editRevision=options.revision;editSnapshot=options.settings;editing=true}) { Text("Settings") }
                    OutlinedButton(enabled=!busy && !options.closing,onClick={send(LadderControl("CLOSE",expectedRevision=options.revision))}) { Text("Close registration") }
                }
                var addPlayer by remember { mutableStateOf(false) }
                TextButton(enabled=!busy && !options.closing,onClick={addPlayer=!addPlayer}) { Text("Add / remove player") }
                if(addPlayer) participants.forEach { (id,name) ->
                    Text(name)
                    Row { TextButton(enabled=!busy,onClick={send(LadderControl("ADD_PLAYER",participantId=id,expectedRevision=options.revision))}) { Text("Join queue") }; TextButton(enabled=!busy,onClick={send(LadderControl("REMOVE_PLAYER",participantId=id,expectedRevision=options.revision))}) { Text("Remove") } }
                }
            }
            if(!board?.queue.isNullOrEmpty()) Text("Queue · priority is kept while waiting for the bracket",style=MaterialTheme.typography.titleSmall)
            board?.queue?.forEachIndexed { i,q -> Text("${i+1}. ${q.displayName}\n${q.waitingReason ?: "Waiting for opponent"}",style=MaterialTheme.typography.bodyMedium) }
            board?.activeMatches?.forEach { match ->
                OutlinedCard(Modifier.fillMaxWidth()) { Column(Modifier.padding(12.dp)) {
                    Text(match.participants.joinToString("  —  ") { "${it.displayName} ${it.score}" })
                    Text("${ladderStatus(match.status)} · Bo${match.bestOf} · ${match.stationLabel ?: "No assigned setup"}",style=MaterialTheme.typography.bodySmall)
                    (match.details?.disputeReason ?: match.details?.suspensionReason)?.let { Text(it) }
                    TextButton(enabled=!busy,onClick={selected=match}) { Text("Manage set") }
                } }
            }
            Text("Standings",style=MaterialTheme.typography.titleMedium)
            Text(if(options.settings.mode=="COMPETITIVE") "Event rating · minimum ${options.settings.minimumSets} sets. Provisional players appear last." else "Sorted by wins and game difference.",style=MaterialTheme.typography.bodySmall)
            board?.standings?.forEachIndexed { i,s -> Text("${i+1}. ${s.displayName} · ${s.wins}–${s.losses} · ${s.winRate}%" + if(options.settings.mode=="COMPETITIVE") " · ${s.rating}${if(!s.eligible) " · provisional" else ""}" else "") }
            var history by remember { mutableStateOf(false) }
            TextButton(onClick={history=!history}) { Text("History and activity") }
            if(history) {
                board?.completedMatches?.take(50)?.forEach { match ->
                    Text("${match.participants.joinToString(" — ") { "${it.displayName} ${it.score}" }} · ${ladderStatus(match.status)}")
                    if(session?.status=="ACTIVE" && match.status=="COMPLETED") TextButton(enabled=!busy,onClick={selected=match}) { Text("Correct") }
                }
                board?.activity?.take(30)?.forEach { Text("${it.createdAt.take(19).replace('T',' ')} · ${it.action} · ${it.actor}${it.reason?.let { r -> " · $r" } ?: ""}",style=MaterialTheme.typography.bodySmall) }
            }
        }
    })
    if(editing) LadderSettingsDialog(editSnapshot,busy,{editing=false}) { settings -> send(LadderControl("SETTINGS",expectedRevision=editRevision,settings=settings)) }
    selected?.let { match -> LadderSetDialog(match,busy,{selected=null}) { action,reason,scores ->
        send(LadderControl(action,matchId=match.id,expectedRevision=match.details?.revision,reason=reason,scores=scores,winnerParticipantId=scores?.maxByOrNull { it.score }?.participantId))
    } }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun LadderSettingsDialog(settings: LadderSettings,busy:Boolean,onClose:()->Unit,onSave:(LadderSettings)->Unit) {
    var mode by remember { mutableStateOf(settings.mode) };var best by remember { mutableStateOf(settings.bestOf) };var confirm by remember { mutableStateOf(settings.requireConfirmation) }
    var ready by remember { mutableStateOf(settings.readySeconds.toString()) };var rematch by remember { mutableStateOf(settings.rematchWaitSeconds.toString()) };var minimum by remember { mutableStateOf(settings.minimumSets.toString()) }
    var setups by remember { mutableStateOf(settings.setupNumbers.joinToString(",")) };var opens by remember { mutableStateOf(settings.opensAt ?: "") };var closes by remember { mutableStateOf(settings.closesAt ?: "") }
    val numbers=setups.split(',').map(String::trim).filter(String::isNotBlank).map { it.toIntOrNull() }
    val valid=ready.toIntOrNull() in 30..900 && rematch.toIntOrNull() in 0..1800 && minimum.toIntOrNull() in 1..50 && numbers.all { it!=null && it in 1..256 }
    AlertDialog(onDismissRequest=onClose,title={Text("Ladder settings")},confirmButton={Button(enabled=!busy && valid,onClick={onSave(LadderSettings(mode,best,ready.toInt(),rematch.toInt(),minimum.toInt(),confirm,numbers.filterNotNull(),opens.trim().ifBlank { null },closes.trim().ifBlank { null }))}){Text("Save")}},dismissButton={TextButton(onClick=onClose){Text("Cancel")}},text={Column(Modifier.verticalScroll(rememberScrollState()),verticalArrangement=Arrangement.spacedBy(8.dp)) {
        FlowRow { listOf("CASUAL","COMPETITIVE").forEach { value -> FilterChip(selected=mode==value,onClick={mode=value},label={Text(if(value=="CASUAL") "Casual" else "Competitive")}) } }
        FlowRow { listOf(1,3,5).forEach { value -> FilterChip(selected=best==value,onClick={best=value},label={Text("Bo$value")}) } }
        Text("Changes apply to new sets. The main bracket takes priority.")
        Row { Checkbox(checked=confirm,onCheckedChange={confirm=it});Text("The opponent confirms the result") }
        OutlinedTextField(ready,{ready=it},label={Text("Attendance confirmation · seconds (30–900)")})
        OutlinedTextField(rematch,{rematch=it},label={Text("Maximum wait before rematching · seconds")})
        OutlinedTextField(minimum,{minimum=it},label={Text("Minimum sets for competitive standings")})
        OutlinedTextField(setups,{setups=it},label={Text("Allowed setups · e.g. 3,4")},supportingText={Text("Empty: manual assignment, no automatic reservation")})
        OutlinedTextField(opens,{opens=it},label={Text("Optional opening · UTC")},supportingText={Text("Example: 2026-09-20T16:00:00Z")})
        OutlinedTextField(closes,{closes=it},label={Text("Optional closing · UTC")})
        if(!valid) Text("Check numeric values",color=MaterialTheme.colorScheme.error)
    }})
}

@Composable
private fun LadderSetDialog(match:LadderSet,busy:Boolean,onClose:()->Unit,onAction:(String,String,List<LadderScore>?)->Unit) {
    var reason by remember { mutableStateOf("") };var scoreOne by remember { mutableStateOf(match.participants.getOrNull(0)?.score?.toString() ?: "0") };var scoreTwo by remember { mutableStateOf(match.participants.getOrNull(1)?.score?.toString() ?: "0") }
    val needed=match.bestOf/2+1;val one=scoreOne.toIntOrNull();val two=scoreTwo.toIntOrNull()
    val valid=reason.isNotBlank() && one!=null && two!=null && ((one==needed && two in 0 until needed)||(two==needed && one in 0 until needed))
    AlertDialog(onDismissRequest=onClose,title={Text("Manage set · Bo${match.bestOf}")},confirmButton={TextButton(onClick=onClose){Text("Back")}},text={Column(verticalArrangement=Arrangement.spacedBy(8.dp)) {
        OutlinedTextField(reason,{reason=it},label={Text("Reason required")})
        if(match.status!="READY_CHECK") {
            OutlinedTextField(scoreOne,{scoreOne=it},label={Text(match.participants.getOrNull(0)?.displayName ?: "Player 1")})
            OutlinedTextField(scoreTwo,{scoreTwo=it},label={Text(match.participants.getOrNull(1)?.displayName ?: "Player 2")})
            Button(enabled=!busy && valid,onClick={onAction("RESOLVE_RESULT",reason,match.participants.mapIndexed { i,p -> LadderScore(p.participantId,if(i==0) one!! else two!!) })}){Text("Save result")}
        }
        if(match.status in listOf("COMPLETED","DISPUTED","AWAITING_CONFIRMATION")) OutlinedButton(enabled=!busy && reason.isNotBlank(),onClick={onAction("REOPEN_MATCH",reason,null)}){Text("Reopen for play")}
        if(match.status!="COMPLETED") OutlinedButton(enabled=!busy && reason.isNotBlank(),onClick={onAction("CANCEL_MATCH",reason,null)}){Text("Cancel and return to queue")}
    }})
}
