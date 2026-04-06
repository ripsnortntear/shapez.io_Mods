const METADATA = {
    website: "https://github.com/ripsnortntear",
    author: "JWheels",
    name: "Teleporter",
    version: "1.3.3",
    id: "jwheels-teleporter-mod",
    description: "Add buildings to teleport shapes and items.",
    modId: "1780458"
};

// Define processor type
shapez.enumItemProcessorTypes.InputTeleporter = "InputTeleporter";
shapez.MOD_ITEM_PROCESSOR_SPEEDS.InputTeleporter = () => 100;
shapez.MOD_ITEM_PROCESSOR_HANDLERS.InputTeleporter = ({ entity, items }) => {
    entity.components.InputTeleporterComponent.item = items.get(0);
};

// Shared schema and copyAdditionalStateTo for both components
const TELEPORTER_SCHEMA = { channel: shapez.types.string };
const copyChannelState = function(otherComponent) {
    otherComponent.channel = this.channel;
};

class InputTeleporterComponent extends shapez.Component {
    static getId() { return "InputTeleporterComponent"; }
    static getSchema() { return TELEPORTER_SCHEMA; }
    
    constructor() {
        super();
        this.item = null;
        this.channel = "";
    }
    
    copyAdditionalStateTo(otherComponent) {
        copyChannelState.call(this, otherComponent);
    }
}

class OutputTeleporterComponent extends shapez.Component {
    static getId() { return "OutputTeleporterComponent"; }
    static getSchema() { return TELEPORTER_SCHEMA; }
    
    constructor() {
        super();
        this.channel = "";
    }
    
    copyAdditionalStateTo(otherComponent) {
        copyChannelState.call(this, otherComponent);
    }
}

// Shared drawing logic for both systems
function drawTeleporterLabel(parameters, channel, color) {
    const context = parameters.context;
    const size = channel.length * 4;
    const halfSize = size / 2;
    
    context.fillStyle = "rgba(250, 250, 250, 0.8)";
    context.beginRoundedRect(-halfSize, -5, size, 8, 2);
    context.fill();
    
    context.fillStyle = color;
    context.textAlign = "center";
    context.font = "7px GameFont";
    context.fillText(channel, 0, 2);
}

class InputTeleporterSystem extends shapez.GameSystemWithFilter {
    constructor(root) {
        super(root, [InputTeleporterComponent]);
        this.root.signals.entityManuallyPlaced.add(entity => {
            this.root.hud.parts.teleporterEdit?.editTeleporterText(entity, "in", { deleteOnCancel: true });
        });
    }

    drawChunk(parameters, chunk) {
        const contents = chunk.containedEntitiesByLayer.regular;
        const visibleRect = parameters.visibleRect;
        const context = parameters.context;
        
        for (let i = 0; i < contents.length; ++i) {
            const entity = contents[i];
            const inputTeleporterComp = entity.components.InputTeleporterComponent;
            if (!inputTeleporterComp) continue;

            const center = entity.components.StaticMapEntity
                .getTileSpaceBounds()
                .getCenter()
                .toWorldSpace();

            if (visibleRect.containsCircle(center.x, center.y, 40)) {
                context.save();
                context.translate(center.x, center.y);
                drawTeleporterLabel(parameters, inputTeleporterComp.channel, "blue");
                context.restore();
            }
        }
    }
}

class OutputTeleporterSystem extends shapez.GameSystemWithFilter {
    constructor(root) {
        super(root, [OutputTeleporterComponent]);
        this.root.signals.entityManuallyPlaced.add(entity => {
            this.root.hud.parts.teleporterEdit?.editTeleporterText(entity, "out", { deleteOnCancel: true });
        });
        
        // Cache for channel-to-input mapping
        this._channelCache = new Map();
        this._cacheValid = false;
    }

    _buildChannelCache() {
        this._channelCache.clear();
        const inputEntities = this.root.entityMgr.componentToEntity.InputTeleporterComponent;
        if (!inputEntities) return;
        
        for (let i = 0; i < inputEntities.length; i++) {
            const entity = inputEntities[i];
            const comp = entity.components.InputTeleporterComponent;
            if (!comp) continue;
            
            if (!this._channelCache.has(comp.channel)) {
                this._channelCache.set(comp.channel, []);
            }
            this._channelCache.get(comp.channel).push(comp);
        }
        this._cacheValid = true;
    }

