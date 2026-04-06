// @ts-nocheck
const METADATA = {
    author: "Remag",
    name: "Better Dark Theme",
    version: "1.0",
    id: "bdt",
    description: "Modifies the dark theme map background to be slightly lighter as i thought the vanilla one is too dark",
    minimumGameVersion: ">=1.5.0",

    // You can specify this parameter if savegames will still work
    // after your mod has been uninstalled
    doesNotAffectSavegame: true,
};

class Mod extends shapez.Mod {
    init() {
        shapez.THEMES.light.map.background = "#eee";
        shapez.THEMES.light.items.outline = "#000";

        shapez.THEMES.dark.map.background = "#4d4d4d";
        shapez.THEMES.dark.items.outline = "#000000";
    }
}
