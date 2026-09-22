import { App, MarkdownRenderChild, moment } from "obsidian";
import { TimelineIndex } from "./timeline-index";
import TimelinePlugin from "./main";
import {
	TIMELINE_CARD_LAYOUTS,
	DATE_FORMATS
} from './settings';

export class TimelineRenderChild extends MarkdownRenderChild {
	// Paths that contributed to this timeline as of the last render.
	// Used to decide whether an incoming vault event is worth a re-render.
	private lastKnownPaths: Set<string> = new Set();

	constructor(
		containerEl: HTMLElement,
		private timelineId: string,
		private sortDesc: boolean = false,
		private link: boolean = true,
		private index: TimelineIndex,
		private app: App,
		private plugin: TimelinePlugin,
	) {
		super(containerEl);
	}

	onload() {
		this.render();

		// Note: the plugin's own index-maintenance listeners (registered in
		// main.ts's onload) run before these, since they were registered
		// first — so by the time these fire, `this.index` already reflects
		// the update.

		this.registerEvent(
			this.app.metadataCache.on("changed", (file) => {
				if (this.isRelevant(file.path)) this.render();
			})
		);

		this.registerEvent(
			this.app.vault.on("delete", (file) => {
				if (this.isRelevant(file.path)) this.render();
			})
		);

		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				if (this.isRelevant(oldPath) || this.isRelevant(file.path)) {
					this.render();
				}
			})
		);

		this.registerEvent((
			this.plugin.events.on("settings-updated", () => {this.render()})
		));

		this.registerEvent((
			this.plugin.events.on("rebuild-timeline", (timelineID: string) => {
				if (timelineID != this.timelineId )
					return;
				this.render();
			})
		));
	}

	/**
	 * A path is relevant if it currently contributes to this timeline,
	 * OR it did as of the last render (covers removal/deletion/move-away).
	 */
	private isRelevant(path: string): boolean {
		if (this.lastKnownPaths.has(path)) return true;
		return this.index.getEntries(this.timelineId).some((e) => e.path === path);
	}

	render() {
		this.containerEl.empty();
		const entries = this.index.getEntries(this.timelineId, this.sortDesc);
		this.lastKnownPaths = new Set(entries.map((e) => e.path));

		const wrapper = this.containerEl.createDiv({ cls: "timeline-render" });

		if (entries.length === 0) {
			wrapper.setText(`No entries found for timeline "${this.timelineId}".`);
			return;
		}

		for (const entry of entries) {
			const item = wrapper.createDiv({ cls: "timeline-entry" });

			let formattedDate = moment(entry.date, "YYYY-MM-DD").format(this.plugin.settings.dateFormat);

			const dateEl = createEl("div", { cls: "timeline-entry-date", text: formattedDate });

			let titleEl: HTMLDivElement | HTMLAnchorElement;

			if (this.link) {
				titleEl = createEl("a", {cls: "timeline-entry-title internal-link", text: entry.title});
				titleEl.href = entry.path;

				// Click to open the note
				this.registerDomEvent(titleEl, "click", (evt: MouseEvent) => {
					evt.preventDefault();
					this.plugin.app.workspace.openLinkText(
						entry.path,
						entry.path,
						evt.ctrlKey || evt.metaKey // open in new tab/pane if ctrl/cmd held
					);
				});

				// Hover preview
				this.registerDomEvent(titleEl, "mouseover", (evt: MouseEvent) => {
					this.plugin.app.workspace.trigger("hover-link", {
						event: evt,
						source: "timeline-view",
						hoverParent: item,
						targetEl: titleEl,
						linktext: entry.path,
					});
				});
			} else {
				titleEl = createEl("div", {cls: "timeline-entry-title", text: entry.title});
			}

			// Order the date/title based on plugin settings
			switch (this.plugin.settings.timelineCardLayout) {
				case TIMELINE_CARD_LAYOUTS["Date-First"]:
					item.appendChild(dateEl);
					item.appendChild(titleEl);
					break;
				case TIMELINE_CARD_LAYOUTS["Title-First"]:
					item.appendChild(titleEl);
					item.appendChild(dateEl);
					break;
			}

			if (entry.description) {
				item.createEl("div", {
					cls: "timeline-entry-description",
					text: entry.description,
				});
			}

		}
	}
}
