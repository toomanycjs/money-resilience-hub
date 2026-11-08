Verify the rules config for the tax year given as $ARGUMENTS against its sources.

For each value in packages/rules/config/$ARGUMENTS.json: open its source URL (WebFetch), find the figure on the page, and compare it with the stored value. Where they match, set verified to today's date and run `pnpm sources:archive` so the archived copy is refreshed. Where they differ, or the page no longer shows the figure, list the path, the stored value, what the page says and the URL, and stop. Never change a value without the owner's confirmation. Finish with `pnpm rules:check` and `pnpm test`.
