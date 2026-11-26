import * as esbuild from 'esbuild';
await esbuild.build({
  entryPoints: ['src/spell-sw.js'], bundle: true, minify: true, format: 'iife', platform: 'browser',
  target: ['chrome111'], mainFields: ['browser', 'main'], outfile: '../extension/spell-sw.js', legalComments: 'eof',
  external: ['fs', 'path', 'crypto', 'ws', 'url'], logLevel: 'warning',
  define: { 'process.env.NODE_ENV': '"production"' }
});
console.log('sw built');
