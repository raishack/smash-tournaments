package com.gestortorneos.bracket

import com.gestortorneos.ui.MainPalette
import androidx.compose.ui.platform.LocalDensity
import android.annotation.SuppressLint
import android.graphics.Color as AndroidColor
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.WebResourceRequest
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.window.DialogWindowProvider
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

@Composable
fun ModernBracketBoard(
    matches: List<MatchSummary>,
    hideAutomaticAdvances: Boolean = false,
    callTimeoutMinutes: Int = 10,
    selectableMatchIds: Set<String> = emptySet(),
    onMatchSelected: ((String) -> Unit)? = null,
    errorMessage: String? = null,
    onFullscreenChanged: (Boolean) -> Unit = {},
    characterAssetUrl: (String) -> String?,
) {
    val currentOnMatchSelected by rememberUpdatedState(onMatchSelected)
    val visibleMatches = remember(matches, hideAutomaticAdvances) {
        val withoutDormantReset = matches.filterNot { experimentalIsDormantGrandFinalReset(matches, it) }
        if (hideAutomaticAdvances) {
            withoutDormantReset.filterNot(::experimentalIsAutomaticAdvanceDisplayMatch)
        } else {
            withoutDormantReset
        }
    }
    val darkTheme = MainPalette.isDark
    val readingScale = LocalDensity.current.fontScale
    val html = remember(visibleMatches, selectableMatchIds, callTimeoutMinutes, darkTheme, readingScale, characterAssetUrl) {
        buildExperimentalBracketHtml(visibleMatches, selectableMatchIds, callTimeoutMinutes, darkTheme, readingScale, characterAssetUrl)
    }
    val viewportController = remember { ExperimentalBracketViewportController() }
    var fullscreen by rememberSaveable { mutableStateOf(false) }
    val notifyFullscreen by rememberUpdatedState(onFullscreenChanged)
    SideEffect { notifyFullscreen(fullscreen) }
    DisposableEffect(Unit) { onDispose { notifyFullscreen(false) } }
    val context = LocalContext.current
    // Move the same WebView between hosts: zoom, selected pool and pan survive.
    val webView = remember(context) {
        createExperimentalBracketWebView(
            context = context,
            hasMatchSelection = currentOnMatchSelected,
            onPageFinished = { viewportController.restoreAfterLoad(it) },
            onMatchSelected = { matchId -> currentOnMatchSelected?.invoke(matchId) },
        ).apply { viewportController.loadInitial(this, html) }
    }
    DisposableEffect(webView) {
        onDispose {
            (webView.parent as? ViewGroup)?.removeView(webView)
            webView.destroy()
        }
    }
    Column {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
            TextButton(enabled = !fullscreen, onClick = { fullscreen = true }) { Text("Pantalla completa") }
        }
        if (fullscreen) {
            Spacer(Modifier.fillMaxWidth().height(620.dp))
        } else {
            BracketWebViewHost(webView, html, viewportController, Modifier.fillMaxWidth().height(620.dp))
        }
    }
    if (fullscreen) {
        Dialog(onDismissRequest = { fullscreen = false }, properties = DialogProperties(
            usePlatformDefaultWidth = false, decorFitsSystemWindows = false,
        )) {
            val dialogView = LocalView.current
            DisposableEffect(dialogView) {
                (dialogView.parent as? DialogWindowProvider)?.window?.let { window ->
                    WindowCompat.getInsetsController(window, dialogView).apply {
                        systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                        hide(WindowInsetsCompat.Type.systemBars())
                    }
                }
                onDispose { }
            }
            Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
                Column(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing)) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                        TextButton(onClick = { fullscreen = false }) { Text("Salir de pantalla completa") }
                    }
                    errorMessage?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                    BracketWebViewHost(webView, html, viewportController, Modifier.fillMaxWidth().weight(1f))
                }
            }
        }
    }
}

@Composable
private fun BracketWebViewHost(webView: WebView, html: String, controller: ExperimentalBracketViewportController, modifier: Modifier) {
    AndroidView(
        modifier = modifier,
        factory = { context -> FrameLayout(context).apply {
            (webView.parent as? ViewGroup)?.removeView(webView)
            addView(webView, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        } },
        onRelease = { host -> if (webView.parent === host) host.removeView(webView) },
        update = { controller.loadHtmlPreservingViewport(webView, html) },
    )
}

private class ExperimentalBracketViewportController {
    private var currentHtml: String? = null
    private var pendingRestoreState: String? = null

    fun loadInitial(webView: WebView, html: String) {
        if (currentHtml == html) {
            return
        }
        currentHtml = html
        webView.loadExperimentalBracketHtml(html)
    }

    fun loadHtmlPreservingViewport(webView: WebView, html: String) {
        if (currentHtml == html) {
            return
        }
        val hadPreviousHtml = currentHtml != null
        currentHtml = html
        if (!hadPreviousHtml) {
            webView.loadExperimentalBracketHtml(html)
            return
        }

        webView.evaluateJavascript(
            "window.__gttExperimentalBracketCaptureState ? window.__gttExperimentalBracketCaptureState() : null",
        ) { result ->
            pendingRestoreState = result
                ?.takeIf { it != "null" && it != "\"null\"" && it != "undefined" }
            webView.loadExperimentalBracketHtml(html)
        }
    }

    fun restoreAfterLoad(webView: WebView) {
        val restoreState = pendingRestoreState ?: return
        pendingRestoreState = null
        val restoreScript = "window.__gttExperimentalBracketRestoreState && window.__gttExperimentalBracketRestoreState(JSON.parse($restoreState))"
        webView.postDelayed({ webView.evaluateJavascript(restoreScript, null) }, 40L)
        webView.postDelayed({ webView.evaluateJavascript(restoreScript, null) }, 180L)
    }

    private fun WebView.loadExperimentalBracketHtml(html: String) {
        loadDataWithBaseURL(
            "file:///android_asset/",
            html,
            "text/html",
            "utf-8",
            null,
        )
    }
}

@SuppressLint("SetJavaScriptEnabled")
private fun createExperimentalBracketWebView(
    context: android.content.Context,
    hasMatchSelection: ((String) -> Unit)?,
    onPageFinished: (WebView) -> Unit,
    onMatchSelected: (String) -> Unit,
): WebView {
    return WebView(context).apply {
        setBackgroundColor(AndroidColor.TRANSPARENT)
        overScrollMode = WebView.OVER_SCROLL_NEVER
        isVerticalScrollBarEnabled = true
        isHorizontalScrollBarEnabled = true
        settings.javaScriptEnabled = true
        settings.setSupportZoom(false)
        settings.builtInZoomControls = false
        settings.useWideViewPort = true
        settings.loadWithOverviewMode = false
        settings.domStorageEnabled = false
        settings.allowFileAccess = true
        settings.allowContentAccess = false
        settings.displayZoomControls = false
        settings.loadsImagesAutomatically = true
        webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                val url = request?.url?.toString().orEmpty()
                return handleMatchSelectionUrl(url, hasMatchSelection, onMatchSelected)
            }

            override fun shouldOverrideUrlLoading(view: WebView?, url: String?): Boolean {
                return handleMatchSelectionUrl(url.orEmpty(), hasMatchSelection, onMatchSelected)
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                view?.let(onPageFinished)
            }
        }
        webChromeClient = WebChromeClient()
        setOnTouchListener { view, event ->
            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN,
                MotionEvent.ACTION_MOVE -> {
                    view.parent?.requestDisallowInterceptTouchEvent(true)
                }

                MotionEvent.ACTION_UP,
                MotionEvent.ACTION_CANCEL -> {
                    view.parent?.requestDisallowInterceptTouchEvent(false)
                }
            }
            false
        }
    }
}

