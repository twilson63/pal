declare module "bun:test" {
  export function describe(name: string, fn: () => void): void;
  export function it(name: string, fn: () => void | Promise<void>): void;
  export const test: typeof it;
  export function expect(actual: unknown): {
    toBe(expected: unknown): void;
    toEqual(expected: unknown): void;
    toThrow(expected?: string | RegExp): void;
    rejects: {
      toThrow(expected?: string | RegExp): Promise<void>;
    };
  };
  export function afterEach(fn: () => void | Promise<void>): void;
}
