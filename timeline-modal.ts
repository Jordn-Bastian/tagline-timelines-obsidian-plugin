import {App, Modal, Setting, Notice, TFile, TextComponent, ToggleComponent} from "obsidian";
import { TimelineIndex } from "./timeline-index";
import {DATE_FORMATS, TIMELINE_CARD_LAYOUTS, TimelinePluginSettings} from "./settings";

export interface TimelineEntryFormData {
	id: string;
	date: string;
	title: string;
	description: string;
}

export class TimelineRendererFormData {
	id: string;
	sortDescending: boolean;
	link: boolean;
	showDates: boolean;
	showDescription: boolean;

	constructor() {
		this.id = "";
		this.sortDescending = false;
		this.link = false;
		this.showDates = true;
		this.showDescription = true;
	}
}

export class AddTimelineEntryModal extends Modal {
	private data: TimelineEntryFormData;
	private idTextComponent!: TextComponent;

	constructor(
		app: App,
		private index: TimelineIndex,
		private file: TFile,
		private onSubmit: (data: TimelineEntryFormData) => void
	) {
		super(app);
		// Pre-fill sensible defaults: title from the note's filename.
		this.data = { id: "", date: "", title: file.basename, description: "" };
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl("h2", { text: "Add timeline entry" });

		const existingIds = this.index.getAllTimelineIds();

		// Timeline ID: text field + quick-pick dropdown of existing IDs.
		new Setting(contentEl)
			.setName("Timeline ID")
			.setDesc("Which timeline this event belongs to.")
			.addText((text) => {
				this.idTextComponent = text;
				text.setPlaceholder("e.g. roman-history").onChange((value) => {
					this.data.id = value.trim();
				});
			})
			.addDropdown((dropdown) => {
				dropdown.addOption("", "Pick existing…");
				for (const id of existingIds) {
					dropdown.addOption(id, id);
				}
				dropdown.onChange((value) => {
					if (!value) return;
					this.data.id = value;
					this.idTextComponent.setValue(value);
				});
			});

		new Setting(contentEl)
			.setName("Date")
			.addText((text) => {
				text.inputEl.type = "date";
				text.setValue(this.data.date ?? "");
				text.onChange((value) => {
					this.data.date = value;
				});
			});

		new Setting(contentEl).setName("Title").addText((text) => {
			text.setValue(this.data.title).onChange((value) => {
				this.data.title = value.trim();
			});
		});

		new Setting(contentEl).setName("Description").addTextArea((textarea) => {
			textarea.onChange((value) => {
				this.data.description = value.trim();
			});
			textarea.inputEl.rows = 3;
		});

		new Setting(contentEl).addButton((button) => {
			button
				.setButtonText("Add entry")
				.setCta()
				.onClick(() => {
					if (!this.data.id || !this.data.date || !this.data.title) {
						new Notice("Timeline ID, date, and title are required.");
						return;
					}
					this.onSubmit(this.data);
					this.close();
				});
		});
	}

	onClose() {
		this.contentEl.empty();
	}
}

export class AddTimelineRendererModal extends Modal {
	private data: TimelineRendererFormData;
	private idTextComponent!: TextComponent;
	private sortDescendingComponent!: ToggleComponent;
	private linkComponent!: ToggleComponent;
	private showDatesComponent!: ToggleComponent;
	private showDescriptionComponent!: ToggleComponent;

	constructor(
		app: App,
		private index: TimelineIndex,
		private onSubmit: (data: TimelineRendererFormData) => void
	) {
		super(app);
		// Pre-fill sensible defaults: title from the note's filename.
		this.data = new TimelineRendererFormData();
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl("h2", { text: "Add timeline renderer" });

		const existingIds = this.index.getAllTimelineIds();

		// Timeline ID: text field + quick-pick dropdown of existing IDs.
		new Setting(contentEl)
			.setName("Timeline ID")
			.setDesc("Which timeline to render on this page?")
			.addText((text) => {
				this.idTextComponent = text;
				text.setPlaceholder("e.g. roman-history").onChange((value) => {
					this.data.id = value.trim();
				});
			})
			.addDropdown((dropdown) => {
				dropdown.addOption("", "Pick existing…");
				for (const id of existingIds) {
					dropdown.addOption(id, id);
				}
				dropdown.onChange((value) => {
					if (!value) return;
					this.data.id = value.trim();
					this.idTextComponent.setValue(value);
				});
			});

		new Setting(contentEl)
			.setName("Sort Timeline in descending order")
			.setDesc('Timelines are sorted in ascending order by default, from oldest to newest event.')
			.addToggle((toggle) => {
				this.sortDescendingComponent = toggle;
				toggle.setValue(this.data.sortDescending).onChange((value) => {
					this.data.sortDescending = value;
				});
			});

		new Setting(contentEl)
			.setName("Link timeline title to the relevant note")
			.setDesc('By default timeline card titles act as links to the event note.')
			.addToggle((toggle) => {
				this.linkComponent = toggle;
				toggle.setValue(this.data.link).onChange((value) => {
					this.data.link = value;
				});
			});

		new Setting(contentEl)
			.setName("Show dates")
			.setDesc('By default timeline cards include show dates.')
			.addToggle((toggle) => {
				this.showDatesComponent = toggle;
				toggle.setValue(this.data.showDates).onChange((value) => {
					this.data.showDates = value;
				});
			});

		new Setting(contentEl)
			.setName("Show description")
			.setDesc('By default timeline cards include show descriptions.')
			.addToggle((toggle) => {
				this.showDescriptionComponent = toggle;
				toggle.setValue(this.data.showDescription).onChange((value) => {
					this.data.showDescription = value;
				});
			});

		new Setting(contentEl).addButton((button) => {
			button
				.setButtonText("Add Timeline Renderer")
				.setCta()
				.onClick(() => {
					if (!this.data.id) {
						new Notice("Timeline ID is required.");
						return;
					}
					this.onSubmit(this.data);
					this.close();
				});
		});
	}

	onClose() {
		this.contentEl.empty();
	}
}
