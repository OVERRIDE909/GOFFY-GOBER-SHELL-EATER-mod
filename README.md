# GOFFY GOBER SHELL EATER MOD

A cosmetic Shell Shockers userscript:

- **Goose skin:** eggs wearing the **turkey face** become an Untitled-Goose-Game-style goose (white, orange beak and feet, black eyes).
- **Goose guns:** guns with a **turkey skin** become a goose blaster.
- **Duck grenades:** **every** grenade (whatever skin you have) becomes a Fall Guys duck, in your hand and in flight.
- **Vine boom:** the grenade explosion sound is replaced with the vine boom.
- Every feature has its own on/off switch in the in-game **Goose Mod** settings panel.

Purely visual/audio, and only on your screen: nobody else sees or hears the change.

![Goose Mod preview](docs/preview.png)

> Status: **v0.4.0.** Tested in a mock Babylon.js scene in a real browser, **not yet in a live Shell Shockers match.**
> Finding the turkey face, turkey gun skins, grenades and the explosion sound is a best-effort name match (see *Tweaking*).

## Install

1. Install a userscript manager such as [Tampermonkey](https://www.tampermonkey.net/).
2. Open `shell-goose-mod.user.js` in this repo and click **Raw**. Tampermonkey offers to install it. (Or make a new script and paste the file in.)
3. Go to [shellshock.io](https://shellshock.io) and join a game.

## Settings

Press **Alt+G**, or click the small **Goose Mod** button in the bottom-left corner.

| Setting | What it does |
| --- | --- |
| Mod enabled | Master on/off switch. Off restores everything right away. |
| Goose skin on turkey-face eggs | Swap turkey-face eggs for the goose. |
| Goose guns on turkey gun skins | Swap turkey-skinned guns for the goose blaster. |
| Duck grenades (all grenades) | Swap every grenade for the Fall Guys duck. |
| Vine boom grenade sound | Replace the explosion sound. **Reload the page** after changing this one. |
| Goose model | **Detailed** (~4,000 triangles) or **Simple** (~1,000 triangles, for slow PCs/Chromebooks). |
| Debug log | Prints what the mod finds and swaps to the browser console (F12). |

Settings are saved in your browser only.

## Tweaking (`CONFIG` at the top of the script)

| Option | What it does |
| --- | --- |
| `facePattern` | Regex matching the turkey item's mesh/material/texture name. |
| `gunWords` | Words that mark a mesh as a gun. A mesh matching `facePattern` **and** `gunWords` is a turkey gun skin. |
| `grenadePattern` | Regex matching grenade meshes. |
| `grenadeSoundPattern` | Regex matching the explosion sound file's URL. |
| `gooseColors` | Body / feet / beak / eyes colours. |
| `gooseScale`, `gooseOffset`, `gooseRotationY` | Size, position and facing of the goose. |
| `gunScale`, `gunRotation` | Size and direction of the goose gun. |
| `grenadeScale` | Size of the duck grenade. |

If something isn't swapped in game: turn on **Debug log**, look at the mesh names and sound URLs in the console, and adjust the patterns.

## Using different models or sounds

Models and the sound are embedded in the script so it never downloads anything while you play.

```bash
cd tools && npm install
```

Swap the goose (turkey-face eggs) or the grenade duck. The number is the triangle budget; the tool simplifies to it so the game doesn't lag:

```bash
node build-model.mjs path/to/model.glb goose 4000
```

```bash
node build-model.mjs path/to/model.glb grenade 3000
```

`.usdz` models (e.g. from Apple/Sketchfab) need converting to `.glb` first. This bakes their textures into vertex colours:

```bash
pip install usd-core pillow
```

```bash
python usd_to_glb.py model.usdz model.glb
```

Swap the explosion sound (MP3, under 200 KB):

```bash
node embed-sound.mjs path/to/sound.mp3
```

For `goose` models, part colours come from material names `body`, `feet`, `beak` and `eyes` (anything else is coloured as body). `grenade` models keep their own colours.

## Credits and licensing

The goose is a fan model of the goose from *Untitled Goose Game* (House House), the duck is a fan model of the *Fall Guys* duck (Mediatonic/Epic Games), and the vine boom is a meme sound. They are included for personal, non-commercial fun. If this repo is public, check the licences of the original uploads before sharing it widely.

## Not included

No hitbox overlays or StateFarmClient integration. Those would show other players' positions, which is cheating.