    update() {
        // Rebuild cache if invalid
        if (!this._cacheValid) {
            this._buildChannelCache();
        }

        const entities = this.allEntities;
        for (let i = 0; i < entities.length; ++i) {
            const entity = entities[i];
            const outputComp = entity.components.OutputTeleporterComponent;
            const ejectComp = entity.components.ItemEjector;
            
            const matchingInputs = this._channelCache.get(outputComp.channel);
            if (!matchingInputs) continue;
            
            for (let j = 0; j < matchingInputs.length; j++) {
                const comp = matchingInputs[j];
                if (comp.item && ejectComp.tryEject(0, comp.item)) {
                    comp.item = null;
                    // Invalidate cache after state change
                    this._cacheValid = false;
                    break;
                }
            }
        }
    }

    drawChunk(parameters, chunk) {
        const contents = chunk.containedEntitiesByLayer.regular;
        const visibleRect = parameters.visibleRect;
        const context = parameters.context;

        for (let i = 0; i < contents.length; ++i) {
            const entity = contents[i];
            const outputTeleporterComp = entity.components.OutputTeleporterComponent;
            if (!outputTeleporterComp) continue;

            const center = entity.components.StaticMapEntity
                .getTileSpaceBounds()
                .getCenter()
                .toWorldSpace();

            if (visibleRect.containsCircle(center.x, center.y, 40)) {
                context.save();
                context.translate(center.x, center.y);
                drawTeleporterLabel(parameters, outputTeleporterComp.channel, "orange");
                context.restore();
            }
        }
    }
}

// Shared building variant factory
function createBuildingVariant(name, description, imgKey, blueprintKey) {
    return [{
        variant: shapez.defaultBuildingVariant,
        name,
        description,
        regularImageBase64: RESOURCES[imgKey],
        blueprintImageBase64: RESOURCES[blueprintKey],
        tutorialImageBase64: RESOURCES[imgKey],
    }];
}

class MetaTeleporterInputBuilding extends shapez.ModMetaBuilding {
    constructor() { super("TeleporterInput"); }
    
    getIsUnlocked() { return true; }

    static getAllVariantCombinations() {
        return createBuildingVariant(
            "Input teleporter",
            "This is the teleporter input. Set a channel, and every item fed into this building will be output by a matching output teleporter on the same channel.",
            "in.png",
            "inBlueprint.png"
        );
    }

    setupEntityComponents(entity) {
        entity.addComponent(new shapez.ItemAcceptorComponent({
            slots: [{ pos: new shapez.Vector(0, 0), direction: shapez.enumDirection.top }]
        }));
        entity.addComponent(new shapez.ItemProcessorComponent({
            inputsPerCharge: 1,
            processorType: shapez.enumItemProcessorTypes.InputTeleporter,
        }));
        entity.addComponent(new InputTeleporterComponent());
    }
}

class MetaTeleporterOutputBuilding extends shapez.ModMetaBuilding {
    constructor() { super("TeleporterOutput"); }
    
    getIsUnlocked() { return true; }

    static getAllVariantCombinations() {
        return createBuildingVariant(
            "Output Teleporter",
            "This is the teleporter output. It receives and outputs items sent from an input teleporter on the same channel.",
            "out.png",
            "outBlueprint.png"
        );
    }

    setupEntityComponents(entity) {
        entity.addComponent(new shapez.ItemEjectorComponent({
            slots: [{ pos: new shapez.Vector(0, 0), direction: shapez.enumDirection.top }]
        }));
        entity.addComponent(new OutputTeleporterComponent());
    }
}

const CustomProcessor = ({ $old }) => ({
    canProcess(entity) {
        const comp = entity.components.InputTeleporterComponent;
        return comp ? !comp.item : $old.canProcess(entity);
    }
});

