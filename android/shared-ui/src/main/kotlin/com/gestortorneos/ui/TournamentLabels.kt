package com.gestortorneos.ui

fun tournamentClientStatus(status: String, importState: String?): String = when {
    status == "ARCHIVED" -> "ARCHIVED"
    importState == "RUNNING" -> "IMPORTING"
    importState == "FAILED" -> "IMPORT ERROR"
    else -> status.replace('_', ' ')
}

fun mainStatusLabel(status: String): String = when (status) {
    "DRAFT" -> "Draft"
    "PUBLISHED" -> "Published"
    "CHECK_IN" -> "Attendance confirmation"
    "READY" -> "Ready to start"
    "IN_PROGRESS", "IN PROGRESS" -> "In progress"
    "COMPLETED" -> "Finished"
    "ARCHIVED" -> "Archived · read-only"
    "CANCELLED" -> "Cancelled"
    "IMPORTING" -> "Importing"
    "IMPORT ERROR" -> "Import error"
    "PENDING" -> "Pending"
    "CALLED" -> "Called"
    "CHECKED_IN" -> "Attendance confirmed"
    "PLAYING" -> "Playing"
    "WALKOVER" -> "Resolved due to absence"
    "RESULT_REPORTED" -> "Result submitted"
    "UNDER_REVIEW" -> "Under review"
    else -> status
}

fun tournamentNextStep(status: String, fortnite: Boolean): String? = when (status) {
    "READY" -> if (fortnite) "Open the Fortnite panel to start games and enter scores." else "The bracket is ready. Select Start tournament to begin."
    "IN_PROGRESS", "IN PROGRESS" -> if (fortnite) "Confirm score sheets and close the final in the Fortnite panel. You can then create the Top 8 image." else "The tournament finishes when all required matches are resolved. You can then create the Top 8 image."
    else -> null
}
