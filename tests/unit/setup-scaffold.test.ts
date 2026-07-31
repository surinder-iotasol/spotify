import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = import.meta.dirname || ".";

describe("STORY-setup-001: Repository root scaffold files", () => {
  it("should have a .git directory", () => {
    expect(existsSync(join(ROOT, ".git"))).toBe(true);
  });

  it("should have a .gitignore covering node_modules, .next, .env, and build artifacts", () => {
    const gitignore = join(ROOT, ".gitignore");
    expect(existsSync(gitignore)).toBe(true);
    const content = readFileSync(gitignore, "utf-8");
    expect(content).toContain("node_modules/");
    expect(content).toContain(".next/");
    expect(content).toContain(".env");
    expect(content).toMatch(/build|dist|out/);
  });

  it("should have an .editorconfig with 2-space indent, UTF-8, and LF line endings", () => {
    const editorconfig = join(ROOT, ".editorconfig");
    expect(existsSync(editorconfig)).toBe(true);
    const content = readFileSync(editorconfig, "utf-8");
    expect(content).toContain("indent_style = space");
    expect(content).toContain("indent_size = 2");
    expect(content).toContain("charset = utf-8");
    expect(content).toContain("end_of_line = lf");
  });

  it("should have a README.md documenting layout, prerequisites, and scripts", () => {
    const readme = join(ROOT, "README.md");
    expect(existsSync(readme)).toBe(true);
    const content = readFileSync(readme, "utf-8");
    expect(content.toLowerCase()).toContain("spotify");
    expect(content.toLowerCase()).toContain("setup");
    expect(content.toLowerCase()).toContain("dev");
  });

  it("should have a root package.json with name spotify and private true", () => {
    const pkgPath = join(ROOT, "package.json");
    expect(existsSync(pkgPath)).toBe(true);
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    expect(pkg.name).toBe("spotify");
    expect(pkg.private).toBe(true);
  });
});
