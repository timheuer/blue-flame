const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

function copyWebviewAssets() {
	const mediaSource = path.join(__dirname, 'src', 'webview', 'media');
	const mediaDest = path.join(__dirname, 'dist', 'webview', 'media');

	fs.mkdirSync(mediaDest, { recursive: true });

	for (const file of fs.readdirSync(mediaSource)) {
		fs.copyFileSync(path.join(mediaSource, file), path.join(mediaDest, file));
	}

	const vscodeElementsSrc = path.join(__dirname, 'node_modules', '@vscode-elements', 'elements', 'dist', 'bundled.js');
	fs.copyFileSync(vscodeElementsSrc, path.join(mediaDest, 'vscode-elements.js'));
}

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
	name: 'esbuild-problem-matcher',

	setup(build) {
		build.onStart(() => {
			console.log('[watch] build started');
		});
		build.onEnd((result) => {
			result.errors.forEach(({ text, location }) => {
				console.error(`✘ [ERROR] ${text}`);
				console.error(`    ${location.file}:${location.line}:${location.column}:`);
			});
			console.log('[watch] build finished');
		});
	},
};

async function main() {
	const ctx = await esbuild.context({
		entryPoints: [
			'src/extension.ts'
		],
		bundle: true,
		format: 'cjs',
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: 'node',
		outfile: 'dist/extension.js',
		define: {
			'__GOOGLE_CLIENT_ID__': JSON.stringify(process.env.GOOGLE_CLIENT_ID || ''),
			'__GOOGLE_CLIENT_SECRET__': JSON.stringify(process.env.GOOGLE_CLIENT_SECRET || ''),
		},
		external: [
			'vscode',
			'firebase-admin', 'firebase-admin/*',
			'@google-cloud/firestore', '@google-cloud/firestore/*',
			'google-auth-library', 'google-auth-library/*',
			'gcp-metadata', 'gcp-metadata/*',
		],
		logLevel: 'silent',
		plugins: [
			/* add to the end of plugins array */
			esbuildProblemMatcherPlugin,
		],
	});
	if (watch) {
		copyWebviewAssets();
		await ctx.watch();
	} else {
		await ctx.rebuild();
		copyWebviewAssets();
		await ctx.dispose();
	}
}

main().catch(e => {
	console.error(e);
	process.exit(1);
});