private fun handleMatchSelectionUrl(
    url: String,
    hasMatchSelection: ((String) -> Unit)?,
    onMatchSelected: (String) -> Unit,
): Boolean {
    if (hasMatchSelection == null || !url.startsWith("gtt-match://select/")) {
        return false
    }
    val matchId = android.net.Uri.parse(url).lastPathSegment?.trim().orEmpty()
    if (matchId.isNotEmpty()) {
        onMatchSelected(matchId)
    }
    return true
}

private data class ExperimentalBracketSection(
    val id: String,
    val label: String,
    val clusters: List<ExperimentalBracketCluster>,
)

private data class ExperimentalBracketCluster(
    val id: String,
    val label: String,
    val rounds: List<ExperimentalBracketRound>,
)

private data class ExperimentalBracketRound(
    val title: String,
    val matches: List<MatchSummary>,
)

private fun buildExperimentalBracketHtml(
    matches: List<MatchSummary>,
    selectableMatchIds: Set<String>,
    callTimeoutMinutes: Int,
    darkTheme: Boolean,
    readingScale: Float,
    characterAssetUrl: (String) -> String?,
): String {
    val appearanceClass = if (darkTheme) "theme-dark" else "theme-light"
    val sections = buildExperimentalSections(matches)
    val sectionButtons = sections.joinToString("") { section ->
        """<button class="section-tab" data-target="${section.id}">${escapeHtml(section.label)}</button>"""
    }
    val sectionHtml = sections.joinToString("") { section ->
        """
        <section class="bracket-section" id="${section.id}">
          ${section.clusters.joinToString("") { cluster ->
              """
              <div class="bracket-cluster">
                ${if (section.clusters.size > 1) """<div class="cluster-title">${escapeHtml(cluster.label)}</div>""" else ""}
                <div class="bracket-scroll">
                  <div class="bracket-scale-wrap">
                    <div class="bracket-canvas" data-section-id="${cluster.id}" data-round-count="${cluster.rounds.size}">
                      <svg class="connector-layer"></svg>
                      ${run {
                          val clusterMatches = cluster.rounds.flatMap { it.matches }
                          cluster.rounds.mapIndexed { roundIndex, round ->
                          """
                          <div class="round-column" data-round-index="$roundIndex">
                            <div class="round-title">${escapeHtml(round.title)}</div>
                            ${round.matches.mapIndexed { matchIndex, match ->
                                buildExperimentalMatchCardHtml(
                                    match = match,
                                    roundIndex = roundIndex,
                                    matchIndex = matchIndex,
                                    clusterMatches = clusterMatches,
                                    connectionGroup = cluster.id,
                                    isSelectable = selectableMatchIds.contains(match.id),
                                    characterAssetUrl = characterAssetUrl,
                                    callTimeoutMinutes = callTimeoutMinutes,
                                )
                            }.joinToString("")}
                          </div>
                          """.trimIndent()
                          }.joinToString("")
                      }}
                    </div>
                  </div>
                </div>
              </div>
              """.trimIndent()
          }}
        </section>
        """.trimIndent()
    }

    val emptyState = if (sections.isEmpty()) {
        """<div class="empty-state">No hay suficiente estructura para renderizar la bracket experimental.</div>"""
    } else {
        ""
    }

    return """
        <!DOCTYPE html>
        <html lang="es">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no" />
          <style>
            :root {
              color-scheme: dark;
              --bg: #0f1724;
              --panel: #182235;
              --panel-2: #1f2940;
              --text: #edf2ff;
              --muted: #9fb1d1;
              --line: rgba(180, 197, 232, 0.18);
              --accent: #6ea8ff;
              --winner-bg: rgba(52, 211, 153, 0.14);
              --winner-line: rgba(52, 211, 153, 0.5);
              --loser-bg: rgba(248, 113, 113, 0.14);
              --loser-line: rgba(248, 113, 113, 0.45);
              --dq-pill: #f8fafc;
              --dq-text: #111827;
            }
            * { box-sizing: border-box; }
            html, body {
              margin: 0;
              padding: 0;
              background: transparent;
              color: var(--text);
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            }
            body {
              min-height: 100%;
              padding: 14px;
            }
            .root {
              background: linear-gradient(180deg, rgba(15, 23, 36, 0.96), rgba(17, 26, 43, 0.98));
              border: 1px solid var(--line);
              border-radius: 22px;
              padding: 14px;
              box-shadow: 0 16px 42px rgba(8, 13, 24, 0.34);
            }
            .tabs {
              display: flex;
              gap: 10px;
              overflow-x: auto;
              padding-bottom: 8px;
              margin-bottom: 14px;
            }
            .tabs::-webkit-scrollbar,
            .bracket-scroll::-webkit-scrollbar { display: none; }
            .section-tab {
              border: 1px solid rgba(110, 168, 255, 0.26);
              background: rgba(35, 50, 77, 0.96);
              color: var(--text);
              border-radius: 999px;
              padding: 8px 14px;
              font-size: 13px;
              font-weight: 700;
              white-space: nowrap;
            }
            .section-tab.active {
              background: linear-gradient(180deg, #7fb1ff, #5e87ff);
              color: #071223;
              border-color: transparent;
            }
            .bracket-section { display: none; }
            .bracket-section.active { display: block; }
            .bracket-cluster + .bracket-cluster {
              margin-top: 18px;
              padding-top: 18px;
              border-top: 1px solid rgba(180, 197, 232, 0.14);
            }
            .cluster-title {
              color: #d9e6ff;
              font-size: 14px;
              font-weight: 800;
              letter-spacing: 0.03em;
              margin-bottom: 10px;
            }
            .bracket-scroll {
              overflow-x: auto;
              overflow-y: auto;
              min-height: 520px;
              max-height: 560px;
              padding-bottom: 8px;
              touch-action: pan-x pan-y;
            }
            .bracket-scale-wrap {
              position: relative;
              min-width: 100%;
              min-height: 520px;
            }
            .bracket-canvas {
              position: relative;
              min-height: 520px;
              transform-origin: top left;
            }
            .connector-layer {
              position: absolute;
              inset: 0;
              width: 100%;
              height: 100%;
              pointer-events: none;
              overflow: visible;
            }
            .round-column {
              position: absolute;
              width: 248px;
            }
            .round-title {
              color: #cfe0ff;
              font-size: 15px;
              font-weight: 800;
              letter-spacing: 0.01em;
              margin-bottom: 8px;
            }
            .match-card {
              position: absolute;
              width: 248px;
              background: linear-gradient(180deg, rgba(31, 41, 64, 0.98), rgba(24, 34, 53, 0.98));
              border: 1px solid var(--line);
              border-radius: 18px;
              overflow: hidden;
              box-shadow: 0 10px 22px rgba(7, 12, 22, 0.26);
            }
            .match-card.actionable {
              cursor: pointer;
            }
            .match-card.called {
              border-color: rgba(250, 204, 21, 0.55);
              box-shadow: 0 12px 26px rgba(250, 204, 21, 0.14);
            }
            .match-card.playing {
              border-color: rgba(34, 197, 94, 0.55);
              box-shadow: 0 12px 26px rgba(34, 197, 94, 0.16);
            }
            .match-card.actionable .match-header {
              background: rgba(92, 126, 189, 0.08);
            }
            .match-header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              gap: 12px;
              padding: 10px 12px 8px;
              font-size: 11px;
              text-transform: uppercase;
              color: var(--muted);
              letter-spacing: 0.06em;
            }
            .status-pill {
              padding: 4px 8px;
              border-radius: 999px;
              font-weight: 800;
              color: #d9e5ff;
              background: rgba(75, 108, 171, 0.18);
              border: 1px solid rgba(120, 154, 216, 0.16);
            }
            .match-card.called .status-pill {
              color: #fff7d6;
              background: rgba(250, 204, 21, 0.18);
              border-color: rgba(250, 204, 21, 0.34);
            }
            .match-card.playing .status-pill {
              color: #dcfce7;
              background: rgba(34, 197, 94, 0.18);
              border-color: rgba(34, 197, 94, 0.34);
            }
            .match-timer {
              padding: 0 12px 10px;
              font-size: 12px;
              font-weight: 800;
              letter-spacing: 0.03em;
            }
            .match-timer.called {
              color: #fde68a;
            }
            .match-timer.playing {
              color: #86efac;
            }
            .entrant-row {
              display: flex;
              align-items: center;
              gap: 12px;
              padding: 10px 12px;
              border-top: 1px solid rgba(255,255,255,0.03);
            }
            .entrant-main {
              flex: 1;
              display: flex;
              align-items: center;
              gap: 10px;
              min-width: 0;
            }
            .entrant-icon {
              width: 22px;
              height: 22px;
              border-radius: 7px;
              object-fit: contain;
              background: rgba(255,255,255,0.08);
              flex: 0 0 22px;
            }
            .entrant-row.winner {
              background: var(--winner-bg);
              box-shadow: inset 3px 0 0 var(--winner-line);
            }
            .entrant-row.loser {
              background: var(--loser-bg);
              box-shadow: inset 3px 0 0 var(--loser-line);
            }
            .entrant-name {
              flex: 1;
              font-size: 16px;
              font-weight: 700;
              color: var(--text);
              line-height: 1.2;
              word-break: break-word;
            }
            .entrant-score {
              min-width: 48px;
              text-align: right;
              font-size: 20px;
              font-weight: 900;
              color: #f8fbff;
            }
            .entrant-score.dq {
              min-width: 56px;
              font-size: 13px;
              text-align: center;
              color: var(--dq-text);
              background: var(--dq-pill);
              border-radius: 999px;
              padding: 6px 10px;
            }
            .match-footer {
              padding: 8px 12px 12px;
              font-size: 12px;
              color: var(--muted);
            }
            .empty-state {
              padding: 16px;
              border-radius: 16px;
              border: 1px dashed rgba(173, 190, 223, 0.28);
              color: var(--muted);
              font-size: 14px;
            }
            .connector-path {
              fill: none;
              stroke: rgba(184, 199, 228, 0.58);
              stroke-width: 2;
              stroke-linecap: round;
              stroke-linejoin: round;
            }
            html, body { height: 100%; overflow: hidden; }
            .root { height: 100%; display: flex; flex-direction: column; }
            .tabs { flex-shrink: 0; }
            .bracket-section.active { display: flex; flex: 1; min-height: 0; }
            .unified-viewport { width: 100%; overflow: auto; max-height: none; min-height: 0; flex: 1; overscroll-behavior: contain; }
            .match-card { border-radius: 4px; box-shadow: none; }
            .entrant-row { border-radius: 0; min-height: 32px; }
            .entrant-name { font-size: 14px; font-weight: 500; }
            .entrant-score { font-size: 16px; border-left: 1px solid var(--line); padding-left: 8px; }
            .round-title { font-size: 13px; }

            /* MAIN readable bracket */
            body { --reading-scale: 1; }
            body.theme-light {
              color-scheme: light; --bg:#f3f5fa; --panel:#ffffff; --panel-2:#e8ecf4;
              --text:#172033; --muted:#475569; --line:#cbd5e1; --accent:#3345a4;
              --winner-bg:#dcf5e5; --winner-line:#17643b; --loser-bg:#ffe4e8; --loser-line:#b42335;
              --neutral-bg:#e8ecf4; --neutral-line:#64748b; --dq-pill:#b42335; --dq-text:#ffffff;
            }
            .root { background:var(--bg); }
            .cluster-card, .match-card { background:var(--panel); border-color:var(--line); }
            .round-title, .cluster-title, .section-title, .entrant-score { color:var(--text); }
            .round-column, .match-card { width:calc(280px * var(--reading-scale)); }
            .round-title { font-size:calc(14px * var(--reading-scale)); }
            .match-header { font-size:calc(12px * var(--reading-scale)); }
            .match-header, .entrant-main { min-width:0; }
            .entrant-name { font-size:calc(15px * var(--reading-scale)); line-height:1.3; white-space:normal; overflow:visible; text-overflow:clip; overflow-wrap:anywhere; }
            .entrant-score { font-size:calc(17px * var(--reading-scale)); flex-shrink:0; min-width:28px; }
            .match-footer, .match-meta, .match-timer { font-size:calc(13px * var(--reading-scale)); }
            .section-tab { min-height:44px; font-size:calc(14px * var(--reading-scale)); }
            .theme-light .section-tab { color:var(--text); background:var(--panel); border-color:#64748b; }
            .theme-light .section-tab.active { color:#ffffff; background:#3345a4; }
            .theme-light .status-pill { color:#3345a4; background:#e2e7ff; }
            .theme-light .match-card.called .status-pill, .theme-light .match-timer.called { color:#805400; background:#fff0cc; }
            .theme-light .match-card.playing .status-pill, .theme-light .match-timer.playing { color:#17643b; background:#dcf5e5; }
            .theme-light .connector-path { stroke:#64748b; }
            @media (prefers-reduced-motion: reduce) { * { animation:none !important; transition:none !important; } }
          </style>
        </head>
        <body class="$appearanceClass" style="--reading-scale:$readingScale">
          <div class="root">
            <div class="tabs">$sectionButtons</div>
            $emptyState
            $sectionHtml
          </div>
          <script>
            (function() {
$modernBracketSearchScript

          // One scrolling surface for the whole phase: winners above losers.
          document.querySelectorAll('.bracket-section').forEach(section => {
            section.querySelectorAll('.bracket-scroll').forEach(inner => {
              inner.classList.remove('bracket-scroll');
            });
            const viewport = document.createElement('div');
            viewport.className = 'bracket-scroll unified-viewport';
            while (section.firstChild) viewport.appendChild(section.firstChild);
            section.appendChild(viewport);
          });
const tabs = Array.from(document.querySelectorAll('.section-tab'));
              const sections = Array.from(document.querySelectorAll('.bracket-section'));
              const defaultZoom = 0.72;
              const minZoom = 0.38;
              const maxZoom = 1.9;
              const zoomState = new Map();
              function activate(id) {
                tabs.forEach(tab => tab.classList.toggle('active', tab.dataset.target === id));
                sections.forEach(section => section.classList.toggle('active', section.id === id));
                requestAnimationFrame(layoutAllSections);
                updateTimingDisplays();
              }
              function layoutAllSections() {
                document.querySelectorAll('.bracket-section.active .bracket-canvas').forEach(layoutSection);
              }
              function layoutSection(canvas) {
                const columns = Array.from(canvas.querySelectorAll('.round-column'));
                if (columns.length === 0) return;
                const cardWidth = parseFloat(getComputedStyle(columns[0]).width);
                const columnGap = 98;
                const topPadding = 36;
                const titleHeight = Math.max(28, ...columns.map(column => column.querySelector('.round-title').offsetHeight + 8));
                const verticalGap = 24;
                const connectorSvg = canvas.querySelector('.connector-layer');
                const scaleWrap = canvas.parentElement;
                const sectionId = canvas.closest('.bracket-scroll').querySelector('.bracket-canvas').dataset.sectionId;
                const zoom = zoomState.get(sectionId) ?? defaultZoom;
                connectorSvg.innerHTML = '';
                let maxHeight = 520;
                const globalCardHeight = columns.reduce((max, column) => {
                  const cards = Array.from(column.querySelectorAll('.match-card'));
                  const columnMax = cards.reduce((cardMax, card) => Math.max(cardMax, card.offsetHeight || 0), 0);
                  return Math.max(max, columnMax);
                }, 116);
                const rowUnit = globalCardHeight + verticalGap;
                const positionedCardByMatchId = new Map();
                columns.forEach((column, columnIndex) => {
                  column.style.left = `${'$'}{columnIndex * (cardWidth + columnGap)}px`;
                  column.style.top = '0px';
                  const cards = Array.from(column.querySelectorAll('.match-card'));
                  const cardPositions = [];
                  cards.forEach((card, cardIndex) => {
                    const cardHeight = card.offsetHeight || globalCardHeight;
                    let top;
                    if (columnIndex === 0) {
                      top = topPadding + titleHeight + (cardIndex * rowUnit);
                    } else {
                      const sourceIds = String(card.dataset.sourceMatchIds || '')
                        .split(',')
                        .map(value => value.trim())
                        .filter(Boolean);
                      const sources = sourceIds
                        .map(sourceId => positionedCardByMatchId.get(sourceId))
                        .filter(source => source && source.card?.dataset?.connectionGroup === card.dataset.connectionGroup);
                      if (sources.length >= 2) {
                        const sourceCenter = sources.reduce((sum, source) => sum + source.top + (source.height / 2), 0) / sources.length;
                        top = sourceCenter - (cardHeight / 2);
                      } else if (sources.length === 1) {
                        top = (sources[0].top + (sources[0].height / 2)) - (cardHeight / 2);
                      } else {
                        top = topPadding + titleHeight + (cardIndex * rowUnit);
                      }
                      const previousCard = cardPositions[cardPositions.length - 1];
                      if (previousCard) {
                        top = Math.max(top, previousCard.top + previousCard.height + verticalGap);
                      }
                    }
                    card.style.left = '0px';
                    card.style.top = `${'$'}{top}px`;
                    const positionedCard = { card, top, height: cardHeight };
                    cardPositions.push(positionedCard);
                    if (card.dataset.matchId) {
                      positionedCardByMatchId.set(card.dataset.matchId, positionedCard);
                    }
                    maxHeight = Math.max(maxHeight, top + cardHeight + 30);
                  });
                });
                const width = columns.length * cardWidth + Math.max(0, columns.length - 1) * columnGap + 32;
                canvas.style.width = `${'$'}{width}px`;
                canvas.style.height = `${'$'}{maxHeight}px`;
                connectorSvg.setAttribute('viewBox', `0 0 ${'$'}{width} ${'$'}{maxHeight}`);
                connectorSvg.setAttribute('width', `${'$'}{width}`);
                connectorSvg.setAttribute('height', `${'$'}{maxHeight}`);
                canvas.style.transform = `scale(${ '$' }{zoom})`;
                scaleWrap.style.width = `${'$'}{Math.max(width * zoom, 320)}px`;
                scaleWrap.style.height = `${'$'}{Math.max(520, maxHeight * zoom)}px`;

                const allCards = Array.from(canvas.querySelectorAll('.match-card'));
                const cardByMatchId = new Map(
                  allCards
                    .filter(card => card.dataset.matchId)
                    .map(card => [card.dataset.matchId, card])
                );
                const drawnConnectors = new Set();
                allCards.forEach((targetCard) => {
                  const sourceIds = String(targetCard.dataset.sourceMatchIds || '')
                    .split(',')
                    .map(value => value.trim())
                    .filter(Boolean);
                  sourceIds.forEach((sourceId) => {
                    const sourceCard = cardByMatchId.get(sourceId);
                    const connectorKey = `${'$'}{sourceId}->${'$'}{targetCard.dataset.matchId}`;
                    if (!sourceCard || sourceCard.dataset.connectionGroup !== targetCard.dataset.connectionGroup || drawnConnectors.has(connectorKey)) return;
                    drawConnector(canvas, connectorSvg, sourceCard, targetCard);
                    drawnConnectors.add(connectorKey);
                  });
                });
              }

              function drawConnector(canvas, svg, sourceCard, targetCard) {
                const sourceBox = getBoxRelativeToCanvas(sourceCard, canvas);
                const targetBox = getBoxRelativeToCanvas(targetCard, canvas);
                const x1 = sourceBox.x + sourceBox.width;
                const y1 = sourceBox.y + sourceBox.height / 2;
                const x2 = targetBox.x;
                const y2 = targetBox.y + targetBox.height / 2;
                const midX = x1 + (x2 - x1) * 0.5;
                const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                path.setAttribute('class', 'connector-path');
                path.setAttribute('d', `M ${'$'}{x1} ${'$'}{y1} H ${'$'}{midX} V ${'$'}{y2} H ${'$'}{x2}`);
                svg.appendChild(path);
              }

              function getBoxRelativeToCanvas(element, canvas) {
                let x = 0;
                let y = 0;
                let node = element;
                while (node && node !== canvas) {
                  x += node.offsetLeft || 0;
                  y += node.offsetTop || 0;
                  node = node.offsetParent;
                }
                return {
                  x,
                  y,
                  width: element.offsetWidth || 0,
                  height: element.offsetHeight || 0,
                };
              }

              function captureViewportState() {
                const activeSection = document.querySelector('.bracket-section.active');
                const tabsEl = document.querySelector('.tabs');
                return JSON.stringify({
                  search: window.__gttBracketSearch?.capture(),
                  activeSectionId: activeSection ? activeSection.id : null,
                  tabsScrollLeft: tabsEl ? tabsEl.scrollLeft : 0,
                  sections: Array.from(document.querySelectorAll('.bracket-section')).map(section => {
                    const scrollEl = section.querySelector('.bracket-scroll');
                    const canvas = section.querySelector('.bracket-canvas');
                    const sectionId = section.id || (canvas ? canvas.dataset.sectionId : '');
                    return {
                      id: sectionId,
                      scrollLeft: scrollEl ? scrollEl.scrollLeft : 0,
                      scrollTop: scrollEl ? scrollEl.scrollTop : 0,
                      zoom: canvas ? (zoomState.get(canvas.dataset.sectionId) ?? defaultZoom) : defaultZoom,
                    };
                  }),
                });
              }

              function restoreViewportState(state) {
                if (!state) return;
                window.__gttBracketSearch?.restore(state.search);
                const sectionStates = Array.isArray(state.sections) ? state.sections : [];
                sectionStates.forEach(sectionState => {
                  if (!sectionState || !sectionState.id) return;
                  const zoom = Number(sectionState.zoom);
                  if (Number.isFinite(zoom)) {
                    const canvas = document.getElementById(sectionState.id)?.querySelector('.bracket-canvas');
                    if (canvas) zoomState.set(canvas.dataset.sectionId, Math.min(maxZoom, Math.max(minZoom, zoom)));
                  }
                });
                if (state.activeSectionId && document.getElementById(state.activeSectionId)) {
                  activate(state.activeSectionId);
                } else {
                  layoutAllSections();
                }
                const applyScroll = () => {
                  const tabsEl = document.querySelector('.tabs');
                  if (tabsEl && Number.isFinite(Number(state.tabsScrollLeft))) {
                    tabsEl.scrollLeft = Number(state.tabsScrollLeft);
                  }
                  sectionStates.forEach(sectionState => {
                    if (!sectionState || !sectionState.id) return;
                    const section = document.getElementById(sectionState.id);
                    const scrollEl = section ? section.querySelector('.bracket-scroll') : null;
                    if (!scrollEl) return;
                    const left = Number(sectionState.scrollLeft);
                    const top = Number(sectionState.scrollTop);
                    if (Number.isFinite(left)) scrollEl.scrollLeft = left;
                    if (Number.isFinite(top)) scrollEl.scrollTop = top;
                  });
                };
                requestAnimationFrame(() => {
                  layoutAllSections();
                  requestAnimationFrame(applyScroll);
                });
              }

              window.__gttExperimentalBracketCaptureState = captureViewportState;
              window.__gttExperimentalBracketRestoreState = restoreViewportState;

              tabs.forEach(tab => tab.addEventListener('click', () => activate(tab.dataset.target)));
              document.querySelectorAll('.match-card[data-actionable="true"]').forEach(card => {
                card.addEventListener('click', () => {
                  const matchId = card.dataset.matchId;
                  if (matchId) {
                    window.location.href = `gtt-match://select/${'$'}{encodeURIComponent(matchId)}`;
                  }
                });
              });
              document.querySelectorAll('.bracket-scroll').forEach(scrollEl => {
                let pinchStartDistance = null;
                let pinchStartZoom = defaultZoom;
                let pinchCanvas = null;
                scrollEl.addEventListener('touchstart', event => {
                  if (event.touches.length === 2) {
                    pinchCanvas = scrollEl.querySelector('.bracket-canvas');
                    if (!pinchCanvas) return;
                    pinchStartDistance = touchDistance(event.touches[0], event.touches[1]);
                    pinchStartZoom = zoomState.get(pinchCanvas.dataset.sectionId) ?? defaultZoom;
                    event.preventDefault();
                  }
                }, { passive: false });
                scrollEl.addEventListener('touchmove', event => {
                  if (event.touches.length === 2 && pinchStartDistance && pinchCanvas) {
                    const currentDistance = touchDistance(event.touches[0], event.touches[1]);
                    const rawZoom = pinchStartZoom * (currentDistance / pinchStartDistance);
                    const nextZoom = Math.min(maxZoom, Math.max(minZoom, rawZoom));
                    zoomState.set(pinchCanvas.dataset.sectionId, nextZoom);
                    scrollEl.querySelectorAll('.bracket-canvas').forEach(layoutSection);
                    event.preventDefault();
                  }
                }, { passive: false });
                scrollEl.addEventListener('touchend', event => {
                  if (event.touches.length < 2) {
                    pinchStartDistance = null;
                    pinchCanvas = null;
                  }
                });
                scrollEl.addEventListener('touchcancel', () => {
                  pinchStartDistance = null;
                  pinchCanvas = null;
                });
              });
              if (tabs.length > 0) {
                activate(tabs[0].dataset.target);
              }
              updateTimingDisplays();
              installModernBracketSearch(activate, layoutAllSections);
              setInterval(updateTimingDisplays, 1000);
              window.addEventListener('resize', () => requestAnimationFrame(layoutAllSections));
              if (window.visualViewport) {
                window.visualViewport.addEventListener('resize', () => requestAnimationFrame(layoutAllSections));
                window.visualViewport.addEventListener('scroll', () => requestAnimationFrame(layoutAllSections));
              }

              function touchDistance(a, b) {
                const dx = a.clientX - b.clientX;
                const dy = a.clientY - b.clientY;
                return Math.sqrt(dx * dx + dy * dy);
              }

              function updateTimingDisplays() {
                document.querySelectorAll('.match-timer[data-timing-role]').forEach(node => {
                  const card = node.closest('.match-card');
                  if (!card) return;
                  const role = node.dataset.timingRole;
                  const calledAt = card.dataset.calledAt;
                  const startedAt = card.dataset.startedAt;
                  const timeoutSeconds = Number(card.dataset.callTimeoutSeconds || '0');
                  if (role === 'called') {
                    const calledMs = Date.parse(calledAt || '');
                    if (!Number.isFinite(calledMs) || timeoutSeconds <= 0) {
                      node.textContent = 'Llamado';
                      return;
                    }
                    const remainingSeconds = Math.max(0, Math.floor((calledMs + timeoutSeconds * 1000 - Date.now()) / 1000));
                    node.textContent = remainingSeconds > 0
                      ? `Tiempo restante: ${'$'}{formatDuration(remainingSeconds)}`
                      : 'Tiempo agotado';
                  } else if (role === 'playing') {
                    const startedMs = Date.parse(startedAt || '');
                    if (!Number.isFinite(startedMs)) {
                      node.textContent = 'En juego';
                      return;
                    }
                    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedMs) / 1000));
                    node.textContent = `Jugando: ${'$'}{formatDuration(elapsedSeconds)}`;
                  } else {
                    node.textContent = '';
                  }
                });
              }

              function formatDuration(totalSeconds) {
                const minutes = Math.floor(totalSeconds / 60);
                const seconds = totalSeconds % 60;
                return `${'$'}{String(minutes).padStart(2, '0')}:${'$'}{String(seconds).padStart(2, '0')}`;
              }
            })();
          </script>
        </body>
        </html>
    """.trimIndent()
}

