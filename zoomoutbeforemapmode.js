// @ts-nocheck
const METADATA = {

    author: "sawomar",
    name: "Zoom out before Mapmode",
    version: "1",
    id: "zoomout-mapmode",
    description: "Changes the zoomlevel at which the game switches to map mode. You can change the treshold in the modfile. Warning: Can drastically affect Performance",
    minimumGameVersion: ">=1.5.0",

    // You can specify this parameter if savegames will still work
    // after your mod has been uninstalled
    doesNotAffectSavegame: true,
};

class Mod extends shapez.Mod {
    init() {

    // Change this value to define where the switch to overview happens. smaller value = later switch / vanilla default = .9
	
	shapez.globalConfig.mapChunkOverviewMinZoom = ".5";
    }
    
}