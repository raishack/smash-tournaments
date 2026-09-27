package com.gestortorneos.app.ui

import com.gestortorneos.app.data.TournamentRepository
import com.gestortorneos.app.data.remote.TournamentApi
import com.google.gson.JsonParser
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.*
import org.junit.Test
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory

class MainTournamentApiTest {
    private val tournament = """{"id":"test","title":"Prueba local","gameTitle":"Fortnite","description":"Tournament de prueba",
        "platform":"PC","status":"DRAFT","maxParticipants":100,"settings":{"format":"SINGLE_ELIMINATION",
        "bracketMode":"FORTNITE","fortniteLobbySize":100,"fortniteGamesPerRound":7,"teamSize":1,"reserveCount":0,
        "bestOf":3,"seedingMethod":"RANDOM","callTimeoutMinutes":10}}"""

    private fun input(mode: String, teamSize: Int) = CreateTournamentInput(
        title = "Prueba local", gameTitle = if (teamSize > 1) "Valorant" else "Fortnite",
        description = "Tournament de prueba", platform = "PC", maxParticipants = 100,
        format = "SINGLE_ELIMINATION", bracketMode = mode, mkartAdvanceCount = 1, mkartLosersAdvanceCount = 1,
        bestOf = 3, winnersBestOf = 3, losersBestOf = 3, seedingMethod = "RANDOM", callTimeoutMinutes = 10,
        setupCount = 1, teamSize = teamSize, reserveCount = if (teamSize > 1) 2 else 0,
        allowSoloRegistration = teamSize > 1, fortniteLobbySize = 100, fortniteGamesPerRound = 7
    )

    @Test fun teamCreationSendsRosterAndSoloOptions() = runBlocking {
        MockWebServer().use { server ->
            server.start()
            val repo = repository(server)
            server.enqueue(MockResponse().setBody(tournament))
            repo.createTournament(input("STANDARD", 5))
            val request = server.takeRequest()
            assertEquals("POST", request.method)
            val settings = JsonParser.parseString(request.body.readUtf8()).asJsonObject.getAsJsonObject("settings")
            assertEquals(5, settings["teamSize"].asInt)
            assertEquals(2, settings["reserveCount"].asInt)
            assertTrue(settings["allowSoloRegistration"].asBoolean)
            assertEquals("STANDARD", settings["bracketMode"].asString)
        }
    }

    @Test fun fortniteCreationAndEditingKeepConfiguredGroupSizeAndGameCount() = runBlocking {
        MockWebServer().use { server ->
            server.start()
            val repo = repository(server)
            server.enqueue(MockResponse().setBody(tournament))
            repo.createTournament(input("FORTNITE", 1))
            val settings = JsonParser.parseString(server.takeRequest().body.readUtf8()).asJsonObject.getAsJsonObject("settings")
            assertEquals("FORTNITE", settings["bracketMode"].asString)
            assertEquals(100, settings["fortniteLobbySize"].asInt)
            assertEquals(7, settings["fortniteGamesPerRound"].asInt)
            val overview = """{"tournament":$tournament,"participants":[],"matches":[]}"""
            server.enqueue(MockResponse().setBody(overview))
            val detail = repo.getTournament("test")
            server.takeRequest()
            assertEquals(100, detail.fortniteLobbySize)
            assertEquals(7, detail.fortniteGamesPerRound)
            server.enqueue(MockResponse().setBody(tournament))
            server.enqueue(MockResponse().setBody(overview))
            repo.updateTournament("test", detail.copy(title = "Name actualizado"))
            val saved = JsonParser.parseString(server.takeRequest().body.readUtf8()).asJsonObject.getAsJsonObject("settings")
            assertEquals(100, saved["fortniteLobbySize"].asInt)
            assertEquals(7, saved["fortniteGamesPerRound"].asInt)
        }
    }

    private fun repository(server: MockWebServer) = TournamentRepository(
        Retrofit.Builder().baseUrl(server.url("/")).addConverterFactory(GsonConverterFactory.create()).build().create(TournamentApi::class.java)
    )
}
