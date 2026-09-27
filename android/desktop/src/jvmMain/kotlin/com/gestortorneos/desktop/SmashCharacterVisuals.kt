package com.gestortorneos.desktop

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.painter.BitmapPainter
import androidx.compose.ui.graphics.painter.Painter
import androidx.compose.ui.graphics.toComposeImageBitmap
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import org.jetbrains.skia.Image
import java.util.concurrent.ConcurrentHashMap

private val smashCharacterAssetFileNames = mapOf(
    "Bayonetta" to "bayonetta",
    "Bowser Jr." to "bowser_jr",
    "Bowser" to "bowser",
    "Captain Falcon" to "captain_falcon",
    "Cloud" to "cloud",
    "Corrin" to "corrin",
    "Daisy" to "daisy",
    "Dark Pit" to "dark_pit",
    "Diddy Kong" to "diddy_kong",
    "Donkey Kong" to "donkey_kong",
    "Dr. Mario" to "dr_mario",
    "Duck Hunt" to "duck_hunt",
    "Falco" to "falco",
    "Fox" to "fox",
    "Ganondorf" to "ganondorf",
    "Greninja" to "greninja",
    "Ice Climbers" to "ice_climbers",
    "Ike" to "ike",
    "Inkling" to "inkling",
    "Jigglypuff" to "jigglypuff",
    "King Dedede" to "king_dedede",
    "Kirby" to "kirby",
    "Link" to "link",
    "Little Mac" to "little_mac",
    "Lucario" to "lucario",
    "Lucas" to "lucas",
    "Lucina" to "lucina",
    "Luigi" to "luigi",
    "Mario" to "mario",
    "Marth" to "marth",
    "Mega Man" to "mega_man",
    "Meta Knight" to "meta_knight",
    "Mewtwo" to "mewtwo",
    "Mii Brawler" to "mii_fighter",
    "Mii Swordfighter" to "mii_fighter",
    "Mii Gunner" to "mii_fighter",
    "Ness" to "ness",
    "Olimar" to "olimar",
    "Pac-Man" to "pac_man",
    "Palutena" to "palutena",
    "Peach" to "peach",
    "Pichu" to "pichu",
    "Pikachu" to "pikachu",
    "Pit" to "pit",
    "Pokemon Trainer" to "pokemon_trainer",
    "Ridley" to "ridley",
    "R.O.B." to "rob",
    "Robin" to "robin",
    "Rosalina" to "rosalina_and_luma",
    "Roy" to "roy",
    "Ryu" to "ryu",
    "Samus" to "samus",
    "Sheik" to "sheik",
    "Shulk" to "shulk",
    "Snake" to "snake",
    "Sonic" to "sonic",
    "Toon Link" to "toon_link",
    "Villager" to "villager",
    "Wario" to "wario",
    "Wii Fit Trainer" to "wii_fit_trainer",
    "Wolf" to "wolf",
    "Yoshi" to "yoshi",
    "Young Link" to "young_link",
    "Zelda" to "zelda",
    "Zero Suit Samus" to "zero_suit_samus",
    "Mr. Game & Watch" to "mr_game_and_watch",
    "Incineroar" to "incineroar",
    "King K. Rool" to "king_k_rool",
    "Dark Samus" to "dark_samus",
    "Chrom" to "chrom",
    "Ken" to "ken",
    "Simon Belmont" to "simon",
    "Richter" to "richter",
    "Isabelle" to "isabelle",
    "Piranha Plant" to "piranha_plant",
    "Joker" to "joker",
    "Hero" to "hero",
    "Banjo-Kazooie" to "banjo_kazooie",
    "Terry" to "terry",
    "Byleth" to "byleth",
    "Min Min" to "min_min",
    "Steve" to "steve",
    "Sephiroth" to "sephiroth",
    "Pyra & Mythra" to "pyra",
    "Kazuya" to "kazuya",
    "Sora" to "sora",
)

private val roa2CharacterAssetFileNames = mapOf(
    "Zetterburn" to "zetterburn",
    "Orcane" to "orcane",
    "Wrastor" to "wrastor",
    "Kragg" to "kragg",
    "Forsburn" to "forsburn",
    "Maypul" to "maypul",
    "Absa" to "absa",
    "Etalus" to "etalus",
    "Ranno" to "ranno",
    "Clairen" to "clairen",
    "Olympia" to "olympia",
    "Fleet" to "fleet",
    "Loxodont" to "loxodont",
    "Galvan" to "galvan",
    "La Reina" to "la_reina",
    "Slade" to "slade",
)

private fun isRoa2GameTitle(gameTitle: String): Boolean {
    val normalized = gameTitle.lowercase()
    return normalized.contains("roa 2")
        || normalized.contains("roa2")
        || normalized.contains("roa ii")
        || normalized.contains("rivals of aether 2")
        || normalized.contains("rivals of aether ii")
        || normalized.contains("rivals 2")
        || normalized.contains("rivals ii")
}

private object CharacterResourceLoaderAnchor

private val characterPainterCache = ConcurrentHashMap<String, Painter?>()

private fun loadCharacterPainter(resourcePath: String): Painter? =
    characterPainterCache.getOrPut(resourcePath) {
        val classLoader = CharacterResourceLoaderAnchor::class.java.classLoader
            ?: Thread.currentThread().contextClassLoader
        val resourceBytes = classLoader
            ?.getResourceAsStream(resourcePath)
            ?.use { it.readBytes() }
            ?: return@getOrPut null
        runCatching {
            BitmapPainter(Image.makeFromEncoded(resourceBytes).toComposeImageBitmap())
        }.getOrNull()
    }

@Composable
internal fun SmashCharacterIcon(
    name: String,
    gameTitle: String = "",
    modifier: Modifier = Modifier,
    size: Dp = 24.dp,
) {
    val resourceFolder = if (isRoa2GameTitle(gameTitle)) "roa2-stock-icons" else "smash-stock-icons"
    val fileName = if (isRoa2GameTitle(gameTitle)) {
        roa2CharacterAssetFileNames[name]
    } else {
        smashCharacterAssetFileNames[name]
    }
    if (fileName == null) {
        CharacterIconFallback(name = name, modifier = modifier, size = size)
        return
    }
    val painter = remember(resourceFolder, fileName) {
        loadCharacterPainter("$resourceFolder/$fileName.png")
    }
    if (painter == null) {
        CharacterIconFallback(name = name, modifier = modifier, size = size)
        return
    }
    Image(
        painter = painter,
        contentDescription = name,
        modifier = modifier
            .size(size)
            .clip(RoundedCornerShape(6.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f))
    )
}

@Composable
internal fun SmashCharacterInlineLabel(
    name: String,
    gameTitle: String = "",
    modifier: Modifier = Modifier,
    iconSize: Dp = 24.dp,
    textColor: Color = MaterialTheme.colorScheme.onSurface,
) {
    Row(modifier = modifier, verticalAlignment = Alignment.CenterVertically) {
        SmashCharacterIcon(name = name, gameTitle = gameTitle, size = iconSize)
        Spacer(modifier = Modifier.width(8.dp))
        Text(
            text = name,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            color = textColor,
        )
    }
}

@Composable
private fun CharacterIconFallback(
    name: String,
    modifier: Modifier = Modifier,
    size: Dp = 24.dp,
) {
    Box(
        modifier = modifier
            .size(size)
            .clip(RoundedCornerShape(6.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = name.trim().firstOrNull()?.uppercase() ?: "?",
            fontSize = 11.sp,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
