import { Plugin, TFile, Editor, Events } from "obsidian";
import {TimelineEntry, TimelineIndex} from "./timeline-index";
import { TimelineRenderChild } from "./timeline-view";
import {
	AddTimelineEntryModal,
	AddTimelineRendererModal,
	TimelineEntryFormData,
	TimelineRendererFormData
} from "./timeline-modal";
import {
	DEFAULT_SETTINGS,
	TimelinePluginSettings,
	TimelinePluginSettingsTab,
} from './settings';

export default class TimelinePlugin extends Plugin {
	index!: TimelineIndex;
	settings!: TimelinePluginSettings;
	events = new Events();

	async onload() {
		await this.loadSettings();

		this.index = new TimelineIndex(this.app);

		// Build the index once the vault's initial metadata resolution is done.
		this.registerEvent(
			this.app.metadataCache.on("resolved", () => {
				this.index.buildInitialIndex();
			})
		);

		this.registerEvent(
			this.app.metadataCache.on("changed", (file, _data, cache) => {
				this.index.handleFileChanged(file, cache);
			})
		);

		this.registerEvent(
			this.app.vault.on("delete", (file) => {
				this.index.handleFileDeleted(file.path);
			})
		);

		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				this.index.handleFileRenamed(oldPath, file.path);
			})
		);

		this.registerMarkdownCodeBlockProcessor("render-timeline", (source, el, ctx) => {
			const timelineConfig = source.trim();

			let id = "";
			let sortDesc = false;

			switch(timelineConfig.search("sortDesc:")) {
				case -1:
					// no sort config present
					id = timelineConfig.slice(timelineConfig.indexOf("id:")+3, timelineConfig.length).trim();
					break;
				default:
					id = timelineConfig.slice(timelineConfig.indexOf("id:")+3, timelineConfig.indexOf("sortDesc:")).trim();
					sortDesc = timelineConfig.slice(timelineConfig.indexOf("sortDesc:")+9, timelineConfig.length) === "true";
					break;
			}

			const child = new TimelineRenderChild(el, id, sortDesc, this.index, this.app, this);
			ctx.addChild(child);
		});

		this.addCommand({
			id: "add-timeline-entry",
			name: "Add timeline entry to current note",
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (!(file instanceof TFile) || file.extension !== "md") {
					return false;
				}
				if (!checking) {
					this.openAddEntryModal(file);
				}
				return true;
			},
		});

		this.addCommand({
			id: "add-timeline-renderer",
			name: "Add timeline renderer to current note",
			editorCheckCallback: (checking, editor) => {
				const file = this.app.workspace.getActiveFile();
				if (!(file instanceof TFile) || file.extension !== "md") {
					return false;
				}

				if (!checking) {
					this.openAddRendererModal(editor);
				}
				return true;
			},
		});

		this.addCommand({
			id: "force-rebuild-timeline",
			name: "Force any timelines on the currently active note to be rebuilt",
			// callback: () => {
			// 	this.events.trigger("rebuild-timeline");
			// },
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (!(file instanceof TFile) || file.extension !== "md") {
					return false;
				}
				if (!checking) {

					//get timelineID in this file
					const timelineID = this.index.getTimelineIDFromFile(file);
					if(timelineID != undefined) {
						this.events.trigger("rebuild-timeline", timelineID);
					}
				}
				return true;
			},
		});

		this.addSettingTab(new TimelinePluginSettingsTab(this.app, this));
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<TimelinePluginSettings>,
		);
		this.events.trigger("settings-updated");
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.events.trigger("settings-updated");
	}

	private openAddEntryModal(file: TFile) {
		new AddTimelineEntryModal(
			this.app,
			this.index,
			file,
			async (data: TimelineEntryFormData) => {
				await this.app.fileManager.processFrontMatter(file, (fm) => {
					fm["timeline-id"] = data.id;
					fm["timeline-date"] = data.date;
					fm["timeline-title"] = data.title;
					fm["timeline-description"] = data.description;
				});
				// No manual index update needed here: writing frontmatter
				// triggers vault modify -> metadataCache 'changed', which our
				// existing handler already uses to keep the index in sync.
			}
		).open();
	}

	private openAddRendererModal(editor: Editor) {
		new AddTimelineRendererModal(
			this.app,
			this.index,
			async (data: TimelineRendererFormData) => {
				editor.setCursor(0);
				editor.replaceRange(
					"```render-timeline\n" +
					"id:" + data.id + "\n" +
					"sortDesc:" + data.sortDesc +"\n" +
					"```"
					,editor.getCursor()
				);


			}
		).open();
	}

}
