# LUCKY888 data contracts

`game-config.json` schema 1.2.0 fixes the active identity (`lucky888`, `LUCKY888`, version 0.3.0, configuration `lucky888-balanced-base-v1`) and defines the aggregate paid-spin maximum. `rules-config.json` explicitly defines Wild substitution, line evaluation, and Scatter behavior. `bonus-config.json` defines initial/retrigger awards, finite limits, and alternate free-spin strip identity.

`reel-strips.csv` and `free-spin-reel-strips.csv` are separate human-edited authorities. Compilation reads them but never rewrites them. Runtime data embeds both validated strip sets, complete rules, source SHA-256, versions, identity, and generation time.

`SpinResult` preserves uncapped base line/Scatter/base/feature/total credits, credited total, cap reduction, cap status, and full feature detail. Simulation reports use explicit uncapped component names and aggregate credited names. Exact reports declare `exact-uncapped`, `exact-capped`, or `hybrid`; an estimated credited field declares `monte-carlo-estimate`.

Diagnostics retain full history while rendering the latest ten. CSV exports uncapped base, feature and total payouts, credited total, cap reduction, feature counters, base stops/window, and serialized feature spins with correct escaping.
