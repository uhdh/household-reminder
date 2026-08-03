# Claude Code Handoff

## Project

- Repository: `uhdh/household-reminder`
- Production branch: `master`
- Local environment file: `.env.local` (ignored by Git; never commit or paste its values)
- Production URL: https://woorijip-iota.vercel.app
- Vercel project: `maktubhd-4121s-projects/woorijip`

## Recent work

### Investment P&L

- Fixed investment principal aggregation when the same product appears under multiple financial institutions.
- For the supplied workbook, `TIGER 미국S&P500` is:
  - 한국투자증권: principal 14,123,454원, value 17,363,150원, return 22.94%
  - NH투자증권: principal 5,489,059원, value 6,318,620원, return 15.11%
  - Combined principal: 19,612,513원
- Product-name normalization handles whitespace and zero-width characters.
- Sector classification is automatic from product names; the workbook does not need a sector column.

### Spending pages

Pulled from the other PC in commit `dc4f9e9`:

- `/finance/spending`
- `/finance/spending/monthly`
- `/finance/spending/yearly`
- `/finance/spending/settings`

The production database migration and seed were run successfully:

- `category_mappings` table created/updated
- `budget_categories` table created/updated
- Derived transaction columns added and backfilled for 14,612 rows
- 60 category mappings seeded
- 46 budget categories seeded

The scripts are:

- `scripts/migrate-spending.ts`
- `scripts/seed-spending.ts`

They require `DATABASE_URL`; `tsx` does not load `.env.local` automatically, so load the variable in the shell before running them.

## Validation

- `npm test`: 47 tests passed
- `npx tsc --noEmit`: passed after rebuilding `.next`
- `npm run build`: passed, including the spending routes

## Deployment workflow

Vercel is connected to GitHub and `master` is the Production Branch. Normal workflow:

```powershell
git pull origin master
# edit files
git add <files>
git commit -m "describe change"
git push origin master
```

No Vercel token is needed for the normal Git push workflow. A token is only needed for direct Vercel CLI commands or Vercel environment-variable operations. `.env.local` is local-only and is not deployed from the repository.

## Current state

- Local branch should match `origin/master`.
- Do not reset or discard user changes.
- Before changing finance calculations, compare against the source workbook rows by financial institution and product name.
