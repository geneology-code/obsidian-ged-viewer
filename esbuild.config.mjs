import { build } from 'esbuild';
import { readFileSync } from 'fs';

const isDev = process.argv.includes('--dev');

// Topola's getLength() uses d3.select('svg') which picks the first SVG on the page.
// In Obsidian, that first SVG is typically a hidden icon → getComputedTextLength() = 0
// → all cards get minimum width. Fix: prefer the visible .topola-svg we rendered.
const patchTopolaPlugin = {
    name: 'patch-topola',
    setup(build) {
        build.onLoad({ filter: /topola[/\\]dist[/\\]detailed-renderer\.js$/ }, (args) => {
            let source = readFileSync(args.path, 'utf8');
            source = source.replace(
                `(0, d3_selection_1.select)('svg')`,
                `(0, d3_selection_1.select)(document.querySelector('.topola-svg') || 'svg')`
            );
            return { contents: source, loader: 'js' };
        });
    }
};

build({
    plugins: [patchTopolaPlugin],
    entryPoints: ['src/main.ts'],
    bundle: true,
    minify: !isDev,
    sourcemap: isDev,
    format: 'cjs',
    external: ['obsidian'],
    outfile: 'main.js',
    platform: 'browser',
    target: 'es2016',
}).then((result) => {
    console.log('Build completed successfully');
}).catch((error) => {
    console.error('Build failed:', error);
    process.exit(1);
});
