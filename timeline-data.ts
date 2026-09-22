export class TimelineRendererFormData {
    id: string;
    sortDescending: boolean;
    link: boolean;
    showDate: boolean;
    showDescription: boolean;

    constructor() {
        this.id = "";
        this.sortDescending = false;
        this.link = false;
        this.showDate = true;
        this.showDescription = true;
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
    path: string;
    date: string; // ISO-ish string, e.g. "2024-01-15"
    title: string;
    description: string;
}

export interface TimelineEntryFormData {
    id: string;
    date: string;
    title: string;
    description: string;
}