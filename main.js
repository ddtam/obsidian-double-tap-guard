/* Double tap guard.
 *
 * On mobile, Obsidian's reading view treats a double tap as "switch
 * to editing", which fires constantly while tapping controls inside
 * an embedded interactive widget (a chess board, a rendered panel,
 * anything with its own tap targets). A widget's own listeners sit
 * on elements inside its wrapper and run first, so stopping the
 * gesture-completing event from bubbling out of the wrapper absorbs
 * the gesture inside the widget while leaving double-tap-to-edit
 * working in the prose around it.
 *
 * Only the touchend that completes a stationary double tap is
 * stopped. A release after movement is a scroll ending over the
 * widget and must pass through: swallowing those (as 0.2.x did)
 * leaves Obsidian's gesture tracking mid-touch and eats every tap
 * that follows. A single stationary tap also passes through, since
 * only the double tap does anything at the reading-view level.
 *
 * Which wrappers are guarded is a settings list of CSS selectors,
 * one per line. Selectors are coupled to the plugins that render the
 * widgets; a renderer update that renames its classes shows up as
 * the double tap coming back, and the fix is editing the list.
 *
 * Removing a selector takes effect for newly rendered elements;
 * already guarded ones keep their listeners until the note is
 * reopened or the app restarts.
 */
const {
    Plugin, PluginSettingTab, Setting, Platform,
} = require('obsidian');

const DEFAULT_SETTINGS = {
    selectors: '.ct-block\n.tree-codeblock',
};

// A release counts as a tap only if the touch moved less than
// TAP_SLOP_PX from where it started. Two taps form a double tap when
// the second ends within DOUBLE_TAP_MS of the first and within
// PAIR_RADIUS_PX of it. The radius is deliberately tighter than a
// board square, so tapping a piece and then a nearby destination
// square in quick succession is never misread as a double tap;
// the edit gesture is two taps on the same spot.
const DOUBLE_TAP_MS = 400;
const TAP_SLOP_PX = 12;
const PAIR_RADIUS_PX = 20;

function touchPoint(evt) {
    const t = (evt.changedTouches && evt.changedTouches[0]) || evt;
    return { x: t.clientX, y: t.clientY };
}

function apart(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

class DoubleTapGuard extends Plugin {
    async onload() {
        this.settings = Object.assign(
            {}, DEFAULT_SETTINGS, await this.loadData());
        this.addSettingTab(new DoubleTapGuardSettingTab(this.app, this));
        if (!Platform.isMobile) return;
        this.observer = new MutationObserver(() => this.arm());
        this.observer.observe(document.body,
            { childList: true, subtree: true });
        this.arm();
    }

    selector() {
        return this.settings.selectors
            .split('\n').map((s) => s.trim()).filter(Boolean)
            .join(', ');
    }

    arm() {
        const sel = this.selector();
        if (!sel) return;
        let nodes;
        try {
            nodes = document.querySelectorAll(sel);
        } catch (e) {
            return; // invalid selector in settings; guard nothing
        }
        nodes.forEach((el) => {
            if (el.dataset.tapGuard) return;
            el.dataset.tapGuard = '1';
            this.guard(el);
        });
    }

    guard(el) {
        const st = { start: null, moved: true, lastTap: null };
        el.addEventListener('touchstart', (evt) => {
            st.start = touchPoint(evt);
            st.moved = false;
        }, { passive: true });
        el.addEventListener('touchmove', (evt) => {
            if (st.moved || !st.start) return;
            if (apart(touchPoint(evt), st.start) > TAP_SLOP_PX) {
                st.moved = true;
            }
        }, { passive: true });
        el.addEventListener('touchend', (evt) => {
            if (st.moved || !st.start) {
                // A scroll or drag released over the widget. Let it
                // bubble, or the gesture tracking above is left
                // holding an unfinished touch.
                st.lastTap = null;
                return;
            }
            const p = touchPoint(evt);
            const now = Date.now();
            const prev = st.lastTap;
            if (prev && now - prev.t < DOUBLE_TAP_MS
                    && apart(p, prev) < PAIR_RADIUS_PX) {
                evt.stopPropagation(); // second tap: absorb the gesture
                st.lastTap = null;
            } else {
                st.lastTap = { t: now, x: p.x, y: p.y };
            }
        });
        // dblclick only fires on a completed double click, so it is
        // always safe to contain inside the widget.
        el.addEventListener('dblclick', (evt) => evt.stopPropagation());
    }

    async saveSettings() {
        await this.saveData(this.settings);
        this.arm();
    }

    onunload() {
        if (this.observer) this.observer.disconnect();
    }
}

class DoubleTapGuardSettingTab extends PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();
        new Setting(containerEl)
            .setName('Guarded selectors')
            .setDesc('One CSS selector per line. On mobile, a double '
                + 'tap inside matching elements stops bubbling to the '
                + 'reading view, so it cannot flip the note into edit '
                + 'mode. Scrolls and single taps pass through. '
                + 'Removals apply to newly rendered elements; reopen '
                + 'the note to clear already guarded ones.')
            .addTextArea((t) => t
                .setValue(this.plugin.settings.selectors)
                .onChange(async (value) => {
                    this.plugin.settings.selectors = value;
                    await this.plugin.saveSettings();
                }));
    }
}

module.exports = DoubleTapGuard;
