package com.gestortorneos.desktop
import kotlin.test.*
import com.gestortorneos.ui.tournamentClientStatus
class TournamentArchiveStatusTest {
 @Test fun archivedStatusWinsOverOldImportMetadata() {
  for (state in listOf(null, "RUNNING", "FAILED", "COMPLETED")) assertEquals("ARCHIVED", tournamentClientStatus("ARCHIVED", state))
 }
 @Test fun currentTournamentsRetainTheirImportProgress() {
  assertEquals("IMPORTANDO", tournamentClientStatus("DRAFT", "RUNNING"))
  assertEquals("ERROR IMPORTACION", tournamentClientStatus("COMPLETED", "FAILED"))
  assertEquals("IN PROGRESS", tournamentClientStatus("IN_PROGRESS", null))
 }
}
