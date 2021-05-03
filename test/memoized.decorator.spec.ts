import { memoized } from '../src/memoized.decorator';

describe('A memoized getter', () => {
  let callCount = 0;

  class Tester {
    constructor(private readonly val: number) {}

    @memoized()
    get propA() {
      callCount++;
      return this.val;
    }
  }

  it('is called only once per instance', () => {
    const t5 = new Tester(5);
    expect(t5.propA).toBe(5);
    expect(t5.propA).toBe(5);
    expect(callCount).toBe(1);

    const t7 = new Tester(7);
    expect(t7.propA).toBe(7);
    expect(t7.propA).toBe(7);
    expect(callCount).toBe(2);
  });
});

describe('A memoized method with zero arguments', () => {
  let callCount = 0;

  class Tester {
    constructor(private readonly val: number) {}

    @memoized()
    propA() {
      callCount++;
      return this.val;
    }
  }

  it('is called only once per instance', () => {
    const t5 = new Tester(5);
    expect(t5.propA()).toBe(5);
    expect(t5.propA()).toBe(5);
    expect(callCount).toBe(1);

    const t7 = new Tester(7);
    expect(t7.propA()).toBe(7);
    expect(t7.propA()).toBe(7);
    expect(callCount).toBe(2);
  });
});

describe('A memoized method with arguments', () => {
  class Tester {
    @memoized()
    propA(a: number) {
      return a;
    }
  }

  it('throws an error', () => {
    const t = new Tester();
    expect(() => t.propA(4)).toThrow(/@memoized works only on methods without arguments/);
  });
});
