// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import postcss, { Root } from 'postcss';
import type { Node } from 'postcss-value-parser';
const postcssPresetEnv = require('postcss-preset-env');
const valueParser = require('postcss-value-parser');

export const log = vscode.window.createOutputChannel("CSS Gradients Preview");

export function activate(context: vscode.ExtensionContext) {
	const presetEnv = postcssPresetEnv({
		stage: 0,
		preserve: false,
		enableProgressiveCustomProperties: false,
		features: {
			'lab-function': {
				subFeatures: {
					displayP3: false,
				}
			},
			'oklab-function': {
				subFeatures: {
					displayP3: false,
				}
			}
		}
	});

	const lastGradient: {
		document: string | undefined,
		gradient: string | undefined,
	} = {
		document: undefined,
		gradient: undefined,
	};

	let timeout: NodeJS.Timer | undefined = undefined;

	let webViewContent = `<!DOCTYPE html>
		<html lang="en">
		<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<title>Gradient Preview</title>
		</head>
		<body>
				<div
					id="gradient-preview"
					style="
						width: 100vw;
						height: 100vh;
						background: red;
					"
				></div>

				<script>
					window.addEventListener('message', event => {
						const message = event.data; // The JSON data our extension sent
						const gradient = message.gradient;
						document.getElementById('gradient-preview').style.background = gradient;
					});
			</script>
		</body>
		</html>
`;
	
	let currentPanel: vscode.WebviewPanel | undefined = undefined;
	
	async function renderWebview(args: { gradient?: string, document?: string }) {
		if (!args.gradient) {
			return;
		}

		if (args.document) {
			lastGradient.document = args.document;
			lastGradient.gradient = args.gradient;
		} else {
			lastGradient.document = undefined;
			lastGradient.gradient = undefined;
		}

		let gradient = '';
		try {
			const result = await postcss([presetEnv]).process(`body { background: ${args.gradient} }`, { from: 'gradient' });
			result.root.walkDecls(decl => {
				if (decl.prop === 'background') {
					gradient = decl.value;
				}
			});
		} catch (_) {
			return;
		}

		if (!gradient) {
			return;
		}

		if (currentPanel) {
			currentPanel.reveal(vscode.ViewColumn.Two, true);
			currentPanel.webview.postMessage({ gradient: gradient });
		} else {
			currentPanel = vscode.window.createWebviewPanel(
				'cssGradientsPreview',
				'CSS Gradients Preview',
				{
					viewColumn: vscode.ViewColumn.Two,
					preserveFocus: true,
				},
				{
					enableScripts: true,
				}
			);

			const updateWebview = () => {
				if (!currentPanel) {
					return;
				}
				currentPanel.webview.html = webViewContent;
			};

			// Set initial content
			updateWebview();
			currentPanel.webview.postMessage({ gradient: gradient });
			currentPanel.onDidDispose(
				() => {
					currentPanel = undefined;
				},
				undefined,
				context.subscriptions
			);
		}
	}

	context.subscriptions.push(
		vscode.commands.registerCommand('cssGradientsPreview.display', renderWebview)
	);

	// create a decorator type that we use to decorate small numbers
	const gradientDecorationType = vscode.window.createTextEditorDecorationType({
		light: {
			before: {
				border: '0.0625em solid black'
			}
		},
		dark: {
			before: {
				border: '0.0625em solid white'
			}
		},
		before: {
			width: '0.8em',
			height: '0.7em',
			margin: '0 0.1em 0 0.0625em',
		}
	});

	let activeEditor = vscode.window.activeTextEditor;

	async function updateDecorations() {
		if (!activeEditor) {
			return;
		}

		if (activeEditor.document?.languageId !== 'css') {
			return;
		}

		const gradientDecorations: vscode.DecorationOptions[] = [];

		const css = activeEditor.document.getText();

		let ast : Root | undefined = undefined;
		try {
			ast = postcss.parse(css, { from: 'css-gradient-preview' });
		} catch (_) {
			return;
		}
		if (!ast) {
			return;
		}

		// walk ast
		ast.walkDecls(decl => {
			if (!decl || !decl.source || !decl.source.start || !decl.source.end) {
				
				return;
			}

			try {
				const value = decl.value;
				const parsed = valueParser(value);
				const gradients: Array<Node> = [];
				parsed.walk((node: Node) => {
					if (node.type === 'function' && isGradientsFunctions(node.value)) {
						gradients.push(node);
					}
				});

				const startIndex = decl.toString().length - decl.value.length;

				gradients.forEach(gradient => {
					const gradientStr = valueParser.stringify(gradient);
					const gradientStart = decl.positionInside(startIndex + gradient.sourceIndex);
					const gradientEnd = decl.positionInside(startIndex + gradient.sourceIndex + gradientStr.length);
					
					const gradientRange = new vscode.Range(
						new vscode.Position(gradientStart.line - 1, gradientStart.column - 1),
						new vscode.Position(gradientEnd.line - 1, gradientEnd.column - 1)
					);

					const cmdUri = vscode.Uri.parse(
						`command:cssGradientsPreview.display?${encodeURIComponent(JSON.stringify({ gradient: gradientStr, document: activeEditor?.document.uri.toString() }))}`
					);

					const hover = new vscode.MarkdownString();
					hover.isTrusted = true;
					hover.appendMarkdown(`[Show Gradient](${cmdUri})`);
					const decoration = { range: gradientRange, hoverMessage: hover, renderOptions: { before: { contentText: '' } } };
					gradientDecorations.push(decoration);
				});

				if (lastGradient.gradient && lastGradient.document && (lastGradient.document === activeEditor?.document.uri.toString())) {
					const closestGradient = mostSimilar(
						lastGradient.gradient,
						gradients.map(gradient => valueParser.stringify(gradient))
					);

					if (closestGradient.mostSimilar && closestGradient.distance < 15) {
						renderWebview({ gradient: closestGradient.mostSimilar, document: activeEditor?.document.uri.toString() });
					}
				}
			} catch (_) {
				return;
			}
		});
		
		activeEditor.setDecorations(gradientDecorationType, gradientDecorations);
	}

	function triggerUpdateDecorations(throttle: boolean = false) {
		if (timeout) {
			clearTimeout(timeout);
			timeout = undefined;
		}
		if (throttle) {
			timeout = setTimeout(updateDecorations, 500);
		} else {
			updateDecorations();
		}
	}

	let debounce: NodeJS.Timeout|undefined = undefined;

	if (activeEditor) {
		if (debounce) {
			clearTimeout(debounce);
		}

		debounce = setTimeout(() => {
			triggerUpdateDecorations();
		}, 500);
	}
		
	vscode.window.onDidChangeActiveTextEditor(editor => {
		activeEditor = editor;
		if (editor) {
			if (debounce) {
				clearTimeout(debounce);
			}

			debounce = setTimeout(() => {
				triggerUpdateDecorations();
			}, 500);
		}
	}, null, context.subscriptions);

	vscode.workspace.onDidChangeTextDocument(event => {
		if (activeEditor && event.document === activeEditor.document) {
			if (debounce) {
				clearTimeout(debounce);
			}

			debounce = setTimeout(() => {
				triggerUpdateDecorations();
			}, 500);
		}
	}, null, context.subscriptions);
}