private fun buildExperimentalSections(matches: List<MatchSummary>): List<ExperimentalBracketSection> {
    val stageOrder = mapOf(
        "POOLS" to 0,
        "WINNERS" to 1,
        "LOSERS" to 2,
        "FINALS" to 3,
    )

    val sortedMatches = matches.sortedWith(
        compareBy<MatchSummary>(
            { stageOrder[it.bracketStage] ?: 99 },
            { it.phaseOrder ?: Int.MAX_VALUE },
            { it.phaseDisplayLabel },
            { it.poolLabel ?: "" },
            { it.roundNumber },
            { it.matchNumber },
        )
    )

    val sections = buildList {
        addAll(buildExperimentalPoolSections(sortedMatches.filter { it.isPoolMatch }))
        val bracketGrouped = sortedMatches
            .filterNot { it.isPoolMatch }
            .groupBy { match ->
                if (experimentalHasExplicitPhaseStructure(match)) {
                    match.phaseKey
                } else {
                    "__main_bracket__"
                }
            }
        bracketGrouped.entries.forEach { (key, sectionMatches) ->
            val first = sectionMatches.firstOrNull() ?: return@forEach
            add(
                experimentalTournamentBracketSectionFromMatches(
                    id = "bracket:$key",
                    label = experimentalTournamentBracketLabel(first),
                    matches = sectionMatches
                )
            )
        }
    }

    return sections.sortedBy { section ->
        when {
            section.label.startsWith("Pool ", ignoreCase = true) -> 0
            section.label.equals("Pools", ignoreCase = true) -> 1
            section.label.equals("Winners bracket", ignoreCase = true) -> 2
            section.label.equals("Losers bracket", ignoreCase = true) -> 3
            section.label.equals("Bracket final", ignoreCase = true) -> 4
            else -> 5
        }.toString() + ":" + section.label
    }
}

