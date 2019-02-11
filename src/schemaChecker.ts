/** Thrown when a malformed JSON:API document is encountered */
export class SchemaError extends Error {
  constructor(message?: string) {
    super(message);
    //tslint:disable:no-unsafe-any
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Implements some simple schema checks on objects
 * @hidden
 */
export class SchemaChecker {
  /** Factory function creating a new SchemaChecker */
  static fromData(data: object, name: string) {
    return new SchemaChecker(data, name);
  }

  constructor(private readonly obj: object, private readonly name: string) {
    //tslint:disable:strict-type-predicates
    if (typeof obj !== 'object') {
      throw new SchemaError(`${this.name} is not an object or array`);
    }
  }

  /**
   * check that the given object is a single JSON object
   */
  singleObject() {
    if (Array.isArray(this.obj)) {
      throw new SchemaError(`${this.name} is an array, not a single object`);
    }
    return this;
  }

  /**
   * check that the object is a JSON array
   */
  array() {
    if (!Array.isArray(this.obj)) {
      throw new SchemaError(`${this.name} is a single object, not an array`);
    }
    return this;
  }

  /**
   * check that the object has all of the given members
   */
  has(members: string[]) {
    if (!members.every(m => m in this.obj)) {
      throw new SchemaError(`${this.name} must contain at least the following: ${members}`);
    }
    return this;
  }

  /**
   * check that the object has at least one of the given members
   */
  atLeastOneOf(members: string[]) {
    if (!members.some(m => m in this.obj)) {
      throw new SchemaError(`${this.name} must contain at least one of: ${members}`);
    }
    return this;
  }

  /**
   * check that the object has no other members than the given allowed members
   */
  allowedMembers(members: string[]) {
    if (!Object.keys(this.obj).every(m => members.includes(m))) {
      throw new SchemaError(`${this.name} may only contain one of: ${members}`);
    }
    return this;
  }
}
