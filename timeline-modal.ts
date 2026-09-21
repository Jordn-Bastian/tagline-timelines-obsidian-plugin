import {App, Modal, Setting, Notice, TFile, TextComponent, ToggleComponent} from "obsidian";
import { TimelineIndex } from "./timeline-index";

export interface TimelineEntryFormData {
	id: string;
	date: string;
	title: string;
	description: string;
}

export interface TimelineRendererFormData {
	id: string;
	sortDesc: boolean;
	link: boolean;
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
	private sortDescComponent!: ToggleComponent;

	constructor(
		app: App,
		private index: TimelineIndex,
		private onSubmit: (data: TimelineRendererFormData) => void
	) {
		super(app);
		// Pre-fill sensible defaults: title from the note's filename.
		this.data = { id: "", sortDesc: false, link: true };
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
				this.sortDescComponent = toggle;
				toggle.setValue(false).onChange((value) => {
					this.data.sortDesc = value;
				});
			});

		new Setting(contentEl)
			.setName("Link timeline title to the relevant note")
			.setDesc('By default timeline card titles act as links to the event note.')
			.addToggle((toggle) => {
				this.sortDescComponent = toggle;
				toggle.setValue(false).onChange((value) => {
					this.data.sortDesc = value;
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
