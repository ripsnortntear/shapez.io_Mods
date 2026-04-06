// @ts-nocheck
const METADATA = {
    website: "https://cable.ayra.ch",
    author: "AyrA",
    name: "Shape finder",
    version: "2",
    id: "findShape9001",
    description: "Searches the given shape within the specified radius",
    minimumGameVersion: ">=1.5.0",
    doesNotAffectSavegame: true
};

// Constants
const CHUNK_SIZE_TILES = 16;
const TILE_SIZE_PIXELS = 32;
const MAX_RADIUS = 5000;
const SHAPE_CODE_REGEX = /^[CRSW\-]{4}$/i;
const WINDMILL_SHAPE = "WWWW";

// Default search parameters
const DEFAULT_SEARCH = Object.freeze({
    item: "",
    radius: 500,
    quick: false,
    rotate: true
});

/**
 * Calculates Euclidean distance between two points
 * @param {number} x1 
 * @param {number} y1 
 * @param {number} x2 
 * @param {number} y2 
 * @returns {number}
 */
const calcDistance = (x1, y1, x2, y2) =>
    Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);

/**
 * Validates a shape code string
 * @param {string} code 
 * @returns {boolean}
 */
const validateShapeCode = code =>
    typeof code === "string" && SHAPE_CODE_REGEX.test(code);

/**
 * Validates a radius value
 * @param {*} radius 
 * @returns {boolean}
 */
const validateRadius = radius =>
    Number.isInteger(radius) && radius > 0 && radius <= MAX_RADIUS;

/**
 * Checks if a value matches any of the provided regex patterns
 * @param {string} value 
 * @param {RegExp[]} patterns 
 * @returns {boolean}
 */
const matchesAnyPattern = (value, patterns) =>
    patterns.some(pattern => pattern.test(value));

/**
 * Converts a shape code to a search regex
 * @param {string} shape 
 * @returns {RegExp}
 */
const shapeToRegex = shape =>
    new RegExp("^" + shape.split("").map(v => v + "u").join("").replace(/-/g, ".") + "$");

/**
 * Gets all rotational permutations of a shape code
 * @param {string} code 
 * @returns {string[]}
 */
const getPermutations = code => {
    if (!validateShapeCode(code)) return [];
    
    const chars = code.split("");
    const permutations = new Set();
    
    for (let i = 0; i < 4; i++) {
        permutations.add(chars.join(""));
        chars.unshift(chars.pop());
    }
    
    return [...permutations];
};

class Mod extends shapez.Mod {
    init() {
        window.sf = this;
        this.lastSearch = { ...DEFAULT_SEARCH };

        this._initSearchButton();
        this._initKeybinding();
        this._initWindowAPI();
    }

    /**
     * Initializes the search button in the game menu
     * @private
     */
    _initSearchButton() {
        const addBtn = () => {
            const menu = document.querySelector("#ingame_HUD_GameMenu");
            if (!menu) {
                setTimeout(addBtn, 10);
                return;
            }

            const btn = menu.appendChild(document.createElement("button"));
            btn.addEventListener("click", e => {
                e.preventDefault();
                this.showFindDialog();
            });
            btn.style.backgroundImage = `url(data:image/png;base64,${this.icon})`;
        };

        this.signals.stateEntered.add(state => {
            if (state.key === "InGameState") addBtn();
        });
    }

    /**
     * Initializes the keyboard shortcut
     * @private
     */
    _initKeybinding() {
        this.modInterface.registerIngameKeybinding({
            id: "findShape9001_mod_binding",
            keyCode: shapez.keyToKeyCode("F"),
            modifiers: { ctrl: true },
            translation: "Open the shape finder",
            handler: () => {
                this.showFindDialog();
                return shapez.STOP_PROPAGATION;
            }
        });
    }

    /**
     * Initializes the window API for console usage
     * @private
     */
    _initWindowAPI() {
        window.findShape = (shape, radius) => this.findShape([shape], radius, false);
        console.log("Shape finder loaded. Use window.findShape(shape, radius) to find a given shape");
    }

    /**
     * Gets the current game root
     * @returns {Object|null}
     * @private
     */
    _getRoot() {
        return this.app.stateMgr.currentState?.core?.root ?? null;
    }

