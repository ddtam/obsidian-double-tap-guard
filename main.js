/* Double tap guard.
 *
 * On mobile, Obsidian's reading view treats a double tap as "switch
 * to editing", which fires constantly while tapping controls inside
 * an embedded interactive widget (a chess board, a rendered panel,
 * anything with its own tap targets). A widget's own listeners sit
 * on elements inside its wrapper and run first, so stopping the tap
 * events from bubbling out of the wrapper absorbs the gesture inside
 * the widget while leaving double-tap-to-edit working in the prose
 * around it.
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

const EVENTS = ['dblclick', 'touchend', 'pointerup'];

class TapGuard extends Plugin {
    async onload() {
        this.settings = Object.assign(
            {}, DEFAULT_SETTINGS, await this.loadData());
        this.addSettingTab(new TapGuardSettingTab(this.app, this));
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
            for (const type of EVENTS) {
                el.addEventListener(type,
                    (evt) => evt.stopPropagation());
            }
        });
    }

    async saveSettings() {
        await this.saveData(this.settings);
        this.arm();
    }

    onunload() {
        if (this.observer) this.observer.disconnect();
    }
}

class TapGuardSettingTab extends PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();
        new Setting(containerEl)
            .setName('Guarded selectors')
            .setDesc('One CSS selector per line. On mobile, taps '
                + 'inside matching elements stop bubbling to the '
                + 'reading view, so a double tap there cannot flip '
                + 'the note into edit mode. Removals apply to newly '
                + 'rendered elements; reopen the note to clear '
                + 'already guarded ones.')
            .addTextArea((t) => t
                .setValue(this.plugin.settings.selectors)
                .onChange(async (value) => {
                    this.plugin.settings.selectors = value;
                    await this.plugin.saveSettings();
                }));
    }
}

module.exports = TapGuard;
