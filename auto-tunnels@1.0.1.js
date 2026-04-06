(() => {
    const {
        gMetaBuildingRegistry,
        enumAngleToDirection,
        Vector,
        MetaBalancerBuilding,
        MetaBeltBuilding,
        enumUndergroundBeltVariants,
        MetaUndergroundBeltBuilding,
        UndergroundBeltComponent,
        Entity,
        HUDBuildingPlacerLogic,
        defaultBuildingVariant,
        enumHubGoalRewards,
        Mod
    } = shapez;

    // Constants
    const BELT_ID = "belt";
    const LAYER = "regular";
    const TUNNEL_RANGES = [5, 9, 7]; // [tier1, tier2, smart]

    /**
     * Checks if a building at a tile is a belt with matching rotation
     * @param {Object} staticComp - StaticMapEntity component
     * @param {string} beltId - Belt building ID
     * @param {number} rotation - Current rotation
     * @returns {boolean}
     */
    function isBeltWithRotation(staticComp, beltId, rotation) {
        return staticComp.getMetaBuilding().getId() === beltId && 
               staticComp.rotation === rotation;
    }

    /**
     * Gets the maximum tunnel range based on unlocked rewards
     * @param {Object} hubGoals - Hub goals instance
     * @param {boolean} isSmart - Whether smart tunnels are being used
     * @returns {number}
     */
    function getTunnelRange(hubGoals, isSmart) {
        if (isSmart) return TUNNEL_RANGES[2];
        return hubGoals.isRewardUnlocked(enumHubGoalRewards.reward_underground_belt_tier_2)
            ? TUNNEL_RANGES[1]
            : TUNNEL_RANGES[0];
    }

    /**
     * Checks if an underground belt component matches the required tier and rotation
     * @param {Object} undergroundComp - UndergroundBelt component
     * @param {number} tier - Required tier
     * @param {number} rotation - Current rotation
     * @param {number} baseRotation - Base rotation
     * @returns {boolean}
     */
    function isMatchingTunnel(undergroundComp, tier, rotation, baseRotation) {
        const rotationMatches = rotation === baseRotation || 
                               rotation === (baseRotation + 180) % 360;
        return undergroundComp && 
               undergroundComp.tier === tier && 
               rotationMatches;
    }

    const AutoTunnelExtension = ({ $old }) => ({
        /**
         * Handles direction-locked placement with auto-tunnel support
         */
        executeDirectionLockedPlacement() {
            const currentBuilding = this.currentMetaBuilding.get();
            if (!currentBuilding) return;

            const path = this.computeDirectionLockPath();
            let placedAny = false;
            let hasObstacle = false;

            if (currentBuilding.getId() === BELT_ID) {
                this.root.logic.performBulkOperation(() => {
                    this._placeBeltsWithTunnels(path, currentBuilding, placedAny, hasObstacle);
                });
            } else {
                this.root.logic.performBulkOperation(() => {
                    for (let i = 0; i < path.length; ++i) {
                        const { rotation, tile } = path[i];
                        this.currentBaseRotation = rotation;
                        if (this.tryPlaceCurrentBuildingAt(tile)) {
                            placedAny = true;
                        }
                    }
                });
            }

            if (placedAny) {
                this.root.soundProxy.playUi(currentBuilding.getPlacementSound());
            }
        },

        /**
         * Places belts along a path, automatically inserting tunnels when needed
         * @param {Array} path - Array of {tile, rotation} objects
         * @param {Object} currentBuilding - Current meta building
         * @param {boolean} placedAny - Whether any building was placed
         * @param {boolean} hasObstacle - Whether an obstacle was encountered
         */
        _placeBeltsWithTunnels(path, currentBuilding, placedAny, hasObstacle) {
            this.currentBaseRotation = path[0].rotation;
            const hasSmartTunnels = this.root.hubGoals.isRewardUnlocked("reward_smart_tunnel");

            for (let i = 0; i < path.length; i++) {
                const { tile, rotation } = path[i];
                let rotationChanged = false;

                if (this.currentBaseRotation !== rotation) {
                    rotationChanged = true;
                    this.currentBaseRotation = rotation;
                }

                // Check for existing content at this tile
                const existingContent = this.root.map.getLayerContentXY(tile.x, tile.y, LAYER);
                if (existingContent) {
                    const staticComp = existingContent.components.StaticMapEntity;
                    const isBelt = staticComp.getMetaBuilding().getId() === BELT_ID;
                    const sameRotation = staticComp.rotation === rotation;

                    if (isBelt && sameRotation) continue;
                    
                    hasObstacle = true;
                    if (!isBelt) continue;
                }

                // Try auto-tunnel placement
                const nextPathItem = path[i + 1];
                const nextTileContent = nextPathItem
                    ? this.root.map.getLayerContentXY(nextPathItem.tile.x, nextPathItem.tile.y, LAYER)
                    : null;

                if ((!rotationChanged || hasSmartTunnels) && !hasObstacle) {
                    const tunnelResult = this.tryPlaceAutoTunnels(
                        nextTileContent,
                        path,
                        i,
                        rotationChanged && hasSmartTunnels
                    );

                    if (tunnelResult !== null) {
                        placedAny = true;
                        hasObstacle = false;
                        i = tunnelResult;
                        continue;
                    }
                }

                if (this.tryPlaceCurrentBuildingAt(tile)) {
                    placedAny = true;
                    hasObstacle = false;
                }
            }
        },

        /**
         * Attempts to place tunnel buildings automatically
         * @param {Object|null} nextContent - Content at the next tile
         * @param {Array} path - Full path array
         * @param {number} currentIndex - Current position in path
         * @param {boolean} isSmart - Whether to use smart tunnel placement
         * @returns {number|null} New path index if tunnels were placed, null otherwise
         */
        tryPlaceAutoTunnels(nextContent, path, currentIndex, isSmart) {
            if (!nextContent) return null;

            const baseRotation = this.currentBaseRotation;
            const balancerMeta = gMetaBuildingRegistry.findByClass(MetaBalancerBuilding);
            const beltMeta = gMetaBuildingRegistry.findByClass(MetaBeltBuilding);
            const tunnelMeta = gMetaBuildingRegistry.findByClass(MetaUndergroundBeltBuilding);

            // Check if next tile accepts items from current direction
            const acceptorComp = nextContent.components.ItemAcceptor;
            const nextStaticComp = nextContent.components.StaticMapEntity;
            const isBalancer = nextStaticComp.getMetaBuilding().getId() === balancerMeta.getId();
            const localTile = nextStaticComp.worldToLocalTile(path[currentIndex + 1].tile);

            if (acceptorComp && 
                acceptorComp.findMatchingSlot(localTile, enumAngleToDirection[baseRotation]) &&
                (!isBalancer || nextStaticComp.rotation === baseRotation)) {
                return null;
            }

            const maxRange = getTunnelRange(this.root.hubGoals, isSmart);
            let tunnelEndIndex = null;
            let hasGap = true;
            let allBelts = true;

            // Search for valid tunnel endpoint
            for (let i = currentIndex + maxRange; i > currentIndex; i--) {
                const pathItem = path[i];
                if (!pathItem || pathItem.rotation !== baseRotation) continue;

                const { tile } = pathItem;
                const tileContent = this.root.map.getLayerContentXY(tile.x, tile.y, LAYER);

                if (tileContent) {
                    hasGap = false;
                    const staticComp = tileContent.components.StaticMapEntity;
                    const undergroundComp = tileContent.components.UndergroundBelt;

                    if (!isBeltWithRotation(staticComp, BELT_ID, baseRotation)) {
                        allBelts = false;
                    }

                    const requiredTier = (tunnelEndIndex - currentIndex) > TUNNEL_RANGES[0] ? 1 : 0;
                    if (isMatchingTunnel(undergroundComp, requiredTier, staticComp.rotation, baseRotation)) {
                        return null;
                    }
                } else {
                    hasGap ? tunnelEndIndex = i : hasGap = true;
                }
            }

            if (allBelts) return null;
            if (tunnelEndIndex === null || baseRotation !== path[tunnelEndIndex].rotation) return null;

            // Place the tunnel pair
            const variant = isSmart 
                ? "smart" 
                : (tunnelEndIndex - currentIndex) > TUNNEL_RANGES[0] 
                    ? enumUndergroundBeltVariants.tier2 
                    : defaultBuildingVariant;

            const savedBuilding = this.currentMetaBuilding.get();
            const savedRotation = this.currentBaseRotation;
            const savedVariant = this.currentVariant.get();

            // Place tunnel entrance
            this.currentMetaBuilding.set(tunnelMeta);
            this.currentBaseRotation = baseRotation;
            this.currentVariant.set(variant);
            this.tryPlaceCurrentBuildingAt(path[currentIndex].tile);

            // Place tunnel exit
            this.currentBaseRotation = (baseRotation + 180) % 360;
            this.tryPlaceCurrentBuildingAt(path[tunnelEndIndex].tile);

            // Restore previous state
            this.currentBaseRotation = savedRotation;
            this.currentVariant.set(savedVariant);
            this.currentMetaBuilding.set(beltMeta);
            this.currentBaseRotation = baseRotation;

            return tunnelEndIndex;
        }
    });

    window.$shapez_registerMod(
        class extends Mod {
            init() {
                this.modInterface.extendClass(HUDBuildingPlacerLogic, AutoTunnelExtension);
            }
        },
        {
            name: "Auto Tunnels",
            description: "Adds automatic tunnel placement when dragging belts!",
            website: "https://shapez.mod.io/auto-tunnels",
            id: "auto-tunnels",
            version: "1.0.1",
            author: "Sense_101",
            settings: {},
            modId: "1875354"
        }
    );
})();