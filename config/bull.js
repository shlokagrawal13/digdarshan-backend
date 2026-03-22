// Simple in-memory queue implementation
class InMemoryQueue {
  constructor(name) {
    this.name = name;
    this.processors = new Map();
  }

  process(type, handler) {
    this.processors.set(type, handler);
  }

  async add(type, data) {
    const handler = this.processors.get(type);
    if (handler) {
      await handler({ data });
    }
    return true;
  }
}

const socialActionsQueue = new InMemoryQueue('socialActions');

module.exports = { socialActionsQueue };
