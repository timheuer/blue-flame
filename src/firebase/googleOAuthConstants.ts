// Injected at build time via esbuild define. See esbuild.js.
// Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET as environment variables
// in your CI/CD pipeline or local .env before building.
declare const __GOOGLE_CLIENT_ID__: string;
declare const __GOOGLE_CLIENT_SECRET__: string;

export const GOOGLE_CLIENT_ID: string = __GOOGLE_CLIENT_ID__;
export const GOOGLE_CLIENT_SECRET: string = __GOOGLE_CLIENT_SECRET__;
