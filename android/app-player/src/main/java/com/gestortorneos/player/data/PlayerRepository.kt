package com.gestortorneos.player.data

import com.gestortorneos.player.data.remote.NetworkModule
import com.gestortorneos.player.data.remote.PlayerAbsenceRequestDto
import com.gestortorneos.player.data.remote.PlayerCharactersRequestDto
import com.gestortorneos.player.data.remote.PlayerCharacterSelectionRequestDto
import com.gestortorneos.player.data.remote.PlayerDetailedReportGameDto
import com.gestortorneos.player.data.remote.PlayerDetailedReportRequestDto
import com.gestortorneos.player.data.remote.PlayerDetailedReportSelectionDto
import com.gestortorneos.player.data.remote.PlayerGameWinRequestDto
import com.gestortorneos.player.data.remote.PlayerLadderActionRequestDto
import com.gestortorneos.player.data.remote.PlayerMatchDto
import com.gestortorneos.player.data.remote.PlayerProfileDto
import com.gestortorneos.player.data.remote.PlayerPushTokenRequestDto
import com.gestortorneos.player.data.remote.PlayerReportResultRequestDto
import com.gestortorneos.player.data.remote.PlayerScoreDto
import com.gestortorneos.player.data.remote.PlayerStartggAuthStartRequestDto
import com.gestortorneos.player.data.remote.PlayerTournamentDto

class PlayerRepository {
    data class DetailedReportedGame(
        val winnerParticipantId: String,
        val selections: List<Pair<String, String>> = emptyList()
    )

    private val api get() = NetworkModule.playerApi()

    suspend fun createStartggLogin(redirectUri: String): String {
        return api.createStartggLogin(PlayerStartggAuthStartRequestDto(redirectUri)).authorizationUrl
    }

    suspend fun getProfile(sessionToken: String): PlayerProfileDto {
        return api.getProfile(authHeader(sessionToken))
    }

    suspend fun logout(sessionToken: String) {
        api.logout(authHeader(sessionToken))
    }

    suspend fun getMyTournaments(sessionToken: String): List<PlayerTournamentDto> {
        return api.getMyTournaments(authHeader(sessionToken)).tournaments
    }

    suspend fun registerPushToken(
        sessionToken: String,
        token: String,
        deviceLabel: String?
    ) {
        api.registerPushToken(
            authHeader(sessionToken),
            PlayerPushTokenRequestDto(token = token, deviceLabel = deviceLabel)
        )
    }

    suspend fun unregisterPushToken(
        sessionToken: String,
        token: String,
        deviceLabel: String?
    ) {
        api.unregisterPushToken(
            authHeader(sessionToken),
            PlayerPushTokenRequestDto(token = token, deviceLabel = deviceLabel)
        )
    }

    suspend fun getMyTournament(sessionToken: String, tournamentId: String): PlayerTournamentDto {
        return api.getMyTournament(authHeader(sessionToken), tournamentId)
    }

    suspend fun updateCharacters(
        sessionToken: String,
        tournamentId: String,
        matchId: String,
        selections: List<Pair<String, String>>
    ): PlayerMatchDto {
        return api.updateCharacters(
            authHeader(sessionToken),
            tournamentId,
            matchId,
            PlayerCharactersRequestDto(
                selections = selections.map { (participantId, characterName) ->
                    PlayerCharacterSelectionRequestDto(participantId, characterName)
                }
            )
        )
    }

    suspend fun recordGameWin(
        sessionToken: String,
        tournamentId: String,
        matchId: String,
        participantId: String
    ): PlayerMatchDto {
        return api.recordGameWin(
            authHeader(sessionToken),
            tournamentId,
            matchId,
            PlayerGameWinRequestDto(participantId)
        )
    }

