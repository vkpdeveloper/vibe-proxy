declare module '*.module.scss' {
  const classes: Record<string, string>;
  export default classes;
}

// Global constants injected by Vite at build time (see vite.config.ts)
/** Short git commit, with a -dirty suffix for uncommitted changes. Empty when unknown. */
declare const __APP_COMMIT__: string;
/** ISO timestamp of the build. */
declare const __APP_BUILD_TIME__: string;
