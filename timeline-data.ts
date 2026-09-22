export class TimelineRendererFormData {
    id: string;
    sortDescending: boolean;
    link: boolean;
    showDate: boolean;
    showDescription: boolean;
    showPicture: boolean;
    layout: string;

    constructor() {
        this.id = "";
        this.sortDescending = false;
        this.link = true;
        this.showDate = true;
        this.showDescription = true;
        this.showPicture = true;
        this.layout = TIMELINE_CARD_LAYOUTS["Title-First"];
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

export interface TimelineEntry {
    id: string;
    path: string;
    date: string; // ISO-ish string, e.g. "2024-01-15"
    title: string;
    description: string;
    picturePath: string;
}

export const TIMELINE_CARD_LAYOUTS = {

    "Title-First" : "Title-First",
    "Date-First" : "Date-First"
};