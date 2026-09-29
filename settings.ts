import {App, PluginSettingTab, Setting} from 'obsidian';
import TimelinePlugin from './main';

export interface TimelinePluginSettings {
    dateFormat: string;
}

export const DATE_FORMATS = {
    "YYYY-MM-DD" : "YYYY-MM-DD",
    "DD-MM-YYYY" : "DD-MM-YYYY"
};

export const DEFAULT_SETTINGS: TimelinePluginSettings = {
    dateFormat: DATE_FORMATS["YYYY-MM-DD"],
};

export class TimelinePluginSettingsTab extends PluginSettingTab {
    plugin: TimelinePlugin;

    constructor(app: App, plugin: TimelinePlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();

        new Setting(containerEl)
            .setName('Date display format')
            .addDropdown((dropdown)=> {
                dropdown.addOptions(DATE_FORMATS).setValue(this.plugin.settings.dateFormat).onChange(async (value) => {
                    this.plugin.settings.dateFormat = value;
                    await this.plugin.saveSettings();
                });
            });
    }
}