# Architecture

Dependency direction is intentionally one-way. Shared types have no workspace dependencies. The math engine depends only on shared types and owns randomness abstraction, reel stops, visible windows, paylines, scatters, triggers, caps, aggregation, and simulation. The game depends on both packages; neither package depends on Phaser or the DOM.

Editable `math/source` sheets flow through validator/compiler scripts into fingerprinted `math/generated` artifacts and the game's public data directory. The compiler never writes source files. The simulator reads the same source model and writes ignored reports. Tests use small explicit fixtures rather than UI state.

A controller requests a complete `SpinResult` before calling the Phaser presentation scene. Animation duration, input timing, and frame rate cannot change the selected stops or awards. Future features must retain this boundary: orchestration may sequence engine results, but UI and animation may only present them.
