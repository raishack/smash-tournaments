package com.gestortorneos.player.data

import android.content.Context

data class PlayerSession(
    val sessionToken: String,
    val displayName: String,
    val gamerTag: String
)

object PlayerSessionStore {
    private const val PREFERENCES_NAME = "gestor_torneos_player_session"
    private const val KEY_SESSION_TOKEN = "session_token"
    private const val KEY_DISPLAY_NAME = "display_name"
    private const val KEY_GAMER_TAG = "gamer_tag"
    private const val KEY_BACKGROUND_SYNC_ARMED = "background_sync_armed"
    private const val KEY_PUSH_TOKEN = "push_token"
    private const val KEY_PUSH_SESSION_TOKEN = "push_session_token"

    fun load(context: Context): PlayerSession? {
        val preferences = context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
        val sessionToken = preferences.getString(KEY_SESSION_TOKEN, null)?.trim().orEmpty()
        if (sessionToken.isBlank()) {
            return null
        }
        return PlayerSession(
            sessionToken = sessionToken,
            displayName = preferences.getString(KEY_DISPLAY_NAME, null)?.trim().orEmpty(),
            gamerTag = preferences.getString(KEY_GAMER_TAG, null)?.trim().orEmpty()
        )
    }

    fun save(context: Context, session: PlayerSession) {
        context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_SESSION_TOKEN, session.sessionToken)
            .putString(KEY_DISPLAY_NAME, session.displayName)
            .putString(KEY_GAMER_TAG, session.gamerTag)
            .apply()
    }

    fun isBackgroundSyncArmed(context: Context): Boolean {
        return context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
            .getBoolean(KEY_BACKGROUND_SYNC_ARMED, false)
    }

    fun setBackgroundSyncArmed(context: Context, armed: Boolean) {
        context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(KEY_BACKGROUND_SYNC_ARMED, armed)
            .apply()
    }

    fun savePushRegistration(context: Context, sessionToken: String, pushToken: String) {
        context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_PUSH_SESSION_TOKEN, sessionToken)
            .putString(KEY_PUSH_TOKEN, pushToken)
            .apply()
    }

    fun getRegisteredPushToken(context: Context): String {
        return context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
            .getString(KEY_PUSH_TOKEN, null)
            ?.trim()
            .orEmpty()
    }

    fun isPushRegisteredForSession(context: Context, sessionToken: String, pushToken: String): Boolean {
        val preferences = context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
        return preferences.getString(KEY_PUSH_SESSION_TOKEN, null) == sessionToken
            && preferences.getString(KEY_PUSH_TOKEN, null) == pushToken
    }

    fun clearPushRegistration(context: Context) {
        context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
            .edit()
            .remove(KEY_PUSH_SESSION_TOKEN)
            .remove(KEY_PUSH_TOKEN)
            .apply()
    }

    fun clear(context: Context) {
        context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
            .edit()
            .clear()
            .apply()
    }
}
