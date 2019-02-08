import { SchemaChecker, SchemaError } from '../src/schemaChecker';

describe('The SchemaChecker class', () => {
  it('checks for single objects', () => {
    const ch = new SchemaChecker([], 'test');
    expect(() => {
      ch.singleObject();
    }).toThrow(/test is an array/);
  });

  it('checks for arrays', () => {
    const ch = new SchemaChecker({}, 'test');
    expect(() => {
      ch.array();
    }).toThrow(/test is a single object/);
  });

  it('checks for required members', () => {
    const ch = new SchemaChecker({ a: 1, b: 2 }, 'test');
    expect(() => {
      ch.has(['a', 'c']);
    }).toThrow(/test must contain at least the following: a,c/);
  });

  it('checks for some members', () => {
    const ch = new SchemaChecker({ a: 1, b: 2 }, 'test');
    expect(() => {
      ch.atLeastOneOf(['c', 'd']);
    }).toThrow(/test must contain at least one of: c,d/);
  });

  it('checks for allowed members', () => {
    const ch = new SchemaChecker({ a: 1, b: 2 }, 'test');
    expect(() => {
      ch.allowedMembers(['c', 'd']);
    }).toThrow(/test may only contain one of: c,d/);
  });

  it('complains about non-objects', () => {
    expect(() => {
      const ch = new SchemaChecker('<!DOCTYPE html>' as any, 'test');
    }).toThrow(/is not an object or array/);
  });

  it('throws SchemaErrors', () => {
    expect(() => {
      throw new SchemaError('test');
    }).toThrowError(SchemaError);
  });
});
