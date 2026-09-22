import {App, Modal, Setting, Notice, TFile, TextComponent, ToggleComponent, DropdownComponent} from "obsidian";
import {TimelineIndex} from "./timeline-index";
import {TimelineEntry, TimelineRendererFormData, TIMELINE_CARD_LAYOUTS} from "./timeline-data";
import {DATE_FORMATS, TimelinePluginSettings} from "./settings";
import {Drop} from "esbuild";
import {text} from "node:stream/consumers";

export class AddTimelineEntryModal extends Modal {
    private data: TimelineEntry;
    private idTextComponent!: TextComponent;

    constructor(
        app: App,
        private index: TimelineIndex,
        private file: TFile,
        private onSubmit: (data: TimelineEntry) => void
    ) {
        super(app);
        // Pre-fill sensible defaults: title from the note's filename.
        this.data = {id: "", path: "", date: "", title: file.basename, description: "", picturePath: ""};
    }

    onOpen() {
        const {contentEl} = this;
        contentEl.createEl("h2", {text: "Add timeline entry"});

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

        new Setting(contentEl).setName("Path to picture").addSearch((search) => {
            search.onChange((value) => {
                this.data.picturePath = value;
            })
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
    private editMode: boolean = false;
    private data: TimelineRendererFormData;
    private idComponent!: TextComponent | DropdownComponent;
    private cardLayoutComponent!: DropdownComponent;
    private sortDescendingComponent!: ToggleComponent;
    private linkComponent!: ToggleComponent;
    private showDatesComponent!: ToggleComponent;
    private showDescriptionComponent!: ToggleComponent;
    private showPictureComponent!: ToggleComponent;

    constructor(
        app: App,
        private index: TimelineIndex,
        timelineConfig: TimelineRendererFormData | null,
        private onSubmit: (data: TimelineRendererFormData) => void
    ) {
        super(app);
        if (timelineConfig == null) {
            this.data = new TimelineRendererFormData();
        } else {
            this.data = timelineConfig;
            this.editMode = true;
        }
    }

    onOpen() {
        const {contentEl} = this;

        const existingIds:string[] = this.index.getAllTimelineIds();

        let disableModal = existingIds.length <= 0;

        if (disableModal) {
            //new Notice("Timeline ID, date, and title are required.");
            contentEl.createEl("h3", {text: "No Timeline entries with valid timeline IDs found."});
            contentEl.createEl("h3", {text: "Create new timeline entries either using the Command shortcut or adding the required frontmatter."});
            contentEl.createEl("h3", {text: "See README for more details."});
            return;
        }

        const idsOptions: Record<string, string> = {};

        for (const id of existingIds) {
            idsOptions[id] = id;
        }

        let headingText = this.editMode ? "Edit Timeline" : "Create Timeline";
        contentEl.createEl("h2", {text: headingText});

        // Timeline ID: text field + quick-pick dropdown of existing IDs.
        new Setting(contentEl)
            .setName("Timeline ID")
            .setDesc("Which timeline to render on this page?")
            .addDropdown((dropdown) => {
                this.idComponent = dropdown;
                this.data.id = existingIds[0];
                dropdown.addOptions(idsOptions).onChange((value) => {
                    this.data.id = value.trim();
                });
            }).setDisabled(disableModal);

        new Setting(contentEl)
            .setName("Timeline card layout")
            .addDropdown((dropdown) => {
                this.cardLayoutComponent = dropdown;
                dropdown.addOptions(TIMELINE_CARD_LAYOUTS).onChange((value) => {
                    this.data.layout = value.trim();
                });
            }).setDisabled(disableModal);

        new Setting(contentEl)
            .setName("Sort Timeline in descending order")
            .setDesc('Timelines are sorted in ascending order by default, from oldest to newest event.')
            .addToggle((toggle) => {
                this.sortDescendingComponent = toggle;
                toggle.setValue(this.data.sortDescending).onChange((value) => {
                    this.data.sortDescending = value;
                });
            }).setDisabled(disableModal);

        new Setting(contentEl)
            .setName("Link timeline title to the relevant note")
            .setDesc('By default timeline card titles act as links to the event note.')
            .addToggle((toggle) => {
                this.linkComponent = toggle;
                toggle.setValue(this.data.link).onChange((value) => {
                    this.data.link = value;
                });
            }).setDisabled(disableModal);

        new Setting(contentEl)
            .setName("Show dates")
            .setDesc('By default timeline cards include show dates.')
            .addToggle((toggle) => {
                this.showDatesComponent = toggle;
                toggle.setValue(this.data.showDate).onChange((value) => {
                    this.data.showDate = value;
                });
            }).setDisabled(disableModal);

        new Setting(contentEl)
            .setName("Show description")
            .setDesc('By default timeline cards show descriptions.')
            .addToggle((toggle) => {
                this.showDescriptionComponent = toggle;
                toggle.setValue(this.data.showDescription).onChange((value) => {
                    this.data.showDescription = value;
                });
            }).setDisabled(disableModal);

        new Setting(contentEl)
            .setName("Show picture")
            .setDesc('By default timeline cards show pictures.')
            .addToggle((toggle) => {
                this.showPictureComponent = toggle;
                toggle.setValue(this.data.showPicture).onChange((value) => {
                    this.data.showPicture = value;
                });
            }).setDisabled(disableModal);

        new Setting(contentEl).addButton((button) => {
            button
                .setButtonText("Done")
                .setCta()
                .onClick(() => {
                    if (!this.data.id) {
                        new Notice("Timeline ID is required.");
                        return;
                    }
                    this.onSubmit(this.data);
                    this.close();
                });
        }).setDisabled(disableModal);
    }

    onClose() {
        this.contentEl.empty();
    }
}
