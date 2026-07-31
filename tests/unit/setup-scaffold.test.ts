import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('STORY-setup-002: Next.js 14 App Router scaffold', () => {
  const rootDir = resolve(__dirname, '..', '..');

  test('tsconfig.json exists and enforces strict mode with ES2022 target', () => {
    const tsconfig = JSON.parse(
      readFileSync(resolve(rootDir, 'tsconfig.json'), 'utf-8'),
    );
    expect(tsconfig.compilerOptions).toBeDefined();
    expect(tsconfig.compilerOptions.strict).toBe(true);
    expect(tsconfig.compilerOptions.target).toBe('ES2022');
    expect(tsconfig.compilerOptions.paths).toEqual({ '@/*': ['./src/*'] });
  });

  test('next.config.js exports standalone output', () => {
    const nextConfigPath = resolve(rootDir, 'next.config.js');
    const nextConfig = require(nextConfigPath);
    expect(nextConfig.output).toBe('standalone');
  });

  test('src/app/layout.tsx exists as a React Server Component', () => {
    const layoutPath = resolve(rootDir, 'src', 'app', 'layout.tsx');
    const layout = readFileSync(layoutPath, 'utf-8');
    expect(layout).toContain('export const metadata');
    expect(layout).toContain('export default function RootLayout');
    expect(layout).toContain('children');
    expect(layout).toContain('<html');
    expect(layout).toContain('<body');
  });

  test('src/app/page.tsx exists as a React Server Component', () => {
    const pagePath = resolve(rootDir, 'src', 'app', 'page.tsx');
    const page = readFileSync(pagePath, 'utf-8');
    expect(page).toContain('export default function HomePage');
    expect(page).toContain('<h1');
  });

  test('package.json includes Next.js 14 build and dev scripts', () => {
    const pkg = JSON.parse(
      readFileSync(resolve(rootDir, 'package.json'), 'utf-8'),
    );
    expect(pkg.scripts).toBeDefined();
    expect(pkg.scripts.build).toBe('next build');
    expect(pkg.scripts.dev).toBe('next dev');
  });
});
