package com.gestortorneos.app.ui

import androidx.compose.foundation.lazy.LazyItemScope
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.runtime.Composable

/** Records stable section keys while building a lazy list, including hidden rows. */
internal fun LazyListScope.withReviewAnchors(indices: MutableMap<String, Int>, content: LazyListScope.() -> Unit) {
    indices.clear()
    val delegate = this
    val scope = object : LazyListScope by delegate {
        var index = 0
        override fun item(key: Any?, contentType: Any?, content: @Composable LazyItemScope.() -> Unit) {
            if (key is String) indices[key] = index
            index++
            delegate.item(key, contentType, content)
        }
        override fun items(count: Int, key: ((Int) -> Any)?, contentType: (Int) -> Any?, itemContent: @Composable LazyItemScope.(Int) -> Unit) {
            if (key != null) repeat(count) { i -> (key(i) as? String)?.let { indices[it] = index + i } }
            index += count
            delegate.items(count, key, contentType, itemContent)
        }
    }
    scope.content()
}
