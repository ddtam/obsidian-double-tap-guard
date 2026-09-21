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
// TAP_SLOP_PX from where it started. Stationary taps form a cluster
// while each lands within CLUSTER_MS and CLUSTER_RADIUS_PX of the
// one before it; the first tap of a cluster passes through and every
// follow-up is absorbed. Pair-wise absorption (0.3.x) leaked every
// odd-numbered tap of a fast burst on one spot, and two leaked taps
// still make a double tap upstream. Absorption is free for the
// widget, whose handlers run before the guard, so the cluster can be
// generous: the radius covers alternating between adjacent toolbar
// buttons, not just one spot.
const CLUSTER_MS = 600;
const TAP_SLOP_PX = 12;
const CLUSTER_RADIUS_PX = 60;

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
        const st = {
            start: null, moved: true, anchor: null,
            muteTouchend: false, muteClick: false,
        };
        // Pointer events fire before their touch counterparts and the
        // synthesized click fires last, so the absorb decision is made
        // once at pointerup and applied to all three end events of the
        // same tap. Which of the three Obsidian's gesture detector
        // actually counts is not observable from here, and 0.3.x
        // guarded touchend alone while the flip arrived anyway.
        el.addEventListener('pointerdown', (evt) => {
            if (!evt.isPrimary) return;
            st.start = { x: evt.clientX, y: evt.clientY };
            st.moved = false;
            st.muteTouchend = false;
            st.muteClick = false;
        }, { passive: true });
        el.addEventListener('pointermove', (evt) => {
            if (!evt.isPrimary || st.moved || !st.start) return;
            const p = { x: evt.clientX, y: evt.clientY };
            if (apart(p, st.start) > TAP_SLOP_PX) {
                st.moved = true;
            }
        }, { passive: true });
        el.addEventListener('pointercancel', () => {
            // The browser took the gesture over, usually for a scroll.
            st.moved = true;
            st.anchor = null;
        }, { passive: true });
        el.addEventListener('pointerup', (evt) => {
            if (!evt.isPrimary) return;
            if (st.moved || !st.start) {
                // A scroll or drag released over the widget. Let it
                // bubble, or the gesture tracking above is left
                // holding an unfinished touch. It also ends any tap
                // cluster.
                st.anchor = null;
                return;
            }
            const p = { x: evt.clientX, y: evt.clientY };
            const now = Date.now();
            const prev = st.anchor;
            // The anchor slides to the latest tap either way, so a
            // sustained burst stays one cluster however long it runs.
            st.anchor = { t: now, x: p.x, y: p.y };
            if (prev && now - prev.t < CLUSTER_MS
                    && apart(p, prev) < CLUSTER_RADIUS_PX) {
                evt.stopPropagation(); // follow-up tap in the cluster
                st.muteTouchend = true;
                st.muteClick = true;
            }
        });
        el.addEventListener('touchend', (evt) => {
            if (st.muteTouchend) {
                st.muteTouchend = false;
                evt.stopPropagation();
            }
        });
        el.addEventListener('click', (evt) => {
            if (st.muteClick) {
                st.muteClick = false;
                evt.stopPropagation();
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
