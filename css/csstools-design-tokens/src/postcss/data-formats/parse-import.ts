import valueParser from 'postcss-value-parser';
import { Token } from './base/token';
import { extractStyleDictionaryTokens } from './style-dictionary/style-dictionary';
import path from 'path';
import * as vscode from 'vscode';

function parseImport(statement: string): { filePath: string, format: string, conditions: Array<string> } {
	const importAST = valueParser(statement);

	const result = {
		filePath: '',
		format: 'standard',
		conditions: [] as Array<string>,
	};

	importAST.walk((node) => {
		if (node.type === 'function' && node.value === 'url') {
			result.filePath = node.nodes[0].value;
		}

		if (node.type === 'function' && node.value === 'format') {
			result.format = node.nodes[0].value;
		}

		if (node.type === 'function' && node.value === 'when') {
			result.conditions = node.nodes.filter((child) => {
				return child.type === 'string';
			}).map((child) => child.value);
		}
	});

	return result;
}

export async function tokensFromImport(sourceFilePath: string, statement: string, alreadyImported: Set<string>): Promise<{ filePath: string, tokens: Map<string, Token>, conditions: Array<string> }|false> {
	const { filePath, format, conditions } = parseImport(statement);

	const resolvedPath = path.resolve(path.dirname(sourceFilePath), filePath);
	if (alreadyImported.has(resolvedPath)) {
		return false;
	}

	alreadyImported.add(resolvedPath);

	const fileContents = await vscode.workspace.fs.readFile(vscode.Uri.file(resolvedPath));
	const tokenContents = JSON.parse(fileContents.toString());

	switch (format) {
		case 'style-dictionary3':
			return {
				filePath: path.resolve(filePath),
				tokens: extractStyleDictionaryTokens('3', tokenContents, resolvedPath),
				conditions: conditions,
			};

		default:
			break;
	}

	throw new Error('Unsupported format: ' + format);
}
