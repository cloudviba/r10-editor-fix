import * as esbuild from 'esbuild';
await esbuild.build({
  entryPoints: ['src/modern-editor.js'],
  bundle: true, minify: true, format: 'iife', target: ['chrome111'],
  loader: { '.css': 'text' }, legalComments: 'eof',
  outfile: '../extension/modern-editor.js',
  logLevel: 'warning'
});
console.log('built');
