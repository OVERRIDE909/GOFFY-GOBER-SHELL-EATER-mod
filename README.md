# GOFFY GOBER SHELL EATER MOD

A cosmetic Shell Shockers mod. **Only eggs wearing the turkey face look different**:
instead of the egg body + face, they show a 3D turkey model. Everything else is untouched.

> Status: **placeholder (v0.1.0), untested in a live game.** It uses a simple built-in
> turkey and a best-effort name match to find the turkey face. See "Tweaking" below.

## Install

1. Install a userscript manager in your browser, e.g. [Tampermonkey](https://www.tampermonkey.net/).
2. Open `shell-turkey-mod.user.js` from this repo and click **Raw**. Tampermonkey will offer to install it. (Or create a new script and paste the file in.)
3. Load [shellshock.io](https://shellshock.io), join a game, and equip / look at the turkey face.

## Use

- Any player (including you) wearing the turkey face is drawn as a turkey sitting in place of the egg.
- To disable it, turn the script off in the Tampermonkey menu and refresh.

## Tweaking (top of `shell-turkey-mod.user.js`, `CONFIG`)

| Option | What it does |
| --- | --- |
| `turkeyMeshPattern` | Regex matching the turkey-face mesh name. If nothing happens, set `debug: true`, look at mesh names in the console, and adjust this. |
| `modelUrl` | URL of your own `.glb` turkey. Empty = built-in placeholder. See `models/README.md`. |
| `scale`, `offset` | Resize / nudge the turkey so it sits right. |
| `debug` | Logs what the mod is doing to the browser console. |

## Not included

Hitbox overlays via StateFarmClient are intentionally **not** part of this. StateFarmClient
is a cheat client; showing other players' hitboxes would give a gameplay advantage and
can get your account banned.

## Known limits

- The game's internal names change between updates, so detection may need a tweak.
- Your own egg in first person may look odd since the whole model is swapped.