// this method is called when your extension is deactivated
export function deactivate() {}

function isGradientsFunctions(str: string): boolean {
	return (
		str === 'conic-gradient' ||
		str === 'linear-gradient' ||
		str === 'radial-gradient' ||
		str === 'repeating-conic-gradient' ||
		str === 'repeating-linear-gradient' ||
		str === 'repeating-radial-gradient'
	);
}

function mostSimilar(a: string, b: Array<string>) {
	let mostSimilar = '';
	let leastDistance = Infinity;

	for (let j = 0; j < b.length; j++) {
		const distance = levenshteinDistance(a, b[j]);
		if (distance < leastDistance) {
			leastDistance = distance;
			mostSimilar = b[j];
		}
	}

	return {
		mostSimilar: mostSimilar,
		distance: leastDistance,
	};
}


function levenshteinDistance(s : string, t : string) {
	if (!s.length) {
		return t.length;
	}
	if (!t.length) {
		return s.length;
	}
	const arr = [];
	for (let i = 0; i <= t.length; i++) {
		arr[i] = [i];
		for (let j = 1; j <= s.length; j++) {
			arr[i][j] =
				i === 0
					? j
					: Math.min(
						arr[i - 1][j] + 1,
						arr[i][j - 1] + 1,
						arr[i - 1][j - 1] + (s[j - 1] === t[i - 1] ? 0 : 1),
					);
		}
	}
	return arr[t.length][s.length];
}
