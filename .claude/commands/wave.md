Release the next wave for a generated family: $ARGUMENTS (family and wave number, e.g. "salary 2").

Check Search Console's page indexing report for the family's sitemap first and report how much of the previous wave is indexed; if it is under 80%, stop and say so. Otherwise set the family's `wave` in config/waves.json, run `pnpm pages:gen` and report what was built and what the guard skipped and why, run `pnpm build`, and list the new URLs. Do not generate beyond the wave asked for.
