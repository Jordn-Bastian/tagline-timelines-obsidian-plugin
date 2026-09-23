import {
    Plugin,
    TFile,
    Editor,
    Events,
    parseYaml,
    App,
    MarkdownView,
    View,
    getIcon,
    MetadataCache,
    CachedMetadata, EditorPosition
} from "obsidian";
import {TimelineIndex} from "./timeline-index";
import {TimelineRenderChild} from "./timeline-view";
import {AddTimelineEntryModal, AddTimelineRendererModal} from "./timeline-modal";
import {TimelineEntry, TimelineRendererFormData} from "./timeline-data";
import {DEFAULT_SETTINGS, TimelinePluginSettings, TimelinePluginSettingsTab} from './settings';

export default class TimelinePlugin extends Plugin {
    index!: TimelineIndex;
    settings!: TimelinePluginSettings;
    events = new Events();
    hasInitialized = false;

    async onload() {
        await this.loadSettings();

        this.index = new TimelineIndex(this.app);

        // Build the index once the vault's initial metadata resolution is done.
        // TODO STOP THIS FROM RUNNING ALL THE TIME!
        // TODO check when we are getting all entries on load,
        // look into storing this somehow in the note so we don't have to store it in memeory?
        // Think maybe we need to run this on the vault load

        this.app.workspace.onLayoutReady(() => {
            if (!this.hasInitialized) {
                this.index.buildInitialIndex();
                this.hasInitialized = true;
            }
        });

        // this.registerEvent(
        //     this.app.metadataCache.on("resolved", () => {
        //         this.index.buildInitialIndex();
        //     })
        // );

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
            const timelineConfig = parseYaml(source.trim());

            let configData = new TimelineRendererFormData();

            if (!configData.applyConfig(timelineConfig))
                return

            const child = new TimelineRenderChild(el, configData, this.index, this.app, this);
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
            checkCallback: (checking) => {
                const view = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (!view || view.file?.extension !== "md")
                    return false;

                if (!checking) {
                    this.openAddRendererModal(view.file, null, view.editor.getCursor());
                }
                return true;
            },
        });

        this.addCommand({
            id: "edit-timeline-renderer",
            name: "Edit timeline renderer in current note",
            checkCallback: (checking) => {
                const view = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (!view || view.file?.extension !== "md")
                    return false;

                if (!checking) {
                    // Check if the timeline renderer code block is present
                    let timelineConfig = this.getExistingTimelineCodeBlockAsData(this.app, view.file, view.editor);
                    this.openAddRendererModal(view.file, timelineConfig, view.editor.getCursor());
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
                    if (timelineID != undefined) {
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
            async (data: TimelineEntry) => {
                await this.app.fileManager.processFrontMatter(file, (fm) => {
                    fm["timeline-id"] = data.id;
                    fm["timeline-date"] = data.date;
                    fm["timeline-title"] = data.title;
                    fm["timeline-description"] = data.description;
                    fm["timeline-picture-path"] = data.picturePath;
                });
                // No manual index update needed here: writing frontmatter
                // triggers vault modify -> metadataCache 'changed', which our
                // existing handler already uses to keep the index in sync.
            }
        ).open();
    }

    private openAddRendererModal(file: TFile, timelineConfig: TimelineRendererFormData | null = null, cursorPos: EditorPosition | null = null): void {
        new AddTimelineRendererModal(
            this.app,
            this.index,
            timelineConfig,
            async (data: TimelineRendererFormData) => {

                await this.upsertTimelineCodeBlock(this.app, file, data, cursorPos);
                // //await this.ensureEditingMode(view);
                // const editor = view.editor;
                // //editor.setCursor(0);
                // editor.replaceRange(
                //     "```render-timeline\n" +
                //     "id: " + data.id + "\n" +
                //     "sortDescending: " + data.sortDescending + "\n" +
                //     "link: " + data.link + "\n" +
                //     "showDate: " + data.showDate + "\n" +
                //     "showDescription: " + data.showDescription + "\n" +
                //     "showPicture: " + data.showPicture + "\n" +
                //     "```"
                //     , editor.getCursor()
                // );
                this.events.trigger("rebuild-timeline", data.id);
            }
        ).open();
    }

    private getExistingTimelineCodeBlockSection(file: TFile, cache: CachedMetadata | null) {

        if (file.extension !== "md" || cache === null) {
            return null;
        }

        if (!cache?.sections)
            return null;

        for (const section of cache.sections) {
            if (section.type !== "code")
                continue;

            return {start: section.position.start.line, end: section.position.end.line};
        }

        return null;
    }

    private getExistingTimelineCodeBlockAsData(app: App, file: TFile, editor: Editor) {
        const cache = app.metadataCache.getFileCache(file);
        const timelineBlockSection = this.getExistingTimelineCodeBlockSection(file, cache);

        if (timelineBlockSection == null) {
            return null
        }

        const firstLine = editor.getLine(timelineBlockSection.start).trim();

        if (firstLine.startsWith("render-timeline", 3)) {
            // convert this section to yaml

            const start = timelineBlockSection.start + 1;
            const end = timelineBlockSection.end - 1;

            if (end <= start)
                return null;

            let lines: string[] = [];

            for (let i = start; i <= end; i++) {
                lines.push(editor.getLine(i));
            }

            let joined = lines.join("\n").trim();

            if (joined.length === 0)
                return null;

            let parsed = parseYaml(joined);

            let configData = new TimelineRendererFormData();

            return configData.applyConfig(parsed) ? configData : null;
        }

        return null;

    }

    async upsertTimelineCodeBlock(app: App, file: TFile, data: TimelineRendererFormData, cursorPos: EditorPosition | null = null ): Promise<void> {

        const cache = app.metadataCache.getFileCache(file);
        const timelineBlockSection = this.getExistingTimelineCodeBlockSection(file, cache);

        const timelineCodeBlock = this.buildTimelineCodeBlock(data).split("\n");

        await app.vault.process(file, (content) => {
            const lines = content.split("\n");

            let before: string[];
            let after: string[];

            if (timelineBlockSection != null) {
                before = lines.slice(0, timelineBlockSection.start);
                after = lines.slice(timelineBlockSection.end + 1);
            } else {
                let insertAt = 0;

                if(cursorPos != null) {
                    insertAt = cursorPos.line;
                } else if (cache?.frontmatterPosition){
                    insertAt = cache.frontmatterPosition.end.line + 1;
                }

                const needsLeadingBlank = insertAt > 0 && lines[insertAt - 1]?.trim() !== "";

                before = [...lines.slice(0, insertAt), ...(needsLeadingBlank ? [""] : [])];
                after = ["", ...lines.slice(insertAt)];
            }
            return [...before, ...timelineCodeBlock, ...after].join("\n")
        });
    }

    private buildTimelineCodeBlock(data: TimelineRendererFormData): string {
        return "```render-timeline\n" +
            "id: " + data.id + "\n" +
            "sortDescending: " + data.sortDescending + "\n" +
            "link: " + data.link + "\n" +
            "showDate: " + data.showDate + "\n" +
            "showDescription: " + data.showDescription + "\n" +
            "showPicture: " + data.showPicture + "\n" +
            "```";
    }

}