private fun experimentalHasExplicitPhaseStructure(match: MatchSummary): Boolean {
    if (!match.phaseId.isNullOrBlank()) {
        return true
    }
    val phaseName = match.phaseName?.trim().orEmpty()
    if (phaseName.isBlank()) {
        return false
    }
    if (phaseName.equals(match.bracketStage, ignoreCase = true)) {
        return false
    }
    if (phaseName.equals("bracket", ignoreCase = true)) {
        return false
    }
    return true
}

private fun buildExperimentalPoolSections(poolMatches: List<MatchSummary>): List<ExperimentalBracketSection> {
    if (poolMatches.isEmpty()) {
        return emptyList()
    }

    val explicitGroups = poolMatches
        .filter { !it.phaseScopedPoolKey.isNullOrBlank() && !it.poolLabel.isNullOrBlank() && !it.poolLabel.equals("POOLS", ignoreCase = true) }
        .groupBy { it.phaseScopedPoolKey!! }
        .map { (key, matches) ->
            key to experimentalPoolSectionFromMatches(
                id = "pool:$key",
                label = matches.first().poolLabel ?: "Pool",
                matches = matches
            )
        }

    val fallbackMatches = poolMatches.filter { it.phaseScopedPoolKey.isNullOrBlank() || it.poolLabel.isNullOrBlank() || it.poolLabel.equals("POOLS", ignoreCase = true) }
    val fallbackGroups = experimentalConnectedPoolGroups(fallbackMatches)
        .sortedWith(compareBy<List<MatchSummary>>(
            { it.minOfOrNull(MatchSummary::roundNumber) ?: Int.MAX_VALUE },
            { it.minOfOrNull(MatchSummary::matchNumber) ?: Int.MAX_VALUE }
        ))
        .mapIndexed { index, matches ->
            "pool:local:$index" to experimentalPoolSectionFromMatches(
                id = "pool:local:$index",
                label = "Pool ${index + 1}",
                matches = matches
            )
        }

    return (explicitGroups + fallbackGroups)
        .sortedWith(compareBy<Pair<String, ExperimentalBracketSection>> { it.second.label })
        .map { it.second }
}

