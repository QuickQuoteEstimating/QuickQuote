declare module "uuid" {
  export function v4(options?: { random?: Uint8Array }): string;
}
