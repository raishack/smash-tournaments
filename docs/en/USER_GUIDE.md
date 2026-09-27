# Running a tournament

[Back to the project](../../README.md)

The interfaces are currently primarily Spanish. This English guide includes the visible labels in parentheses.

## Accounts and entry points

| Location | Use |
| --- | --- |
| Management apps | Full event creation and operation |
| `/manage/` | Browser-based event operations and match reporting |
| `/admin/` | Display scenes, themes, sponsors, notifications and previews |
| `/account/` | Password changes and superadmin user management |
| `/` | Public venue display |
| Registration link | Player/team email registration; copy the link from its event |
| Top 8 / Fortnite / registration admin | Open protected event-specific links from management |

Management sessions are shared in purpose and account identity, not as a universal password. Players uses start.gg sign-in. Event-specific editor links are access links: share registration links publicly, not administration/editor links.

## 1. Create an event

In a management app, choose **Create tournament (Crear torneo)**. Set its name, game, platform, start time, maximum entrants, format and match best-of. Choose setups and optionally one or two streams. You can change operational setup/stream availability later; structural settings are locked once the tournament has started.

For ordinary local brackets choose single elimination, double elimination or round robin. For games such as LoL/Valorant, choose team entries and configure starters, reserves and optional solo registration. For Fortnite choose its dedicated mode instead of a normal head-to-head bracket.

Imported start.gg events retain source phase/group and match information. Import status is visible while the backend continues the background job, even if a phone is locked. Wait for import completion before operating the event. Marked-for-stream information from start.gg is informational; your actual setup/stream assignment is a separate operation.

## 2. Participants, teams and registration

Add entrants manually, or enable **Online registration (Inscripción online)** and copy its public URL. SMTP must be configured. Players provide their nickname and email and confirm using the emailed link; unverified requests do not become confirmed entrants.

Capacity and optional waitlists are controlled by the event. Registration can be closed manually **before** generating the bracket, or using a deadline. Verify the actual confirmed entrants before drawing.

For team events, bracket entries use team names. Expand a team in administration to inspect individual nicknames, starters and reserves. Solo applicants appear in a separate list so organizers can place them into an existing team or form a new one. Use roster/substitution actions rather than renaming a bracket entrant to represent a roster change.

## 3. Prepare and seed

Use **Review preparation and closing (Revisar preparación y cierre)** to check registration, attendance, rosters, draw readiness and synchronization. Each finding links to its relevant section.

Confirm **Attendance (Asistencia)** if check-in is required. Set seed numbers manually or choose random seeding, then generate the bracket. Only eligible active/check-in entrants enter the draw. If eligibility changes before starting, regenerate the prepared bracket. After starting, use the appropriate absence/DQ operations instead.

Double-elimination drops cross branches to reduce early rematches. This is not a guarantee that a rematch can never occur. Existing brackets are not silently rebuilt when the algorithm changes.

## 4. Run matches

1. Start the event and select a ready match.
2. Call it to an available setup or stream. Notification work runs asynchronously.
3. Record scores or individual games/characters where supported.
4. Save a valid completed best-of result, or use the relevant absence/DQ option.
5. Review pending/failed start.gg synchronization when applicable.

Character reporting supports the relevant Smash/Rivals workflows, including team selections where available. A score correction preserving the winner keeps dependent completed results; changing the winner can reset dependent rounds. Review the impact before correcting a result.

The modern bracket supports search, previous/next matching matches, pan/zoom and fullscreen. Opening/closing match actions preserves fullscreen. On wide screens adaptive operations use a side panel; mobile uses dialogs. **Profile/Settings → Appearance → Adaptive interface (Interfaz adaptada)** restores the classic presentation if preferred.

## 5. Show the venue display

Enable the event's **Show on display (Mostrar en display)** option, then open `/` on the presentation computer. Archived/disabled events are excluded.

In `/admin/`, choose modern/classic rendering, density, paging, display timing and winners/losers presentation. Preview changes before saving. Separate winners/losers views can be more readable than trying to fit an entire large bracket in one frame. Select the relevant tournament/pool when operating a dedicated screen.

Upload your own backgrounds, videos, overlays, sponsor logos and sounds. Check readability on the actual TV/projector. The rendering scales to large/high-resolution viewports; a source image still needs enough resolution for its intended use.

## 6. Fortnite

Set lobby size, participant capacity and games per round. The system balances entrants across initial groups and assigns numbered seats randomly. All configured games contribute to the round's accumulated score; this is not first-to-N wins.

Open the Fortnite scoring panel, generate groups and start the selected game. Record first/second/third placement, each player's kills, the VIP elimination and absences as appropriate. Save drafts while checking the sheet, then complete the game. Finish the round only after the required games are completed. Where multiple initial groups exist, qualified top players advance toward a final group.

The VIP is an **extra guest**, not a registered entrant or ranked tournament participant. The software supports the requested model of up to 100 entrants plus the VIP; that bookkeeping model does not change the capacity of the actual Fortnite mode/server. Check the playable lobby capacity when planning your event.

Scoring: **10 points for first, 6 for second, 4 for third, 1 per kill and 5 extra for eliminating the VIP**. Points accumulate across all games in the round. Ties use first/second/third finishes, kills, VIP eliminations, then the assigned seat; a tie at the qualification cutoff requires explicit confirmation. These values are implemented in `backend/src/modules/fortnite/fortnite-model.ts`, not configurable through the UI. The public display shows group/game progress and standings rather than a head-to-head bracket.

## 7. Ladder

Open the event's ladder controls, configure its operational settings and available setups, then start the session. Players use their start.gg identity for supported enrollment/check-in and result-confirmation flows. Review disputed or unconfirmed results before closing the ladder. Bracket and ladder setup reservations coordinate to avoid assigning the same station twice.

## 8. Finish, export and archive

Once all required matches are resolved, review tournament completion and pending synchronization. Open **Results poster / Top 8 (Cartel de resultados)** from the completed event.

- Imported events use final start.gg standings when available. If they cannot be obtained, verify and complete uncertain positions before export.
- Local events fill the participants/known placements; customize all visuals.
- Choose one character-art collection for the entire poster or upload your own participant artwork.
- Set layout, colors, background opacity, event logo, typography and image placement.
- Save a project for later editing and export a single high-resolution **PNG**.

Finally choose **Archive tournament (Archivar torneo)**. Archived events move to their own list, disappear from the display and become read-only. **Unarchive (Desarchivar torneo)** explicitly restores a completed event for corrections; display visibility remains off until enabled again.