class HUDTeleporterEdit extends shapez.BaseHUDPart {
    initialize() {
        this.root.camera.downPreHandler.add(this.downPreHandler, this);
    }

    downPreHandler(pos, button) {
        if (button !== shapez.enumMouseButton.left) return;
        
        const tile = this.root.camera.screenToWorld(pos).toTileSpace();
        const contents = this.root.map.getLayerContentXY(tile.x, tile.y, "regular");
        if (!contents) return;

        const { InputTeleporterComponent: inComp, OutputTeleporterComponent: outComp } = contents.components;
        
        if (inComp || outComp) {
            this.editTeleporterText(contents, inComp ? "in" : "out", { deleteOnCancel: false });
            return shapez.STOP_PROPAGATION;
        }
    }

    _getTeleporterComp(entity, type) {
        return type === "in" 
            ? entity.components.InputTeleporterComponent 
            : entity.components.OutputTeleporterComponent;
    }

    _isRootValid() {
        return this.root && this.root.entityMgr;
    }

    editTeleporterText(entity, type, { deleteOnCancel = true }) {
        const teleporterComp = this._getTeleporterComp(entity, type);
        if (!teleporterComp) return;

        const uid = entity.uid;

        const textInput = new shapez.FormElementInput({
            id: "channel",
            placeholder: "",
            defaultValue: teleporterComp.channel,
            validator: val => val.length > 0,
        });

        const dialog = new shapez.DialogWithForm({
            app: this.root.app,
            title: "Teleporter setup",
            desc: "Enter a channel name",
            formElements: [textInput],
            buttons: ["cancel:bad:escape", "ok:good:enter"],
            closeButton: false,
        });
        
        this.root.hud.parts.dialogs.internalShowDialog(dialog);

        dialog.buttonSignals.ok.add(() => {
            if (!this._isRootValid()) return;
            
            const entityRef = this.root.entityMgr.findByUid(uid, false);
            if (!entityRef) return;

            const comp = this._getTeleporterComp(entity, type);
            if (!comp) return;
            
            comp.channel = textInput.getValue();
            
            // Invalidate output system cache on channel change
            const outputSystem = this.root.systemMgr.systems.OutputTeleporterSystem;
            if (outputSystem) outputSystem._cacheValid = false;
        });

        if (deleteOnCancel) {
            dialog.buttonSignals.cancel.add(() => {
                if (!this._isRootValid()) return;
                
                const entityRef = this.root.entityMgr.findByUid(uid, false);
                if (!entityRef) return;
                
                if (!this._getTeleporterComp(entity, type)) return;
                
                this.root.logic.tryDeleteBuilding(entityRef);
            });
        }
    }
}

class Mod extends shapez.Mod {
    init() {
        this.modInterface.extendClass(shapez.ItemProcessorSystem, CustomProcessor);
        this.modInterface.registerComponent(OutputTeleporterComponent);
        this.modInterface.registerComponent(InputTeleporterComponent);

        this.modInterface.registerGameSystem({
            id: "OutputTeleporterSystem",
            systemClass: OutputTeleporterSystem,
            before: "constantSignal",
            drawHooks: ["staticAfter"],
        });
        
        this.modInterface.registerGameSystem({
            id: "InputTeleporterSystem",
            systemClass: InputTeleporterSystem,
            before: "constantSignal",
            drawHooks: ["staticAfter"],
        });

        const registerBuilding = (metaClass, icon, toolbar = "regular") => {
            this.modInterface.registerNewBuilding({ metaClass, buildingIconBase64: RESOURCES[icon] });
            this.modInterface.addNewBuildingToToolbar({ toolbar, location: "primary", metaClass });
        };

        registerBuilding(MetaTeleporterInputBuilding, "in.png");
        registerBuilding(MetaTeleporterOutputBuilding, "out.png");

        this.modInterface.registerHudElement("teleporterEdit", HUDTeleporterEdit);
    }
}

const RESOURCES = {
    "outBlueprint.png":
        " data:image/png;base64,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",

    "inBlueprint.png":
        " data:image/png;base64,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",
        "out.png":
        " data:image/png;base64,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",
        "in.png":
        " data:image/png;base64,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",
};