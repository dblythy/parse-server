import { LRUCache as LRU } from 'lru-cache';
import defaults from '../../defaults';

export class LRUCache {
  constructor({ ttl = defaults.cacheTTL, maxSize = defaults.cacheMaxSize }) {
    this.cache = new LRU({
      max: maxSize,
      ttl,
    });
  }

  get(key) {
    return this.cache.get(key) || null;
  }

  put(key, value, ttl = this.ttl) {
    this.cache.set(key, value, ttl);
  }

  del(key) {
    this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }

  clearPrefix(prefix) {
    for (const key of [...this.cache.keys()]) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }
}

export default LRUCache;
