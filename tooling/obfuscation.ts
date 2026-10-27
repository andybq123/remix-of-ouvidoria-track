import JavaScriptObfuscator from "javascript-obfuscator";
import type { Plugin } from "vite";

// Protect only lazy browser license chunks. Never transform source files,
// framework/vendor entry points, SSR handlers, or worker code.
export function shouldObfuscateChunk(isServer: boolean, isEntry: boolean, modules: string[]): boolean {
  return !isServer && !isEntry && modules.some((id) =>
    /\/src\/(routes\/_authenticated\/licenca\.tsx|lib\/licenca-(estado|conexao)\.ts)(\?|$)/.test(id.replaceAll("\\", "/")),
  );
}

export function obfuscateBrowserChunk(code: string): string {
  return JavaScriptObfuscator.obfuscate(code, {
    target: "browser-no-eval",
    compact: true,
    seed: 271026,
    identifierNamesGenerator: "hexadecimal",
    renameGlobals: false,
    renameProperties: false,
    // Deployment replaces configuration URL/key literals in emitted assets.
    // Keep strings readable so those replacements remain reliable.
    stringArray: false,
    controlFlowFlattening: false,
    deadCodeInjection: false,
    debugProtection: false,
    selfDefending: false,
    sourceMap: false,
  }).getObfuscatedCode();
}

export function licenseObfuscation(): Plugin {
  return {
    name: "ouvidesk-license-obfuscation",
    apply: "build",
    enforce: "post",
    renderChunk(code, chunk) {
      const isServer = this.environment.name !== "client";
      if (!shouldObfuscateChunk(isServer, chunk.isEntry, Object.keys(chunk.modules))) return null;
      return { code: obfuscateBrowserChunk(code), map: null };
    },
  };
}