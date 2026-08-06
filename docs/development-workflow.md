# Development workflow

Branch from current `main` with a focused name. Keep source-sheet, engine, documentation, and fixture changes together where they represent one decision. Prefer small conventional commits. Never commit credentials, `node_modules`, build output, generated reports, or raw simulation dumps.

Before a pull request, run `npm run validate`, inspect changed generated/report files, and document math assumptions. Reviewers should verify exact fixtures, configuration versioning, integer-credit safety, and that presentation contains no payout logic. Merge reviewed work without force-pushing shared branches. Deployment is a separate, explicitly reviewed concern.
