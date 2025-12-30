/**
 * LRU Cache for hostname shortening with size limit
 */
class HostnameCache {
    private cache: Map<string, string>;
    private maxSize: number;

    constructor(maxSize: number = 1024) {
        this.cache = new Map();
        this.maxSize = maxSize;
    }

    get(key: string): string | undefined {
        const value = this.cache.get(key);
        if (value !== undefined) {
            // Move to end (most recently used)
            this.cache.delete(key);
            this.cache.set(key, value);
        }
        return value;
    }

    set(key: string, value: string): void {
        // Remove if exists to re-add at end
        if (this.cache.has(key)) {
            this.cache.delete(key);
        }

        // Remove oldest entry if at capacity
        if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            if (firstKey !== undefined) {
                this.cache.delete(firstKey);
            }
        }

        this.cache.set(key, value);
    }

    clear(): void {
        this.cache.clear();
    }

    size(): number {
        return this.cache.size;
    }
}

export class HostNameManager {
    private hostnameCache: HostnameCache;

    constructor() {
        this.hostnameCache = new HostnameCache(1024);
    }

    /**
     * Find the longest common suffix among an array of strings, treating them as dot-separated segments.
     */
    public findCommonSuffix(inputList: string[]): string {
        if (inputList.length <= 1) return "";

        const segmentedStringList = inputList.map((s) => s.split("."));
        const first = segmentedStringList[0];
        const commonSuffixList: string[] = [];

        // Compare from last segment backwards
        for (let i = 1; i <= first.length; i++) {
            const segment = first[first.length - i];
            // Check if all strings have the same part at the same relative position from end
            if (segmentedStringList.every((parts) => parts.length >= i && parts[parts.length - i] === segment)) {
                commonSuffixList.unshift(segment);
            } else {
                break;
            }
        }

        return commonSuffixList.length === 0 ? "" : "." + commonSuffixList.join(".");
    }

    /**
     * Batch shorten hostnames with common suffix detection
     * Return a map where:
     *  - key: the original hostname
     *  - value: the shortened hostname
     */
    public shortenHostnames(hostnames: string[]): Map<string, string> {
        const result = new Map<string, string>();
        if (hostnames.length <= 1) {
            for (const h of hostnames) result.set(h, h);
            return result;
        }

        const commonSuffix = this.findCommonSuffix(hostnames);

        for (const hostname of hostnames) {
            let shortened = hostname;
            // Strip if hostname ends with the common suffix (and isn't the suffix itself)
            if (commonSuffix.length > 0 && hostname.endsWith(commonSuffix)) {
                shortened = hostname.slice(0, -commonSuffix.length);
            }

            // Cache each result
            this.hostnameCache.set(hostname, shortened);
            result.set(hostname, shortened);
        }

        return result;
    }

    public getShortHostname(hostname: string): string {
        return this.hostnameCache.get(hostname) || hostname;
    }

    public clear(): void {
        this.hostnameCache.clear();
    }
}

export const hostNameManager = new HostNameManager();
