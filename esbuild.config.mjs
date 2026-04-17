import { build } from 'esbuild';

const isDev = process.argv.includes('--dev');

build({
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