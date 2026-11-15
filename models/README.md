# models/

Source `.glb` files for `tools/build-model.mjs` go here (they are git-ignored; only the
simplified, embedded copy inside `shell-goose-mod.user.js` is committed).

Keep models low-poly: the build tool simplifies to a triangle budget (default 4,000) so a
lobby full of geese doesn't hurt frame rate.