private fun experimentalConnectedPoolGroups(matches: List<MatchSummary>): List<List<MatchSummary>> {
    if (matches.isEmpty()) {
        return emptyList()
    }

    val byId = matches.associateBy { it.id }
    val adjacency = matches.associate { it.id to linkedSetOf<String>() }.toMutableMap()
    matches.forEach { match ->
        experimentalSourceMatchIds(match).forEach { sourceId ->
            if (sourceId in byId) {
                adjacency.getValue(match.id).add(sourceId)
                adjacency.getValue(sourceId).add(match.id)
            }
        }
    }

    val visited = linkedSetOf<String>()
    val groups = mutableListOf<List<MatchSummary>>()
    matches.forEach { start ->
        if (!visited.add(start.id)) return@forEach
        val stack = ArrayDeque<String>()
        val groupIds = mutableListOf<String>()
        stack.add(start.id)
        while (stack.isNotEmpty()) {
            val current = stack.removeLast()
            groupIds.add(current)
            adjacency[current].orEmpty().forEach { neighbor ->
                if (visited.add(neighbor)) {
                    stack.add(neighbor)
                }
            }
        }
        groups += groupIds.mapNotNull(byId::get)
    }
    return groups
}

private fun experimentalSectionFromMatches(
    id: String,
    label: String,
    matches: List<MatchSummary>,
): ExperimentalBracketSection {
    return ExperimentalBracketSection(
        id = sanitizeHtmlId(id),
        label = label,
        clusters = listOf(
            experimentalClusterFromMatches(
                id = id,
                label = label,
                matches = matches
            )
        )
    )
}

