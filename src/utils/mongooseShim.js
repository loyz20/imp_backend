class Schema {
  constructor(definition = {}, options = {}) {
    this.definition = definition;
    this.options = options;
    this.methods = {};
    this.statics = {};
  }

  index() { return this; }
  pre() { return this; }
  post() { return this; }
  plugin() { return this; }
  add() { return this; }
  set() { return this; }

  virtual() {
    return {
      get: () => this,
      set: () => this,
    };
  }
}

class ObjectId {
  constructor(value) {
    this.value = value;
  }

  toString() {
    return String(this.value || '');
  }

  static createFromHexString(value) {
    return String(value || '');
  }
}

Schema.Types = { ObjectId };

const model = (name, schema) => {
  class Model {
    constructor(doc = {}) {
      Object.assign(this, doc);
    }
  }

  Model.modelName = name;
  Model.schema = schema;
  return Model;
};

module.exports = {
  Schema,
  model,
  Types: Schema.Types,
};