    /**
     * Shows the shape finder dialog
     * @returns {Object} The dialog instance
     */
    showFindDialog() {
        const lastSearch = this.lastSearch;

        const searchInput = new shapez.FormElementInput({
            id: "findItem",
            label: "Shape declaration",
            placeholder: "Shape declaration",
            defaultValue: lastSearch.item,
            validator: val => validateShapeCode(val)
        });

        const searchRadius = new shapez.FormElementInput({
            id: "findRadius",
            label: `Search radius (in squares, max ${MAX_RADIUS})`,
            placeholder: "Search radius",
            defaultValue: lastSearch.radius.toString(),
            validator: val => validateRadius(+val)
        });

        const shortcut = new shapez.FormElementCheckbox({
            id: "findShortcut",
            label: "Quick search (do not try to find closest node to camera)",
            placeholder: "",
            defaultValue: lastSearch.quick
        });

        const rotate = new shapez.FormElementCheckbox({
            id: "allowRotate",
            label: "Allow rotated shapes",
            placeholder: "",
            defaultValue: lastSearch.rotate
        });

        const dialog = new shapez.DialogWithForm({
            app: this.app,
            title: "Shape finder",
            desc: "<h3>Enter the shape code of length 4 using any of the 4 letters 'CRSW', or a dash for positions you don't care about.</h3>",
            formElements: [searchInput, searchRadius, shortcut, rotate],
            buttons: ["cancel:bad:escape", "ok:good:enter"],
            closeButton: false,
        });

        dialog.buttonSignals.ok.add(() => {
            const root = this._getRoot();
            if (!root?.entityMgr) {
                console.warn("Game stopped while dialog was open!");
                return;
            }

            const item = searchInput.getValue().toUpperCase();
            const fields = {
                item,
                radius: +searchRadius.getValue(),
                quick: shortcut.getValue(),
                rotate: rotate.getValue(),
                permutations: getPermutations(item)
            };

            this.lastSearch = fields;
            console.log("find request", fields);
            this.findShape(
                fields.rotate ? fields.permutations : [fields.item],
                fields.radius,
                fields.quick
            );
        });

        this.dialogs.internalShowDialog(dialog);
        return dialog;
    }

    /**
     * Searches for shapes within a radius of the camera
     * @param {string[]} shapes - Array of shape codes to search for
     * @param {number} radius - Search radius in tiles
     * @param {boolean} quick - Whether to return after first match
     * @returns {boolean} Whether a shape was found
     */
    findShape(shapes, radius, quick) {
        // Validate inputs
        if (!Array.isArray(shapes) || shapes.length === 0) {
            throw new Error("Argument 'shapes': Expected non-empty array of shape strings");
        }
        if (shapes.some(v => !validateShapeCode(v))) {
            throw new Error("Argument 'shapes': All shapes must be 4 characters using only 'CRSW-'");
        }
        if (!validateRadius(radius)) {
            throw new Error("Argument 'radius': Expected positive integer <= 5000");
        }
        if (typeof quick !== "boolean") {
            throw new Error("Argument 'quick': Expected boolean");
        }

        // Check for impossible shapes
        if (shapes.map(v => v.toUpperCase()).includes(WINDMILL_SHAPE)) {
            this.dialogs.showInfo(
                "Shape finder",
                `A shape made exclusively out of windmill pieces "W" cannot exist.`
            );
            return false;
        }

        const root = this._getRoot();
        const { map, camera } = root;
        const searchPatterns = shapes.map(shapeToRegex);

        const tileCoords = {
            x: Math.round(camera.center.x / TILE_SIZE_PIXELS),
            y: Math.round(camera.center.y / TILE_SIZE_PIXELS)
        };

        let bestDist = Infinity;
        const targetCoords = { x: 0, y: 0 };

        const setCamera = pos => {
            console.log("Found closest shape at", pos);
            camera.desiredZoom = 1;
            camera.desiredCenter = pos;
        };

        // Schedule chunk cleanup
        setTimeout(() => this.cleanup(), 500);

        console.debug("Trying to find tiles around", tileCoords);

        const { x: cx, y: cy } = tileCoords;
        
        outerLoop:
        for (let x = cx - radius; x < cx + radius; x += CHUNK_SIZE_TILES) {
            for (let y = cy - radius; y < cy + radius; y += CHUNK_SIZE_TILES) {
                const chunk = map.getOrCreateChunkAtTile(x, y);
                
                for (const patch of chunk.patches) {
                    const { item } = patch;
                    
                    if (item._type !== "shape" || 
                        !matchesAnyPattern(item.definition.cachedHash, searchPatterns)) {
                        continue;
                    }

                    const { pos } = patch;
                    const distance = calcDistance(
                        chunk.tileX + pos.x,
                        chunk.tileY + pos.y,
                        cx, cy
                    );

                    console.debug(
                        `${item.definition.cachedHash} at X=${x}, Y=${y}, dist=${Math.floor(distance)}`
                    );

                    if (distance < bestDist) {
                        console.debug("Closest distance so far:", Math.floor(distance));
                        bestDist = distance;
                        targetCoords.x = chunk.worldSpaceRectangle.x + pos.x * TILE_SIZE_PIXELS;
                        targetCoords.y = chunk.worldSpaceRectangle.y + pos.y * TILE_SIZE_PIXELS;

                        if (quick) {
                            console.log("Quick search. Exiting after first result");
                            setCamera(targetCoords);
                            return true;
                        }
                    }
                }
            }
        }

        if (bestDist < Infinity) {
            setCamera(targetCoords);
            return true;
        }

        this.dialogs.showInfo(
            "Shape finder",
            `${shapes.join(" or ")} could not be found in a ${radius} block radius`
        );
        return false;
    }

