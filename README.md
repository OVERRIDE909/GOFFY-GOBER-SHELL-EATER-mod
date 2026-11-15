# GOFFY GOBER SHELL EATER MOD

A cosmetic Shell Shockers userscript with an Untitled-Goose-Game look:

- **Goose skin:** any egg wearing the **turkey face** is drawn as a white goose with orange beak and feet instead of the egg body + face.
- **Goose guns:** any gun with a **turkey skin** is drawn as a goose blaster.
- Both can be switched on/off in the in-game **Goose Mod** settings panel.

Purely visual, and only on your screen: nobody else sees the change.

> Status: **v0.3.0.** Tested in a mock Babylon.js scene, **not yet in a live Shell Shockers match.**
> Finding the turkey face and turkey gun skins is a best-effort name match (see *Tweaking*).

## Install

1. Install a userscript manager such as [Tampermonkey](https://www.tampermonkey.net/).
2. Open `shell-goose-mod.user.js` in this repo and click **Raw**. Tampermonkey offers to install it. (Or make a new script and paste the file in.)
3. Go to [shellshock.io](https://shellshock.io) and join a game.

## Settings

Press **Alt+G**, or click the small **Goose Mod** button in the bottom-left corner.

| Setting | What it does |
| --- | --- |
| Mod enabled | Master on/off switch. Off restores every egg and gun right away. |
| Goose skin on turkey-face eggs | Swap turkey-face eggs for the goose. |
| Goose guns on turkey gun skins | Swap turkey-skinned guns for the goose blaster. |
| Goose model | **Detailed** (~4,000 triangles) or **Simple** (~1,000 triangles, for slow PCs/Chromebooks). |
| Debug log | Prints what the mod finds and swaps to the browser console (F12). |

Settings are saved in your browser only.

## Tweaking (`CONFIG` at the top of the script)

| Option | What it does |
| --- | --- |
| `facePattern` | Regex matching the turkey item's mesh/material/texture name. |
| `gunWords` | Words that mark a mesh as a gun. A mesh matching `facePattern` **and** `gunWords` is treated as a turkey gun skin. |
| `gooseColors` | Body / feet / beak / eyes colours. |
| `gooseScale`, `gooseOffset`, `gooseRotationY` | Size, position and facing of the goose. |
| `gunScale`, `gunRotation` | Size and direction of the goose gun. |

If nothing gets swapped in game: turn on **Debug log**, look at the mesh names in the console, and adjust `facePattern` / `gunWords`.

## Using a different model

The goose is embedded in the script as compressed data so it doesn't need to download anything. To swap in another `.glb`:

```bash
cd tools && npm install
```

```bash
node build-model.mjs path/to/model.glb 4000
```

The last number is the triangle budget. The tool simplifies the model to that size and rewrites the data block in `shell-goose-mod.user.js`. Colours come from material names `body`, `feet`, `beak` and `eyes`; anything else is coloured as body.

## Not included

No hitbox overlays or StateFarmClient integration. Those would show other players' positions, which is cheating.