private fun experimentalPoolSectionFromMatches(
    id: String,
    label: String,
    matches: List<MatchSummary>,
): ExperimentalBracketSection {
    val winnersLike = matches.filter { it.bracketStage == "POOLS" || it.bracketStage == "WINNERS" || it.bracketStage == "FINALS" }
    val losers = matches.filter { it.bracketStage == "LOSERS" }
    val clusters = buildList {
        if (winnersLike.isNotEmpty()) {
            add(
                experimentalClusterFromStageGroups(
                    id = "$id:winners",
                    label = "Winners bracket",
                    stageGroups = listOf(
                        "WINNERS" to winnersLike.filter { it.bracketStage == "POOLS" || it.bracketStage == "WINNERS" },
                        "FINALS" to winnersLike.filter { it.bracketStage == "FINALS" }
                    )
                )
            )
        }
        if (losers.isNotEmpty()) {
            add(
                experimentalClusterFromMatches(
                    id = "$id:losers",
                    label = "Losers bracket",
                    matches = losers
                )
            )
        }
    }
    return ExperimentalBracketSection(
        id = sanitizeHtmlId(id),
        label = label,
        clusters = clusters
    )
}

private fun experimentalTournamentBracketSectionFromMatches(
    id: String,
    label: String,
    matches: List<MatchSummary>,
): ExperimentalBracketSection {
    val winners = matches.filter { it.bracketStage == "POOLS" || it.bracketStage == "WINNERS" }
    val losers = matches.filter { it.bracketStage == "LOSERS" }
    val finals = matches.filter { it.bracketStage == "FINALS" }
    val clusters = buildList {
        if (winners.isNotEmpty() || finals.isNotEmpty()) {
            add(
                experimentalClusterFromStageGroups(
                    id = "$id:winners",
                    label = "Winners bracket",
                    stageGroups = listOf(
                        "WINNERS" to winners,
                        "FINALS" to finals
                    )
                )
            )
        }
        if (losers.isNotEmpty()) {
            add(
                experimentalClusterFromMatches(
                    id = "$id:losers",
                    label = "Losers bracket",
                    matches = losers
                )
            )
        }
    }
    return ExperimentalBracketSection(
        id = sanitizeHtmlId(id),
        label = label,
        clusters = clusters
    )
}

private fun experimentalClusterFromStageGroups(
    id: String,
    label: String,
    stageGroups: List<Pair<String, List<MatchSummary>>>,
): ExperimentalBracketCluster {
    val rounds = stageGroups.flatMap { (_stage, stageMatches) ->
        stageMatches
            .groupBy { it.roundNumber }
            .toSortedMap()
            .map { (_, roundMatches) ->
                ExperimentalBracketRound(
                    title = roundMatches.firstOrNull()?.roundDisplayTitle ?: "Ronda",
                    matches = roundMatches.sortedBy { it.matchNumber }
                )
            }
    }
    return ExperimentalBracketCluster(
        id = sanitizeHtmlId(id),
        label = label,
        rounds = rounds
    )
}

private fun experimentalClusterFromMatches(
    id: String,
    label: String,
    matches: List<MatchSummary>,
): ExperimentalBracketCluster {
    val rounds = matches
        .groupBy { it.roundNumber }
        .toSortedMap()
        .map { (_, roundMatches) ->
            ExperimentalBracketRound(
                title = roundMatches.firstOrNull()?.roundDisplayTitle ?: "Ronda",
                matches = roundMatches.sortedBy { it.matchNumber }
            )
        }
    return ExperimentalBracketCluster(
        id = sanitizeHtmlId(id),
        label = label,
        rounds = rounds
    )
}

private fun experimentalSectionLabel(match: MatchSummary): String {
    if (match.isPoolMatch) {
        return match.poolLabel?.takeIf { it.isNotBlank() } ?: "Pools"
    }
    val customPhaseName = match.phaseDisplayLabel.takeIf {
        it.isNotBlank() &&
            !it.equals(match.bracketStage, ignoreCase = true) &&
            !it.equals(match.poolLabel, ignoreCase = true) &&
            !it.equals("bracket", ignoreCase = true)
    }
    return when (match.bracketStage) {
        "WINNERS" -> customPhaseName ?: "Winners bracket"
        "LOSERS" -> customPhaseName ?: "Losers bracket"
        "FINALS" -> customPhaseName ?: "Bracket final"
        "POOLS" -> customPhaseName ?: "Pools"
        else -> customPhaseName ?: match.bracketStage
    }
}

