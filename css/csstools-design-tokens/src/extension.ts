import * as vscode from 'vscode';
import postcss from 'postcss';
import { PluginContainer, pluginContainer } from './postcss/index';

const log = vscode.window.createOutputChannel("CSSTools Design Tokens");

export function activate(context: vscode.ExtensionContext) {
	const tokensData: Map<string, PluginContainer> = new Map();

	{
		if (vscode.window?.activeTextEditor?.document?.languageId === 'css') {
			handleCSSDocument(tokensData, vscode.window.activeTextEditor.document);
		}
	}

	context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(async (document: vscode.TextDocument) => {
		if (document.languageId !== 'css') {
			return;
		}

		handleCSSDocument(tokensData, document);
	}));

	context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor((editor) => {
		if (!editor) {
			return;
		}

		if (editor.document.languageId !== 'css') {
			return;
		}

		handleCSSDocument(tokensData, editor.document);
	}));

	context.subscriptions.push(vscode.languages.registerCompletionItemProvider('css', {
		async provideCompletionItems(document, position, cancelToken) {
			const tokens = tokensData.get(document.uri.fsPath);
			if (!tokens) {
				return;
			}

			const completionItems: Array<vscode.CompletionItem> = [];

			{
				const completionItem = new vscode.CompletionItem('@design-tokens', vscode.CompletionItemKind.Snippet);
				completionItem.insertText = new vscode.SnippetString(
					"@design-tokens url('$1') format('${2:style-dictionary3}');$0"
				);
				completionItem.detail = 'Import design tokens';
				completionItems.push(completionItem);
			}

			{
				const completionItem = new vscode.CompletionItem('@design-tokens when', vscode.CompletionItemKind.Snippet);
				completionItem.insertText = new vscode.SnippetString(
					"@design-tokens url('$1') format('${2:style-dictionary3}') when('$3');$0"
				);
				completionItem.detail = 'Import design tokens conditionally';
				completionItems.push(completionItem);
			}

			for (const [tokenPath, token] of tokens.tokens().entries()) {
				const completionItem = new vscode.CompletionItem(tokenPath + ` ${token.cssValue()}`, vscode.CompletionItemKind.Variable);
				completionItem.insertText = `design-token('${tokenPath}')`;

				if (token.comment) {
					completionItem.documentation = new vscode.MarkdownString(token.comment);
				}

				completionItems.push(completionItem);
			}

			return completionItems;
		}
	}));

	context.subscriptions.push(vscode.languages.registerHoverProvider('css', {
		provideHover(document, position) {
			const tokens = tokensData.get(document.uri.fsPath);
			if (!tokens) {
				return;
			}

			const line = document.lineAt(position.line).text;
			for (const [tokenPath, token] of tokens.tokens().entries()) {
				const tokenPathInCSS = `'${tokenPath}'`;
				let index = line.indexOf(tokenPathInCSS);
				if (index === -1) {
					continue;
				}

				let conditionalTokensTable = '';
				for (const [condition, conditionalTokens] of tokens.conditionalTokens().entries()) {
					const conditionalToken = conditionalTokens.get(tokenPath);
					if (conditionalToken && conditionalToken.cssValue() !== token.cssValue()) {
						conditionalTokensTable += `| ${condition} | [${conditionalToken.cssValue()}](${vscode.Uri.file(conditionalToken.metadata?.filePath ?? '')}) |\n`;
					}
				}

				if (conditionalTokensTable) {
					conditionalTokensTable = `| when | |\n|:--- | ---:|\n| default | [${token.cssValue()}](${vscode.Uri.file(token.metadata?.filePath ?? '')}) |\n${conditionalTokensTable}`;
				}

				let tokenRange = new vscode.Range(position.line, index, position.line, index + tokenPathInCSS.length);
				if (tokenRange.contains(position)) {
					return new vscode.Hover(new vscode.MarkdownString(
						[
							`Token: ${token.name}`,
							`_${tokenPath}_`,
							token.cssValue(),
							token.comment,
							conditionalTokensTable
						].filter(x => !!x).join('\n\n')
					));
				}
			}
		}
	}));
}

// this method is called when your extension is deactivated
export function deactivate() {}

async function handleCSSDocument(tokensData: Map<string, PluginContainer>, document: vscode.TextDocument) {
	const css = document.getText();
	const documentPlugin = tokensData.has(document.uri.fsPath) ? tokensData.get(document.uri.fsPath)! : (tokensData.set(document.uri.fsPath, pluginContainer()), tokensData.get(document.uri.fsPath)!);
	documentPlugin.reset();

	try {
		await postcss([documentPlugin.creator]).process(css, { from: document.uri.fsPath }).then((result) => {
			result.messages.forEach((x) => {
				if (x.type === 'dependency') {
					return;
				}

				log.appendLine(`${x.type}: ${x.plugin} - ${x.text}`);
			});
		});
	} catch (e) {
		log.appendLine(`error:\n\t` + (e as Error).message);
		return;
	}
}
