// `server-only` exists to fail a build that imports a server module from the
// client. Under Vitest there is no such boundary, so it resolves to nothing.
export {};
