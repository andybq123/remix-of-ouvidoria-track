import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

function accepts(version: string): boolean {
  const output = execFileSync("bash", ["-c", `
    source local-docker/node-runtime.sh
    node() { printf '%s\\n' "$1"; }
    node() { printf '%s\\n' '${version}'; }
    if node_host_atualizado; then printf accepted; else printf rejected; fi
  `], { cwd: process.cwd(), encoding: "utf8" });
  return output === "accepted";
}

describe("VPS patched Node LTS baseline", () => {
  it("rejects Node 24 before the security release", () => {
    expect(accepts("v24.22.0")).toBe(false);
  });
  it("accepts Node 24.22.1 security release", () => {
    expect(accepts("v24.22.1")).toBe(true);
  });
  it("accepts subsequent patches of the same LTS", () => {
    expect(accepts("v24.22.2")).toBe(true);
  });
  it("rejects other majors even if numerically newer", () => {
    expect(accepts("v22.23.4")).toBe(false);
    expect(accepts("v26.12.1")).toBe(false);
  });
  it("rejects prereleases", () => {
    expect(accepts("v24.22.1-rc.1")).toBe(false);
  });
});