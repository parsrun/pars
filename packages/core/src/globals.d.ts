// Global type declarations for cross-runtime compatibility
// These are needed for JSR/Deno publishing where Node.js globals aren't available

declare namespace NodeJS {
  interface ProcessEnv {
    [key: string]: string | undefined;
  }
  interface ProcessVersions {
    node?: string;
  }
  interface Process {
    env: ProcessEnv;
    versions: ProcessVersions;
  }
}

declare var process: NodeJS.Process | undefined;
