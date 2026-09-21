# Double tap guard

An Obsidian plugin that stops taps inside configured elements from reaching the reading view's double-tap-to-edit handler on mobile. Tapping through the controls of an embedded interactive widget, such as a chess board rendered by another plugin, no longer flips the note into edit mode; a double tap on the prose around the widget still opens the editor.

## How it works

Obsidian mobile switches a reading-view note into editing on a double tap anywhere in the note body. A widget's own tap handlers sit on elements inside its wrapper and run first, so the guard attaches listeners to each configured wrapper that stop `dblclick`, `touchend` and `pointerup` from bubbling further. The gesture is absorbed inside the widget and disabled nowhere else. A MutationObserver arms wrappers as notes render. The plugin does nothing on desktop.

## Settings

One CSS selector per line names the wrappers to guard. The defaults cover the [Chess Tree](https://github.com/west-shell/obsidian-chess-tree) plugin's embed wrappers (`.ct-block` for 2.10 and later, `.tree-codeblock` for earlier versions). Selectors are coupled to the class names of the plugins that render the widgets; if a renderer update renames its classes, the double tap comes back until the list is edited.

Removing a selector applies to newly rendered elements. Elements guarded before the removal keep their listeners until the note is reopened or the app restarts.

## Install

Via [BRAT](https://github.com/TfTHacker/obsidian42-brat): add `ddtam/obsidian-double-tap-guard` as a beta plugin. Releases carry `main.js`, `manifest.json` and `styles.css`.

## Release

`npm run brat:release -- <version> [--notes "..."]` bumps `manifest.json` and `versions.json`, verifies the artifacts, commits, pushes, and cuts a GitHub release with the artifacts attached. There is no build step; `main.js` is plain JavaScript at the repo root.
