import {
    Plugin,
    TFile,
    Editor,
    Events,
    parseYaml,
    App,
    MarkdownView,
    CachedMetadata, EditorPosition, SectionCache, stringifyYaml
} from "obsidian";
import {TimelineIndex} from "./timeline-index";
import {TimelineRenderChild} from "./timeline-view";
import {AddTimelineEntryModal, AddTimelineRendererModal} from "./timeline-modal";
import {
    TIMELINE_CARD_LAYOUTS,
    TIMELINE_CODEBLOCK_KEYS,
    TIMELINE_ENTRY_KEYS,
    TimelineEntry,
    TimelineRendererFormData
} from "./timeline-data";
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

        this.registerMarkdownCodeBlockProcessor(TIMELINE_CODEBLOCK_KEYS.block_title, (source, el, ctx) => {
            const timelineConfig = parseYaml(source.trim());

            let configData = new TimelineRendererFormData();

            if (!configData.applyConfig(timelineConfig))
                return

            const child = new TimelineRenderChild(el, configData, this.index, this.app, ctx, this);
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

        /*this.addCommand({
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
        });*/

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
                    fm[TIMELINE_ENTRY_KEYS.id] = data.id;
                    fm[TIMELINE_ENTRY_KEYS.date] = data.date;
                    fm[TIMELINE_ENTRY_KEYS.title] = data.title;
                    fm[TIMELINE_ENTRY_KEYS.description] = data.description;
                    fm[TIMELINE_ENTRY_KEYS.picture_path] = data.picturePath;
                });
            }
        ).open();
    }

    public openAddRendererModal(file: TFile, timelineConfig: TimelineRendererFormData | null = null, cursorPos: EditorPosition | null = null,): void {
        new AddTimelineRendererModal(
            this.app,
            this.index,
            timelineConfig,
            async (data: TimelineRendererFormData, editMode:boolean) => {

                await this.upsertTimelineCodeBlock(this.app, file, data, editMode, cursorPos);
                this.events.trigger("rebuild-timeline", data.id);
            }
        ).open();
    }

    private getAllTimelineCodeBlockSections(file: TFile, cache: CachedMetadata | null): SectionCache[] {

        let sections: SectionCache[] = [];

        if (file.extension !== "md" || cache === null) {
            return sections;
        }

        if (!cache?.sections)
            return sections;

        for (const section of cache.sections) {
            if (section.type !== "code")
                continue;

            sections.push(section);
        }

        return sections;
    }

    private findMatchingTimelineCodeBlock(rendererID: string, sections: SectionCache[], editor: Editor) {

        for (const section of sections) {
            const firstLine = editor.getLine(section.position.start.line).trim();

            if (firstLine.startsWith(TIMELINE_CODEBLOCK_KEYS.block_title, 3)) {
                // convert this section to yaml

                const start = section.position.start.line + 1;
                const end = section.position.end.line - 1;

                if (end <= start)
                    continue;

                let lines: string[] = [];

                for (let i = start; i <= end; i++) {
                    lines.push(editor.getLine(i));
                }
                let joined = lines.join("\n").trim();

                if (joined.length === 0)
                    continue;

                let parsed = parseYaml(joined);

                if (parsed?.rendererID === rendererID) {
                    return section;
                }

            }
        }

        return null;
    }

    private getMatchingTimelineCodeBlock (rendererID: string, file: TFile, cache: CachedMetadata | null, editor: Editor) {
        const allTimelineCodeBlocks = this.getAllTimelineCodeBlockSections(file, cache);
        return this.findMatchingTimelineCodeBlock(rendererID, allTimelineCodeBlocks, editor);
    }

    async upsertTimelineCodeBlock(app: App, file: TFile, data: TimelineRendererFormData, editMode: boolean, cursorPos: EditorPosition | null = null): Promise<void> {

        const view = this.app.workspace.getActiveViewOfType(MarkdownView);

        if (!view)
            return;

        if(!view.editor)
            return;

        const cache = app.metadataCache.getFileCache(file);
        // if data is not null, we are updating an existing else we add a new by forcing null
        const timelineBlockSection = editMode ? this.getMatchingTimelineCodeBlock(data.rendererID, file, cache, view.editor) : null;

        const timelineCodeBlock = this.buildTimelineCodeBlock(data).split("\n");

        await app.vault.process(file, (content) => {
            const lines = content.split("\n");

            let before: string[];
            let after: string[];

            if (timelineBlockSection != null) {
                before = lines.slice(0, timelineBlockSection.position.start.line);
                after = lines.slice(timelineBlockSection.position.end.line + 1);
            } else {
                let insertAt = 0;

                if(cursorPos != null) {
                    insertAt = cursorPos.line + 1;
                } else if (cache?.frontmatterPosition){
                    insertAt = cache.frontmatterPosition.end.line + 1;
                }

                const needsLeadingBlank = insertAt > 0 && lines[insertAt - 1]?.trim() !== "";

                before = [...lines.slice(0, insertAt), ...(needsLeadingBlank ? [""] : [])];
                after = ["", ...lines.slice(insertAt)];
            }

            return [...before, ...timelineCodeBlock, ...after].join("\n");
        });
    }

/*    private buildTimelineCodeBlock(data: TimelineRendererFormData): string {
        return "```render-timeline\n" +
            "id: " + data.id + "\n" +
            "layout: " + data.layout + "\n" +
            "sortDescending: " + data.sortDescending + "\n" +
            "link: " + data.link + "\n" +
            "showDate: " + data.showDate + "\n" +
            "showDescription: " + data.showDescription + "\n" +
            "showPicture: " + data.showPicture + "\n" +
            "rendererID: " + data.rendererID + "\n" +
            "accentColour: " + data.accentColour + "\n" +
            "```";
    }*/

    private buildTimelineCodeBlock(data: TimelineRendererFormData): string {
        return "```"+TIMELINE_CODEBLOCK_KEYS.block_title+"\n" + stringifyYaml(data) + "```";
    }

}
