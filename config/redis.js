const Redis = require('ioredis');
const winston = require('winston');

// In-memory storage fallback
const inMemoryStore = {
  likes: new Map(),
  views: new Map(),
  comments: new Map()
};

// Create logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.simple(),
  transports: [new winston.transports.Console()]
});

// Enhanced fallback with in-memory storage
const fallback = {
  store: new Map(),
  
  // Add multi support
  multi() {
    const commands = [];
    const chain = {
      hset(...args) {
        commands.push(['hset', ...args]);
        return chain;
      },
      exec: async () => {
        try {
          return await Promise.all(commands.map(([cmd, ...args]) => 
            fallback[cmd](...args)
          ));
        } catch (error) {
          console.error('Redis fallback error:', error);
          return null;
        }
      }
    };
    return chain;
  },

  async hset(key, field, value) {
    const hashKey = `${key}:${field}`;
    this.store.set(hashKey, value);
    return 'OK';
  },

  async hget(key, field) {
    const hashKey = `${key}:${field}`;
    return this.store.get(hashKey) || '0';
  },

  async hdel(key, field) {
    const hashKey = `${key}:${field}`;
    return this.store.delete(hashKey);
  },

  async sadd(key, member) {
    const set = this.store.get(key) || new Set();
    set.add(member);
    this.store.set(key, set);
    return 1;
  },

  async srem(key, member) {
    const set = this.store.get(key);
    if (!set) return 0;
    return set.delete(member) ? 1 : 0;
  },

  async sismember(key, member) {
    const set = this.store.get(key);
    return set ? set.has(member) : false;
  },

  async hincrby(key, field, increment) {
    const hashKey = `${key}:${field}`;
    const currentValue = parseInt(this.store.get(hashKey) || '0');
    const newValue = currentValue + increment;
    this.store.set(hashKey, newValue.toString());
    return newValue;
  },

  async get(key) {
    return this.store.get(key);
  },

  async ttl(key) {
    const expiry = this.store.get(`${key}:expiry`);
    if (!expiry) return -2;
    return Math.ceil((expiry - Date.now()) / 1000);
  },

  async set(key, value, mode, duration) {
    this.store.set(key, value);
    if (mode === 'EX') {
      const expiry = Date.now() + (duration * 1000);
      this.store.set(`${key}:expiry`, expiry);
      setTimeout(() => {
        this.store.delete(key);
        this.store.delete(`${key}:expiry`);
      }, duration * 1000);
    }
    return 'OK';
  }
};

module.exports = fallback;
