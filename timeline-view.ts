import { App, MarkdownRenderChild, moment } from "obsidian";
import { TimelineIndex } from "./timeline-index";
import TimelinePlugin from "./main";
import { TIMELINE_CARD_LAYOUTS, DATE_FORMATS } from './settings';
import {TimelineRendererFormData} from "./timeline-data";

export class TimelineRenderChild extends MarkdownRenderChild {
	// Paths that contributed to this timeline as of the last render.
	// Used to decide whether an incoming vault event is worth a re-render.
	private lastKnownPaths: Set<string> = new Set();

	constructor(
		containerEl: HTMLElement,
		private config : TimelineRendererFormData,
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
				if (timelineID != this.config.id )
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
		return this.index.getEntries(this.config.id).some((e) => e.path === path);
	}

	render() {
		this.containerEl.empty();
		const entries = this.index.getEntries(this.config.id, this.config.sortDescending);
		this.lastKnownPaths = new Set(entries.map((e) => e.path));

		const wrapper = this.containerEl.createDiv({ cls: "timeline-render" });

		if (entries.length === 0) {
			wrapper.setText(`No entries found for timeline "${this.config.id}".`);
			return;
		}

		for (const entry of entries) {
			const newCard = new TimelineEntryCard();

			let titleEl: HTMLDivElement | HTMLAnchorElement;

			let formattedDate = moment(entry.date, "YYYY-MM-DD").format(this.plugin.settings.dateFormat);

			let dateEl: HTMLDivElement | null = null;

			let descriptionEl: HTMLDivElement | null = null;

			let pictureEl: HTMLDivElement | null = null;

			if (this.config.showDate) {
				dateEl = createEl("div", { cls: "timeline-entry-date", text: formattedDate });
			}

			if (this.config.link) {
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
						hoverParent: newCard,
						targetEl: titleEl,
						linktext: entry.path,
					});
				});
			} else {
				titleEl = createEl("div", {cls: "timeline-entry-title", text: entry.title});
			}

			if (entry.description && this.config.showDescription) {
				descriptionEl = createEl("div", {
					cls: "timeline-entry-description",
					text: entry.description,
				});
			}

			// Order elements
			switch (this.plugin.settings.timelineCardLayout) {
				case TIMELINE_CARD_LAYOUTS["Title-First"]:
					newCard.firstEl.appendChild(titleEl);
					if (this.config.showDate && dateEl) {
						newCard.secondEl.appendChild(dateEl);
					}
					break;
				case TIMELINE_CARD_LAYOUTS["Date-First"]:
					if (this.config.showDate && dateEl) {
						newCard.firstEl.appendChild(dateEl);
					}
					newCard.secondEl.appendChild(titleEl);
					break;
			}

			if (this.config.showDescription && descriptionEl) {
				newCard.thirdEl.appendChild(descriptionEl);
			}
			if (this.config.showPicture && pictureEl) {
				newCard.pictureEl.appendChild(pictureEl);
			}

			wrapper.appendChild(newCard.parent);
		}
	}
}

class TimelineEntryCard {
	parent: HTMLDivElement;
	firstEl: HTMLDivElement | HTMLAnchorElement;
	secondEl: HTMLDivElement | HTMLAnchorElement;
	thirdEl: HTMLDivElement;
	pictureEl: HTMLDivElement;


	// TODO Add grad layout
	constructor() {
		this.parent = createDiv({ cls: "timeline-entry" });
		this.firstEl = this.parent.createDiv();
		this.secondEl = this.parent.createDiv();
		this.thirdEl = this.parent.createDiv();
		this.pictureEl = this.parent.createDiv();
	}
}
