# Architecture

Dependency direction is intentionally one-way. Shared types have no workspace dependencies. The math engine depends only on shared types and owns randomness abstraction, reel stops, visible windows, paylines, scatters, triggers, caps, aggregation, and simulation. The game depends on both packages; neither package depends on Phaser or the DOM.

Editable, isolated `math/profiles/<configuration-id>/` inputs flow through validator/compiler scripts into fingerprinted `math/generated/<configuration-id>/` artifacts and the game's public data directory. Every math command requires explicit profile selection. The compiler never writes source files, and the simulator reads the selected profile directly before writing profile-specific reports. The legacy `math/source` snapshot is not a pipeline input. Tests use small explicit fixtures rather than UI state.

A controller requests a complete `SpinResult` before calling the Phaser presentation scene. Animation duration, input timing, and frame rate cannot change the selected stops or awards. Future features must retain this boundary: orchestration may sequence engine results, but UI and animation may only present them.