    suspend fun reportResult(
        sessionToken: String,
        tournamentId: String,
        matchId: String,
        winnerParticipantId: String,
        scores: List<Pair<String, Int>>
    ): PlayerMatchDto {
        return api.reportResult(
            authHeader(sessionToken),
            tournamentId,
            matchId,
            PlayerReportResultRequestDto(
                winnerParticipantId = winnerParticipantId,
                scores = scores.map { (participantId, score) -> PlayerScoreDto(participantId, score) }
            )
        )
    }

    suspend fun reportDetailedResult(
        sessionToken: String,
        tournamentId: String,
        matchId: String,
        bestOfOverride: Int?,
        games: List<DetailedReportedGame>
    ): PlayerMatchDto {
        return api.reportDetailedResult(
            authHeader(sessionToken),
            tournamentId,
            matchId,
            PlayerDetailedReportRequestDto(
                bestOfOverride = bestOfOverride,
                games = games.map { game ->
                    PlayerDetailedReportGameDto(
                        winnerParticipantId = game.winnerParticipantId,
                        selections = game.selections
                            .takeIf { it.isNotEmpty() }
                            ?.map { (participantId, characterName) ->
                                PlayerDetailedReportSelectionDto(participantId, characterName)
                            }
                    )
                }
            )
        )
    }

    suspend fun resolveAbsence(
        sessionToken: String,
        tournamentId: String,
        matchId: String,
        outcome: String
    ): PlayerMatchDto {
        return api.resolveAbsence(
            authHeader(sessionToken),
            tournamentId,
            matchId,
            PlayerAbsenceRequestDto(outcome)
        )
    }

    suspend fun resetMatch(
        sessionToken: String,
        tournamentId: String,
        matchId: String
    ): PlayerMatchDto {
        return api.resetMatch(
            authHeader(sessionToken),
            tournamentId,
            matchId
        )
    }

    suspend fun joinLadderQueue(
        sessionToken: String,
        tournamentId: String
    ): PlayerTournamentDto {
        return api.joinLadderQueue(
            authHeader(sessionToken),
            tournamentId,
            PlayerLadderActionRequestDto()
        )
    }

    suspend fun leaveLadderQueue(
        sessionToken: String,
        tournamentId: String
    ): PlayerTournamentDto {
        return api.leaveLadderQueue(
            authHeader(sessionToken),
            tournamentId,
            PlayerLadderActionRequestDto()
        )
    }

    suspend fun readyLadderMatch(
        sessionToken: String,
        tournamentId: String,
        matchId: String
    ): PlayerTournamentDto {
        return api.readyLadderMatch(
            authHeader(sessionToken),
            tournamentId,
            matchId,
            PlayerLadderActionRequestDto()
        )
    }

    suspend fun reviewLadder(token: String, tournamentId: String, matchId: String, revision: String, action: String, reason: String?) = api.reviewLadder(authHeader(token),tournamentId,matchId,com.gestortorneos.player.data.remote.PlayerLadderReviewRequest(action,revision,reason))
    suspend fun cancelLadderMatch(
        sessionToken: String,
        tournamentId: String,
        matchId: String
    ): PlayerTournamentDto {
        return api.cancelLadderMatch(
            authHeader(sessionToken),
            tournamentId,
            matchId,
            PlayerLadderActionRequestDto()
        )
    }

    suspend fun reportLadderDetailedResult(
        sessionToken: String,
        tournamentId: String,
        matchId: String,
        bestOfOverride: Int?,
        games: List<DetailedReportedGame>
    ): PlayerTournamentDto {
        return api.reportLadderDetailedResult(
            authHeader(sessionToken),
            tournamentId,
            matchId,
            PlayerDetailedReportRequestDto(
                bestOfOverride = bestOfOverride,
                games = games.map { game ->
                    PlayerDetailedReportGameDto(
                        winnerParticipantId = game.winnerParticipantId,
                        selections = game.selections
                            .takeIf { it.isNotEmpty() }
                            ?.map { (participantId, characterName) ->
                                PlayerDetailedReportSelectionDto(participantId, characterName)
                            }
                    )
                }
            )
        )
    }

    private fun authHeader(sessionToken: String): String = "Bearer ${sessionToken.trim()}"
}
