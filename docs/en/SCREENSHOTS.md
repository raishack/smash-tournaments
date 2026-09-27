# Example screens

These PNGs show the real web interfaces running locally with synthetic tournament data. Names, scores, registration capacity and dates are examples. They are not screenshots of a live event. The current interfaces are primarily in Spanish.

## Tournament display

![Modern tournament bracket](images/display-bracket.png)

The shared display rotates tournament scenes and can separate Winners and Losers for readability. Configure density, text scale and layout for the physical screen.

## Display administration

![Display settings and live preview](images/display-admin.png)

Preview layout changes before saving, manage event themes, artwork, sponsors and announcement templates.

## Web management

![Management tournament view](images/manage.png)

Staff use the same accounts as the native management apps and display administration. Players continue to use start.gg sign-in.

## Public team registration

![Team registration form](images/registration.png)

Players can create a team, join by invitation or register alone when the organizer allows it. A registration is confirmed through email.

## Results poster

![Editable Top 8 poster](images/top8-editor.png)

This example uses custom artwork mode and the generic logo. The editor also offers shared character collections, backgrounds, positioning and high-resolution PNG export.

## Battle royale administration

![Fortnite groups and results](images/fortnite.png)

Groups contain numbered participant seats. The separate guest VIP, placements and eliminations contribute to the accumulated score.

## Reproduce the examples

From the repository root with Node 22+:

```bash
npm ci
npx playwright install chromium
npm run screenshots
```

The script starts a temporary loopback server and an in-memory PostgreSQL-compatible test database. It does not read `.env`, contact a production server, send email or use real player accounts. Set `CHROME_PATH` if you prefer an installed compatible Chromium browser. It writes only `docs/en/images/` and temporary fixture data.

Return to the [README](../../README.md) or [User guide](USER_GUIDE.md).
