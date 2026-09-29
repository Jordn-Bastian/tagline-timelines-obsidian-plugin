import {App, TFile, CachedMetadata} from "obsidian";
import {TimelineEntry} from "./timeline-data";

export class TimelineIndex {
	private byId: Map<string, TimelineEntry[]> = new Map();
	private byPath: Map<string, string> = new Map(); // filePath -> timelineID

	constructor(private app: App) {}

	/** One-time build, called after the initial vault-wide cache resolves. */
	buildInitialIndex(): void {
		for (const file of this.app.vault.getMarkdownFiles()) {
			this.upsertFromCache(file);
		}
	}

	/** Called on metadataCache 'changed'. */
	handleFileChanged(file: TFile, cache: CachedMetadata | null): void {
		const fm = cache?.frontmatter ? cache.frontmatter : this.getFrontMatter(file);
		const id = fm?.["timeline-id"] as string | undefined;
		if (id !== undefined && fm !== undefined) {

			const newEntry = TimelineEntry.constructFromFrontMatter(fm, file);

			if (this.timelineEntryHasUpdated(newEntry)) {
				this.upsertFromCache(file, cache);
			}
		}
	}

	/** Called on vault 'delete'. */
	handleFileDeleted(path: string): void {
		this.removeExisting(path);
	}

	/** Called on vault 'rename'. Content is unchanged, only the path key moves. */
	handleFileRenamed(oldPath: string, newPath: string): void {
		const id = this.byPath.get(oldPath);
		if (!id) return;
		const entries = this.byId.get(id);
		const entry = entries?.find((e) => e.path === oldPath);
		if (entry) entry.path = newPath;
		this.byPath.delete(oldPath);
		this.byPath.set(newPath, id);
	}

	getEntries(timelineId: string, sortDesc: boolean = false): TimelineEntry[] {

		let entries: TimelineEntry[] = this.byId.get(timelineId) ?? [];
		return this.sortTimelineEntries(entries, sortDesc);
	}

	getAllTimelineIds(): string[] {
		return Array.from(this.byId.keys()).sort();
	}

	private getFrontMatter(file: TFile) {
		const cache = this.app.metadataCache.getFileCache(file);
		return cache?.frontmatter;
	}

	public getTimelineIDFromFile(file: TFile) {
		const fm = this.getFrontMatter(file);
		return fm?.["timeline-id"] as string | undefined;
	}

	// --- internals ---

	private timelineEntryHasUpdated(newEntry: TimelineEntry): boolean {
		let allEntries = this.byId.get(newEntry.id);

		if (allEntries !== undefined) {
			// compare each entry to see if we already have an exact match
			allEntries.forEach((entry) => {
				if (entry.compare(newEntry)) {
					return false;
				}
			})
		}
		// if all entries is undefined then there is no timeline currently store with a matching id
		// if no match is found, then we have a new entry to add
		return true
	}

	private upsertFromCache(file: TFile, cache: CachedMetadata | null = null): void {
		const fm = cache?.frontmatter ? cache.frontmatter : this.getFrontMatter(file);
		const newId = fm?.["timeline-id"] as string | undefined;

		// Always drop any existing entry for this path first — handles the
		// case where timeline-id changed or was removed entirely.
		this.removeExisting(file.path);

		if (!newId || fm === undefined) { // no timelineID
			return;
		}

		const entry: TimelineEntry = TimelineEntry.constructFromFrontMatter(fm, file);

		let list = this.byId.get(newId) ?? [];
		list.push(entry);
		//list.sort((a, b) =>  {return new Date(a.date).getTime() - new Date(b.date).getTime();});
		list = this.sortTimelineEntries(list);
		this.byId.set(newId, list);
		this.byPath.set(file.path, newId);
	}

	private sortTimelineEntries(list: TimelineEntry[], desc: boolean = false): TimelineEntry[] {
		if (desc) {
			return list.sort((a, b) =>  {return this.getSortableDate(b.date) - this.getSortableDate(a.date);});
		}
		return list.sort((a, b) =>  {return this.getSortableDate(a.date) - this.getSortableDate(b.date);});
	}

	private getSortableDate (date:string): number {
		const trimmedDateString = date.trim();
		if (!trimmedDateString) {
			return 0;
		}

		const beforeChristMatch = trimmedDateString.match(/^c?\.?\s*(\d+)\s*(BC|BCE)$/i);
		if (beforeChristMatch) {
			const yearNumber = parseInt(beforeChristMatch[1], 10);
			// Astronomical year numbering: 1 BC is year 0, 2 BC is year -1, and so on,
			// so BC years need to be shifted by one before negating.
			return -(yearNumber - 1);
		}

		const annoDominiMatch = trimmedDateString.match(/^c?\.?\s*(\d+)\s*(AD|CE)$/i);
		if (annoDominiMatch) {
			return parseInt(annoDominiMatch[1], 10);
		}

		// Handles ISO-style dates, including negative astronomical years like "-0027-01-15".
		const isoDateMatch = trimmedDateString.match(/^(-?\d{1,6})-(\d{2})-(\d{2})$/);
		if (isoDateMatch) {
			const yearPart = parseInt(isoDateMatch[1], 10);
			const monthPart = parseInt(isoDateMatch[2], 10);
			const dayPart = parseInt(isoDateMatch[3], 10);

			// Add fractional offsets for month/day so entries within the same year still
			// sort correctly relative to each other, rather than all collapsing to one point.
			const monthFraction = (monthPart - 1) / 12;
			const dayFraction = (dayPart - 1) / 366;

			return yearPart + monthFraction + dayFraction;
		}

		// Fall back to the native parser for everything else, e.g. "March 1801" or full ISO strings.
		const parsedTimestamp = Date.parse(trimmedDateString);
		if (isNaN(parsedTimestamp)) {
			return 0;
		}

		return new Date(parsedTimestamp).getTime();
	}

	private removeExisting(path: string): void {
		const id = this.byPath.get(path);
		if (!id) return;
		const list = this.byId.get(id);
		if (list) {
			this.byId.set(
				id,
				list.filter((e) => e.path !== path)
			);
		}
		this.byPath.delete(path);
	}
}
