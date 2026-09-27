@file:OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)

package com.gestortorneos.desktop

import androidx.compose.foundation.relocation.BringIntoViewRequester
import androidx.compose.foundation.relocation.bringIntoViewRequester
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
internal fun TournamentReviewAnchor(key: String, anchors: MutableMap<String, BringIntoViewRequester>) {
    val requester = remember { BringIntoViewRequester() }
    DisposableEffect(key, requester) { anchors[key] = requester; onDispose { if (anchors[key] === requester) anchors.remove(key) } }
    Spacer(Modifier.size(1.dp).bringIntoViewRequester(requester))
}
