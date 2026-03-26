"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AMPRegistry = void 0;
/**
 * Query the AMP Service Registry to discover services.
 *
 * The `amp-registry` program is not yet deployed. All methods throw
 * an error until the program is available on-chain. The API surface
 * is defined here so client code can be written against it today.
 */
class AMPRegistry {
    config;
    constructor(config) {
        this.config = config;
    }
    /**
     * Search for services by category, price, and reputation.
     * @throws Error — registry program not yet deployed.
     */
    async search(_filters) {
        throw new Error("AMP Registry program not yet deployed. Use direct channel opening instead.");
    }
    /**
     * Get a specific service entry by provider pubkey.
     * @throws Error — registry program not yet deployed.
     */
    async getService(_provider) {
        throw new Error("AMP Registry program not yet deployed. Use direct channel opening instead.");
    }
}
exports.AMPRegistry = AMPRegistry;
//# sourceMappingURL=registry.js.map