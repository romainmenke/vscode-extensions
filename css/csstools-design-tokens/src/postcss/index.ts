import type { Node, PluginCreator, Plugin } from 'postcss';
import { Token } from './data-formats/base/token';
import { tokensFromImport } from './data-formats/parse-import';
import { mergeTokens } from './data-formats/token';

export interface PluginContainer {
	creator: Plugin;
	tokens(): Map<string, Token>;
	conditionalTokens(): Map<string, Map<string, Token>>;
	reset: () => void;
}

export type pluginOptions = {
	importAtRuleName: string,
	valueFunctionName: string,
};

export function pluginContainer(options: pluginOptions): PluginContainer {
	const data: {
		tokens: Map<string, Token>;
		conditionalTokens: Map<string, Map<string, Token>>;
		importedFiles: Set<string>;
	} = {
		tokens: new Map<string, Token>(),
		conditionalTokens: new Map<string, Map<string, Token>>(),
		importedFiles: new Set<string>(),
	};

	const creator: PluginCreator<unknown> = () => {
		return {
			postcssPlugin: 'postcss-design-tokens',
			Once: async (root, { result }) => {
				const designTokenAtRules: Array<{ filePath: string, params: string, node: Node }> = [];
				root.walkAtRules((atRule) => {
					if (atRule.name.toLocaleLowerCase() !== options.importAtRuleName) {
						return;
					}

					if (!atRule?.source?.input?.file) {
						return;
					}

					const filePath = atRule.source.input.file;
					const params = atRule.params;
					atRule.remove();

					designTokenAtRules.push({
						filePath: filePath,
						params: params,
						node: atRule,
					});
				});

				for (const atRule of designTokenAtRules.values()) {
					let importResult: { filePath: string, tokens: Map<string, Token>, conditions: Array<string> } | false;
					try {
						importResult = await tokensFromImport(atRule.filePath, atRule.params, data.importedFiles);
						if (!importResult) {
							continue;
						}
					} catch (e: unknown) {
						atRule.node.warn(result, `Failed to import design tokens from "${atRule.params}" with error:\n\t` + (e as Error).message);
						continue;
					}

					result.messages.push({
						type: 'dependency',
						plugin: 'postcss-design-tokens',
						file: importResult.filePath,
						parent: atRule.filePath,
					});

					if (importResult.conditions.length > 0) {
						const condition = importResult.conditions.join(' ');
						if (!data.conditionalTokens.has(condition)) {
							data.conditionalTokens.set(condition, new Map<string, Token>());
						}

						const conditionalTokens = data.conditionalTokens.get(condition)!;
						data.conditionalTokens.set(condition, mergeTokens(conditionalTokens, importResult.tokens));
						continue;
					}

					data.tokens = mergeTokens(data.tokens, importResult.tokens);
				}
			}
		};
	};

	creator.postcss = true;

	return {
		creator: creator() as Plugin,
		tokens: () => { 
			return data.tokens;
		},
		conditionalTokens: () => {
			return data.conditionalTokens;
		},
		reset: () => {
			data.tokens = new Map<string, Token>();
			data.importedFiles = new Set<string>();
			data.conditionalTokens = new Map<string, Map<string, Token>>();
		}
	};
}
