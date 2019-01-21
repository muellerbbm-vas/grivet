/**
 * Memoization decorator for getters and methods without arguments.
 *
 * @throws `TypeError` when used on something other than getters or methods without arguments
 */
export function memoized() {
  return function(target: any, propertyKey: string, descriptor: TypedPropertyDescriptor<any>) {
    const propName = `__memoized__${propertyKey}`;
    if (descriptor.get) {
      descriptor.get = newFunction(descriptor.get, propName);
      return descriptor;
    }
    if (descriptor.value) {
      descriptor.value = newFunction(descriptor.value, propName);
      return descriptor;
    }
    throw new TypeError('@memoized works only on getters and methods without arguments');
  };
}

function newFunction(original: () => any, propName: string) {
  return function(...args: any[]) {
    if (args.length > 0) {
      throw new TypeError('@memoized works only on methods without arguments');
    }
    return this.hasOwnProperty(propName) ? this[propName] : (this[propName] = original.apply(this, args));
  };
}
