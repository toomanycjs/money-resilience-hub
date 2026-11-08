Log a correction: $ARGUMENTS (a one-line summary).

Add an entry to docs/corrections.json with today's date, the page, what was wrong, the dates it was wrong between, who it affected and what changed. Add a fixture to packages/rules/fixtures that would have caught it, with a source URL. Run `pnpm test` and `pnpm build`. Do not edit the config value itself unless the owner has confirmed the correct figure and its source.