private fun experimentalTournamentBracketLabel(match: MatchSummary): String {
    val customPhaseName = match.phaseDisplayLabel.takeIf {
        it.isNotBlank() &&
            !it.equals(match.bracketStage, ignoreCase = true) &&
            !it.equals("bracket", ignoreCase = true)
    }
    return customPhaseName ?: "Bracket final"
}

private fun buildExperimentalMatchCardHtml(
    match: MatchSummary,
    roundIndex: Int,
    matchIndex: Int,
    clusterMatches: List<MatchSummary>,
    connectionGroup: String,
    isSelectable: Boolean,
    callTimeoutMinutes: Int,
    characterAssetUrl: (String) -> String?,
): String {
    val sourceMatchIds = experimentalSourceMatchIds(match, clusterMatches).joinToString(",")
    val normalizedStatus = match.status.uppercase()
    val statusClass = when (normalizedStatus) {
        "CALLED" -> "called"
        "PLAYING" -> "playing"
        else -> ""
    }
    val participantRows = match.participantNames.indices.joinToString("") { index ->
        val participantName = match.participantNames.getOrElse(index) { "TBD" }
        val participantId = match.participantIds.getOrNull(index).orEmpty()
        val isWinner = participantId.isNotBlank() && (participantId == match.winnerParticipantId || participantId in match.advancingParticipantIds)
        val isLoser = (match.winnerParticipantId != null || match.advancingParticipantIds.isNotEmpty()) && participantId.isNotBlank() && !isWinner
        val rowClass = when {
            isWinner -> "winner"
            isLoser -> "loser"
            else -> ""
        }
        val scoreLabel = experimentalParticipantScoreLabel(match, index)
        val scoreClass = if (scoreLabel == "DQ") "entrant-score dq" else "entrant-score"
        val selections = match.gameCharacterSelections.maxByOrNull { it.gameNum }?.selections
            ?.takeIf { list -> list.any { it.participantId == participantId } } ?: match.characterSelections
        val iconHtml = if (scoreLabel == "DQ") "" else selections
            .filter { it.participantId == participantId }
            .flatMap { it.characterName.split(" / ") }
            .mapNotNull { character -> characterAssetUrl(character)?.let { url ->
                """<img class="entrant-icon" src="${escapeHtml(url)}" alt="${escapeHtml(character)}" />"""
            } }.joinToString("")
        """
        <div class="entrant-row $rowClass">
          <div class="entrant-main">
            $iconHtml
            <div class="entrant-name">${escapeHtml(participantName)}</div>
          </div>
          <div class="$scoreClass">${escapeHtml(scoreLabel)}</div>
        </div>
        """.trimIndent()
    }

    val footerBits = buildList {
        if (match.advancersRequired <= 1) {
            add("Bo${match.effectiveBestOf}")
        }
        match.stationLabel?.takeIf { it.isNotBlank() }?.let(::add)
        if (match.advancersRequired > 1) {
            add("Pasan ${match.advancersRequired}")
        }
    }
    val timingRole = when (normalizedStatus) {
        "CALLED" -> "called"
        "PLAYING" -> "playing"
        else -> ""
    }

    return """
        <article class="match-card ${if (isSelectable) "actionable" else ""} $statusClass" data-round-index="$roundIndex" data-match-index="$matchIndex" data-match-id="${escapeHtml(match.id)}"
          data-search-names="${escapeHtml(match.participantNames.filterIndexed { index, _ -> match.participantIds.getOrNull(index)?.let { it.isNotBlank() && experimentalSourceMatchIdFromPlaceholder(it) == null } == true }.joinToString(" · "))}" data-actionable="${if (isSelectable) "true" else "false"}" data-source-match-ids="${escapeHtml(sourceMatchIds)}" data-bracket-stage="${escapeHtml(match.bracketStage)}" data-connection-group="${escapeHtml(connectionGroup)}" data-status="${escapeHtml(match.status)}" data-called-at="${escapeHtml(match.calledAt.orEmpty())}" data-started-at="${escapeHtml(match.startedAt.orEmpty())}" data-call-timeout-seconds="${callTimeoutMinutes * 60}">
          <div class="match-header">
            <span>${escapeHtml((match.displayIdentifier ?: "M${match.matchNumber}") + if (match.startggStreamLabel != null) " · Stream gg" else "")}</span>
            <span class="status-pill">${escapeHtml(match.status)}</span>
          </div>
          ${if (timingRole.isNotEmpty()) """<div class="match-timer $timingRole" data-timing-role="$timingRole"></div>""" else ""}
          $participantRows
          ${if (footerBits.isNotEmpty()) """<div class="match-footer">${escapeHtml(footerBits.joinToString(" · "))}</div>""" else ""}
        </article>
    """.trimIndent()
}

private fun experimentalSourceMatchIds(
    match: MatchSummary,
    candidateMatches: List<MatchSummary> = emptyList(),
): List<String> {
    if (match.isRoundRobinPhase) {
        return emptyList()
    }
    val sourceIds = linkedSetOf<String>()
    match.participantIds
        .mapNotNull(::experimentalSourceMatchIdFromPlaceholder)
        .forEach(sourceIds::add)

    val targetIndex = candidateMatches.indexOfFirst { it.id == match.id }
    val earlierMatches = if (targetIndex >= 0) {
        candidateMatches.take(targetIndex)
    } else {
        candidateMatches.filter { it.id != match.id }
    }
    match.participantIds.forEach { participantId ->
        if (participantId.isBlank() || experimentalSourceMatchIdFromPlaceholder(participantId) != null) {
            return@forEach
        }
        val sourceMatch = earlierMatches
            .asReversed()
            .firstOrNull { candidate -> experimentalFeedsParticipant(candidate, participantId) }
        sourceMatch?.id?.let(sourceIds::add)
    }
    return sourceIds.toList()
}

private fun experimentalFeedsParticipant(match: MatchSummary, participantId: String): Boolean {
    if (participantId.isBlank()) {
        return false
    }
    if (match.advancingParticipantIds.contains(participantId)) {
        return true
    }
    if (match.winnerParticipantId == participantId) {
        return true
    }
    return match.participantIds.contains(participantId)
}

private fun experimentalSourceMatchIdFromPlaceholder(participantId: String): String? {
    return when {
        participantId.startsWith("winner_of_") -> participantId.removePrefix("winner_of_")
        participantId.startsWith("loser_of_") -> participantId.removePrefix("loser_of_")
        participantId.startsWith("advance_") -> Regex("^advance_\\d+_of_(.+)$").find(participantId)?.groupValues?.getOrNull(1)
        participantId.startsWith("drop_") -> Regex("^drop_\\d+_of_(.+)$").find(participantId)?.groupValues?.getOrNull(1)
        else -> null
    }?.takeIf { it.isNotBlank() }
}

private fun experimentalParticipantScoreLabel(match: MatchSummary, index: Int): String {
    val participantId = match.participantIds.getOrNull(index).orEmpty()
    if (match.status == "WALKOVER" && match.winnerParticipantId != null && participantId.isNotBlank()) {
        return if (participantId == match.winnerParticipantId) {
            match.participantScores.getOrElse(index) { 0 }.toString()
        } else {
            "DQ"
        }
    }
    return match.participantScores.getOrElse(index) { 0 }.toString()
}

private fun experimentalLatestCharacterForParticipant(match: MatchSummary, participantId: String): String? {
    if (participantId.isBlank()) {
        return null
    }
    return match.gameCharacterSelections
        .asReversed()
        .firstNotNullOfOrNull { game ->
            game.selections.firstOrNull { it.participantId == participantId }?.characterName
        }
        ?: match.characterSelections.firstOrNull { it.participantId == participantId }?.characterName
}