    /**
     * Removes empty chunks from the map to free memory
     */
    cleanup() {
        const map = this._getRoot()?.map;
        if (!map) return;

        let removed = 0;
        const toDelete = [];

        map.chunksById.forEach((chunk, key) => {
            if (chunk.containedEntities.length === 0) {
                toDelete.push(key);
            }
        });

        for (const key of toDelete) {
            if (map.chunksById.delete(key)) removed++;
        }

        console.log(`Removed ${removed} empty chunks`);
    }

	get icon() {
		return "iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAMAAAD04JH5AAAAA3NCSVQICAjb4U/" +
		"gAAAACXBIWXMAAAOnAAADpwE8lLkYAAAAGXRFWHRTb2Z0d2FyZQB3d3cuaW5rc2" +
		"NhcGUub3Jnm+48GgAAAr5QTFRF////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
		"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
		"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
		"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
		"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
		"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
		"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
		"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
		"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
		"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
		"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
		"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
		"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
		"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
		"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
		"AAAAAAAAAAAAAAAAASC4HpAAAAOl0Uk5TAAECAwQFBgcICQoLDA0ODxAREhMUFh" +
		"cZGhscHR4fICEiJCUmJygpKissLS4wMTM0NTY3ODk6Ozw9P0BBQkNERUZHSElKS" +
		"0xNTlBRUlNUVVZXWFlaXF9gYWJjZGZnaGlqa2xtbm9wcXJzdHV2d3h5ent8fX5/" +
		"gIGCg4SGiImKi4yNjo+QkZKTlJWWl5iZmpudnp+go6Slpqeoqqusra6vsLGys7S" +
		"1tri5u7y9vr/AwcLDxMXGx8jJysvMzs/Q0dLT1dbX2Nna29zd3t/g4eLj5OXn6O" +
		"nq6+zt7u/w8fLz9PX29/j5+vv8/f4gQEFyAAAGX0lEQVR42u2b+1sUVRjHD6CAC" +
		"ggBYhAliVgQGV4qIkzAGyIZQUIZdAEKsQtmYIWJqWhElpSQF5AszQtIcjESzJK8" +
		"IZiIggGp3Jf5L2JnhodzZmd3z3t2Z6eeZ9+fhuN+3/ezO2fe877njAhRmHNwVFL" +
		"WztKa5t6u8yeK8zLiw/xtkcXsgTeODnA6dqsoxskCwW3mbDzL6bP+IyneyoafUd" +
		"DGGbGGdZMVC++5Y5CjsBvJExQJ75xzh6O0i6tszB7ePu0WB7AzC80cf9VVDmjHH" +
		"jFjeLvtHNzurDBbfLdjHIuNfGCm+AGXOEbbZ5YncnEPx2wNPqbHz9QYijDQenPE" +
		"0L+3LzA1/i49nodObkiKDPIYfd4neIdEv7ZN320aiDEt/jpZr10l8W7ST/qvrRq" +
		"W+2zvEybdf7nf/0iYnlTrliSXLW6YMA9mdev6Ox1qKF+myuTLxims8V0v6DhrWs" +
		"GwYpQz1ip2P0k9DabaUayZZToEn7IB5En9dITS1SzZOk9mLEv8OKmX3x+ilcbek" +
		"0j/YpgGjtclTg4504sfa5WIP4EDrJW4yAfNJM8GST7yg8Z36ZR8f+BM9m4n9Yeh" +
		"ADmk/g9nqIMFksp9KUzu8Q+h/tsPfg+TSIDL9iD1Z4R4mKnC20YSxIHuYB+hfZs" +
		"tkVWSRSJEW0BI/7Rjy2SBxFI24kuvtCWXlOfF4Sc/THYFERQTbrLphXPJukrsMr" +
		"Zo19aZEAC/IdxPC323spEAWCwMvi4UAybUU/RTmUhj1cJYmPBtOmDpqB/3VEwrm" +
		"05wR/JjD4qZ8SxsHhYStRGt6hVc1TORHzsg/rkSBhBBfBfa4qwcF+3nhx4Xl/h8" +
		"4JPocBf3FcMiWs2PicXRcXDnfxD3lUunCcY1Gk8+Awh/dN4HTkbE7TxBWYsTRTA" +
		"/JHbHmfBs6IWXZz10meBlHCCHH7rMX7dNYsjHv+HeZlFJ1utMAX/h+mOWBeF73F" +
		"sElWQnLlmkHUkTruezAHwJr45LcUngOFInU3+RjXtLpJLU4hL3caQqpjU5GfeWS" +
		"iVpxqtZDGkvE0A0DpBFJenFFK0Y0nYmgHk4wCYqSRe+w8GPNPHXXzABhOIABVSS" +
		"JjwR8rm3QmhymQBewAHovkMFLrlfO1LCX/7CBJCGe1tPJSnBJXPGijGO62faaMj" +
		"Fvb1EJdmCS5ZrRxKE62gWgG9wb+HwtvRVvk8S6usiFgBil4OupE0gmmJ+qE5ICr" +
		"4MANdwb3Q7p+G45Aq+Pu1maE5wZ7fpNP5EHRegHfIVWt3huWCA94hTBEoRsTeSi" +
		"VckbV5QgBrc12aWFVRYgjzFzbfaibD47hqWzmQpsSnsSjRLwDMAYkLfc6BUTerV" +
		"eRCRg/AgcJdMeAjp27ofiS02R6G6FE4Mr4LiP83BqwGdIoJ7S2yZ+yHzSLBqwpE" +
		"/fU9JbpCKG1TLOkb7JNAhDDGZxJRCZ42EcsPY3mUwbOfd9hzhJh0gfZNQ9rizbd" +
		"EkkDttkLN1+xZCW8Z0Eutzk3AC6ypWc6zbO+MP8xnCRd802BbbefIMkuEUdA/5H" +
		"QqB8pWSc9hHofEzSAeah6EOfiUdXAFOxOckR2jXwK93LJJs19eDFsKFXdLjjlNg" +
		"gkqJh+uAA8B0mSNEMEGA9My4L552Y6hI9rgTTLBM5+wpl6o/9qrTc4wLJsjScXE" +
		"8yKjIJl7/izZggn06LjTfGjk6i2g0dJgOJZgs887SQL6nfkFIhZEXCqAEvh1yL4" +
		"fsCJetDN0SDhl/pQFKEDok66a7JG4q+cEZ6ZVDVC9VQAni+vQ4Gqzbn/9+YlTwv" +
		"OiUnF0/NNG/1gElCGnjzGxQgun1ahM47lGbAL2jUZtgSY/aBD67h1UmQLPLIf7b" +
		"FSBA83+mfYutLHjqaSUI0JJzFOE1e7X1o0IEtsu/NvLjNueKHaCLMgSj633IR3p" +
		"X3JbNWNmmGIH2mUg53CJ5QaKvvnBNMPkpJQm0v4RHUGRi1udlB77a9O6a2EC58z" +
		"yFCSjMpc5KYCWwEvxHCGqtBOoTOFsJrARagpr/AUEpUpsgTm2CzmlqExxEahPMV" +
		"JvgRaQyQR5SnKDaIMBJpDJBF1KZ4IIFAJCTAYISpDJBBlKZ4BmkLsFtJ2QpglPq" +
		"5CEjBGUIqUqg9GIoJTgqiX83ClnW7LaSO1xByOL21Pht6M6agtSw2Qlbq7ovfpf" +
		"57Nj/JPoXYfGJVqHG56gAAAAASUVORK5CYII=";
	}
}
