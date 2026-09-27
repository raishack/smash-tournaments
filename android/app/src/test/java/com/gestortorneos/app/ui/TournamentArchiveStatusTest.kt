package com.gestortorneos.app.ui
import org.junit.Test
import org.junit.Assert.*
import com.gestortorneos.ui.tournamentClientStatus
class TournamentArchiveStatusTest {
 @Test fun archivedStatusWinsOverOldImportMetadata() {
  for (state in listOf(null, "RUNNING", "FAILED", "COMPLETED")) assertEquals("ARCHIVED", tournamentClientStatus("ARCHIVED", state))
 }
 @Test fun currentTournamentsRetainTheirImportProgress() {
  assertEquals("IMPORTING", tournamentClientStatus("DRAFT", "RUNNING"))
  assertEquals("IMPORT ERROR", tournamentClientStatus("COMPLETED", "FAILED"))
  assertEquals("IN PROGRESS", tournamentClientStatus("IN_PROGRESS", null))
 }
}
