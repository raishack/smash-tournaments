package com.gestortorneos.ui

fun tournamentClientStatus(status: String, importState: String?): String = when {
    status == "ARCHIVED" -> "ARCHIVED"
    importState == "RUNNING" -> "IMPORTANDO"
    importState == "FAILED" -> "ERROR IMPORTACION"
    else -> status.replace('_', ' ')
}

fun mainStatusLabel(status: String): String = when (status) {
    "DRAFT" -> "Borrador"
    "PUBLISHED" -> "Publicado"
    "CHECK_IN" -> "Confirmación de asistencia"
    "READY" -> "Preparado para empezar"
    "IN_PROGRESS", "IN PROGRESS" -> "En curso"
    "COMPLETED" -> "Finalizado"
    "ARCHIVED" -> "Archivado · solo lectura"
    "CANCELLED" -> "Cancelado"
    "IMPORTANDO" -> "Importando"
    "ERROR IMPORTACION" -> "Error de importación"
    "PENDING" -> "Pendiente"
    "CALLED" -> "Llamado"
    "CHECKED_IN" -> "Asistencia confirmada"
    "PLAYING" -> "En juego"
    "WALKOVER" -> "Resuelto por ausencia"
    "RESULT_REPORTED" -> "Resultado enviado"
    "UNDER_REVIEW" -> "En revisión"
    else -> status
}

fun tournamentNextStep(status: String, fortnite: Boolean): String? = when (status) {
    "READY" -> if (fortnite) "Abre el panel Fortnite para iniciar las partidas y anotar puntuaciones." else "La bracket está preparada. Pulsa Iniciar torneo para comenzar."
    "IN_PROGRESS", "IN PROGRESS" -> if (fortnite) "Confirma las actas y cierra la final desde el panel Fortnite. Después podrás crear la imagen Top 8." else "El torneo finaliza al resolver todos los cruces necesarios. Entonces podrás crear la imagen Top 8."
    else -> null
}
