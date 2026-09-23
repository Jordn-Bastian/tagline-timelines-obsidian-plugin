import {AbstractInputSuggest, App, FrontMatterCache, TFile} from "obsidian";

export class TimelineRendererFormData {
    id: string;
    sortDescending: boolean;
    link: boolean;
    showDate: boolean;
    showDescription: boolean;
    showPicture: boolean;
    layout: string;
    rendererID: string;
    accentColour: string;

    constructor() {
        this.id = "";
        this.sortDescending = false;
        this.link = true;
        this.showDate = true;
        this.showDescription = true;
        this.showPicture = true;
        this.layout = TIMELINE_CARD_LAYOUTS["Title-First"];
        this.rendererID = generateShortId();
        this.accentColour = getAccentColor();
    }

    applyConfig(source: Record<string, string | boolean>) {
        for (const key of Object.keys(this) as (keyof this)[]) {
            if (Object.prototype.hasOwnProperty.call(source, key)) {

                const value = source[key as string];

                if (key === "id" && (typeof value !== "string" || value.length === 0)) {
                    return false;
                }

                this[key] = value as this[typeof key];
            }
        }

        return typeof this.id === "string" && this.id.length > 0;
    }

}

export function generateShortId(): string {
    return Math.random().toString(36).slice(2, 10); // e.g. "k3j9f2la"
}

export class TimelineEntry {
    id: string;
    path: string;
    date: string; // ISO-ish string, e.g. "2024-01-15"
    title: string;
    description: string;
    picturePath: string;

    constructor(data: {
        id: string,
        path: string,
        date: string,
        title: string,
        description: string,
        picturePath: string
    }) {
        this.id = data.id;
        this.path = data.path;
        this.date = data.date;
        this.title = data.title;
        this.description = data.description;
        this.picturePath = data.picturePath;
    }

    static constructFromFrontMatter(fm: FrontMatterCache, file:TFile) {
        const data = {
            id: fm["timeline-id"],
            path: file.path,
            date: String(fm?.["timeline-date"] ?? ""),
            title: fm?.["timeline-title"] ?? file.basename,
            description: fm?.["timeline-description"] ?? "",
            picturePath: fm?.["timeline-picture-path"] ?? ""
        };

        return new TimelineEntry(data);
    }

    compare(other: TimelineEntry) {
        return other.id === this.id
            && other.path === this.path
            && other.date === this.date
            && other.title === this.title
            && other.description === this.description
            && other.picturePath === this.picturePath;
    }
}

export const TIMELINE_CARD_LAYOUTS = {

    "Title-First" : "Title-First",
    "Date-First" : "Date-First"
};

export const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "bmp", "svg", "webp"];

export class ImagePathSuggestions extends AbstractInputSuggest<TFile> {
    constructor(
        app: App,
        private inputEl: HTMLInputElement,
        private onPick: (value: TFile) => void,
    ) {
        super(app, inputEl);
        this.onSelect((file, evt) => {
            this.inputEl.value = file.path;
            this.inputEl.trigger("input");
            this.onPick(file);
            this.close();
        });
    }

    protected getSuggestions(query: string): TFile[] {
        const q = query.toLowerCase();
        return this.app.vault
            .getFiles()
            .filter((f) => IMAGE_EXTENSIONS.includes(f.extension.toLowerCase()))
            .filter((f) => f.path.toLowerCase().includes(q));
    }

    renderSuggestion(file: TFile, el: HTMLElement) {
        el.setText(file.path);
    }
}

export function getAccentColor(): string {
    return getComputedStyle(document.body).getPropertyValue("--interactive-accent").trim();
}