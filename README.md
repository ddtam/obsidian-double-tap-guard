# Double Tap Guard

An Obsidian plugin that stops the mobile double-tap-to-edit gesture from firing inside configured elements, so tapping through the controls of an embedded interactive widget, such as a chess board rendered by another plugin, never flips the note into edit mode. A double tap on the prose around the widget still opens the editor. The plugin does nothing on desktop.

## The three mechanisms

Obsidian mobile's reading view switches to editing on a double tap, counted from `pointerup` events. The guard handles the gesture differently depending on where the tap lands, because the safe intervention differs by region.

- **Absorb** (guarded wrappers, outside excluded regions): consecutive stationary taps form a cluster with a sliding anchor. The first tap of a cluster passes through; every follow-up landing within 600 ms and 60 px of the previous one has its `pointerup`, paired `touchend` and synthesized `click` stopped at the wrapper. The widget's own handlers sit below the wrapper and have already run, so an absorbed tap still presses its button. The reading view receives at most one tap per cluster and cannot assemble a double tap at any tapping rate. Releases that moved more than 12 px are scrolls and always pass through.
- **Default-prevent** (excluded regions): widgets that complete interactions through document-level listeners, chessground boards among them, lose the interaction itself if their end events are stopped at the wrapper. Taps there are never stopped; instead a cluster-follower tap is default-prevented. The flag travels with the event, the widget's document-level listeners still run, and the gesture detector skips flagged events, so the double tap is prevented with no effect on the widget.
- **Revert** (backstop): a single tap cannot switch the view mode on its own, so an edit-mode flip landing within 300 ms of a tap in an excluded region is by construction a widget double tap. The guard flips the view back to reading, dismisses the keyboard, and masks the container while it does. With the detector respecting `defaultPrevented` this path is dormant; it exists in case a platform change stops it being respected.

## Settings

- **Guarded selectors**: one CSS selector per line naming the wrappers to guard. Defaults cover the [Chess Tree](https://github.com/west-shell/obsidian-chess-tree) plugin's embed wrappers (`.ct-block` for 2.10 and later, `.tree-codeblock` for earlier versions).
- **Excluded selectors**: regions inside guarded wrappers whose taps are default-prevented rather than stopped. Default covers chessground boards (`.cg-wrap`).
- **Flash on absorbed taps**: debug aid; flashes a guarded element orange each time a tap inside it is absorbed, so an intermittently dropped widget interaction shows at a glance whether the guard was involved.

Selectors are coupled to the class names of the plugins that render the widgets. A renderer update that renames its classes brings the double tap back until the lists are edited. Removing a selector applies to newly rendered elements; already guarded ones keep their listeners until the note is reopened.

## Install

Via [BRAT](https://github.com/TfTHacker/obsidian42-brat): add `ddtam/obsidian-double-tap-guard` as a beta plugin. Releases carry `main.js`, `manifest.json` and `styles.css`.

## Release

`npm run brat:release -- <version> [--notes "..."]` bumps `manifest.json` and `versions.json`, verifies the artifacts, commits, pushes, and cuts a GitHub release with the artifacts attached. There is no build step; `main.js` is plain JavaScript at the repo root.
