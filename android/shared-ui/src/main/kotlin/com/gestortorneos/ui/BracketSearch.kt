package com.gestortorneos.ui

import java.text.Normalizer
import java.util.Locale

fun bracketSearchMatches(names: List<String>, query: String): Boolean {
    fun normalize(value: String) = Normalizer.normalize(value.trim(), Normalizer.Form.NFD)
        .replace(Regex("\\p{M}+"), "").lowercase(Locale.ROOT)
    val needle = normalize(query)
    return needle.isNotEmpty() && names.any { normalize(it).contains(needle) }
}