private fun experimentalIsAutomaticAdvanceDisplayMatch(match: MatchSummary): Boolean {
    if (match.status != "COMPLETED") {
        return false
    }
    if (match.calledAt != null || match.startedAt != null) {
        return false
    }
    if (match.characterSelections.isNotEmpty()) {
        return false
    }
    if (match.participantIds.isEmpty() || match.participantIds.size > match.advancersRequired) {
        return false
    }

    val advancedIds = buildSet {
        addAll(match.advancingParticipantIds)
        match.winnerParticipantId?.let(::add)
    }
    if (advancedIds.isEmpty()) {
        return false
    }

    return match.participantIds.indices.all { index ->
        val participantId = match.participantIds[index]
        val score = match.participantScores.getOrElse(index) { 0 }
        score == if (advancedIds.contains(participantId)) 1 else 0
    }
}

private fun experimentalIsDormantGrandFinalReset(allMatches: List<MatchSummary>, match: MatchSummary): Boolean {
    if (match.bracketStage != "FINALS" || match.roundNumber <= 1) {
        return false
    }

    val hasActivity = match.status == "COMPLETED" ||
        match.status == "WALKOVER" ||
        match.calledAt != null ||
        match.startedAt != null ||
        match.winnerParticipantId != null ||
        match.advancingParticipantIds.isNotEmpty() ||
        match.gameResults.isNotEmpty() ||
        match.characterSelections.isNotEmpty() ||
        match.gameCharacterSelections.isNotEmpty() ||
        match.participantScores.any { it > 0 }
    if (hasActivity) {
        return false
    }

    val grandFinal = allMatches.firstOrNull {
        it.bracketStage == "FINALS" &&
            it.roundNumber == 1 &&
            it.matchNumber == match.matchNumber
    } ?: return true

    val grandFinalWinnerId = grandFinal.winnerParticipantId ?: return true
    val losersSideParticipantId = grandFinal.participantIds.getOrNull(1)?.takeIf { it.isNotBlank() } ?: return true
    return grandFinalWinnerId != losersSideParticipantId
}

private fun sanitizeHtmlId(value: String): String {
    return buildString {
        value.forEach { ch ->
            append(
                when {
                    ch.isLetterOrDigit() -> ch.lowercaseChar()
                    else -> '-'
                }
            )
        }
    }.trim('-').ifBlank { "section" }
}

private fun escapeHtml(value: String): String {
    return value
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("\"", "&quot;")
        .replace("'", "&#39;")
}

// Generated bracket search: scripts/sync-native-bracket-search.mjs
private val modernBracketSearchScript = """
// Shared by the Android and iOS native bracket renderers. No network access.
function installModernBracketSearch(activateSection, layoutSections) {
  const root = document.querySelector('.root');
  const cards = Array.from(root.querySelectorAll('.match-card[data-match-id]'));
  const style = document.createElement('style');
  style.textContent = '.bracket-search{flex:none;display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:8px;color:var(--text);background:var(--bg)}' +
    '.bracket-search input{flex:1 1 190px;min-width:0;min-height:44px;box-sizing:border-box;font:inherit;font-size:16px;padding:8px;border:1px solid var(--muted);border-radius:8px;background:var(--panel);color:var(--text)}' +
    '.bracket-search button{min-height:44px;min-width:44px;padding:8px;font:inherit;border:1px solid var(--muted);border-radius:8px;background:var(--panel);color:var(--text)}' +
    '.bracket-search button:disabled{opacity:.45}.bracket-search output{flex-basis:100%;font-size:13px;overflow-wrap:anywhere}' +
    '.match-card.search-hit{outline:2px dashed var(--text);outline-offset:3px}.match-card.search-current{outline:4px solid var(--text);outline-offset:4px}' +
    '.bracket-search input:focus-visible,.bracket-search button:focus-visible{outline:3px solid var(--text);outline-offset:2px}';
  document.head.appendChild(style);
  const bar = document.createElement('div');
  bar.className = 'bracket-search';
  bar.setAttribute('role', 'search');
  const input = document.createElement('input');
  input.type = 'search'; input.placeholder = 'Buscar jugador o equipo';
  input.setAttribute('aria-label', 'Buscar jugador o equipo en todas las fases');
  input.autocomplete = 'off'; input.maxLength = 120;
  const button = (label, action) => {
    const node = document.createElement('button'); node.type = 'button'; node.textContent = label;
    node.addEventListener('click', action); return node;
  };
  let hits = [], currentId = null, focusRevision = 0;
  const previous = button('Anterior', () => step(-1));
  const next = button('Siguiente', () => step(1));
  const clear = button('Limpiar', () => { input.value = ''; update(false); input.focus(); });
  const output = document.createElement('output');
  output.setAttribute('aria-live', 'polite'); output.setAttribute('aria-atomic', 'true');
  bar.append(input, previous, next, clear, output); root.prepend(bar);
  const normalized = text => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase();
  function update(center) {
    ++focusRevision; // Cancel a queued center after clearing/changing the search.
    const query = normalized(input.value);
    hits = query ? cards.filter(card => normalized(card.dataset.searchNames).includes(query)) : [];
    if (!hits.some(card => card.dataset.matchId === currentId)) currentId = hits[0]?.dataset.matchId || null;
    const hitSet = new Set(hits);
    cards.forEach(card => {
      card.classList.toggle('search-hit', hitSet.has(card));
      card.classList.toggle('search-current', !!query && card.dataset.matchId === currentId);
    });
    const index = hits.findIndex(card => card.dataset.matchId === currentId);
    const current = hits[index];
    const phase = current?.closest('.bracket-section')?.querySelector('.section-title')?.textContent || '';
    const matchLabel = current?.querySelector('.match-header span')?.textContent || '';
    output.textContent = !query ? 'Busca en todas las fases. Enter: siguiente; Mayús + Enter: anterior.' :
      current ? (index + 1) + ' de ' + hits.length + ' · ' + phase + ' · ' + matchLabel : 'Sin coincidencias';
    previous.disabled = next.disabled = hits.length < 2; clear.disabled = !input.value;
    if (center && current) centerCard(current);
  }
  function centerCard(card) {
    const revision = ++focusRevision;
    const section = card.closest('.bracket-section');
    activateSection(section.id);
    requestAnimationFrame(() => {
      if (revision !== focusRevision) return;
      layoutSections();
      requestAnimationFrame(() => {
        if (revision !== focusRevision) return;
        const viewport = section.querySelector('.unified-viewport');
        const target = card.getBoundingClientRect(), bounds = viewport.getBoundingClientRect();
        viewport.scrollLeft += target.left + target.width / 2 - bounds.left - viewport.clientWidth / 2;
        viewport.scrollTop += target.top + target.height / 2 - bounds.top - viewport.clientHeight / 2;
      });
    });
  }
  function step(direction) {
    if (!hits.length) return;
    const index = hits.findIndex(card => card.dataset.matchId === currentId);
    currentId = hits[(index + direction + hits.length) % hits.length].dataset.matchId;
    update(true);
  }
  input.addEventListener('input', () => { currentId = null; update(true); });
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); step(event.shiftKey ? -1 : 1); }
    if (event.key === 'Escape') { input.value = ''; update(false); }
  });
  window.__gttBracketSearch = {
    capture: () => ({ query: input.value, currentId, focused: document.activeElement === input }),
    restore: state => {
      if (!state) return;
      input.value = String(state.query || '').slice(0, 120); currentId = state.currentId;
      update(false); // Preserve the user's zoom/pan after polling, not only the search.
      if (state.focused) input.focus({ preventScroll: true });
    }
  };
  update(false);
}

""".trimIndent()
