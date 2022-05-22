export interface TokenTransformOptions {
	pluginOptions?: {
		rootFontSize?: number;
	};
	toUnit?: string;
}

export interface Token {
	name?: string;
	comment?: string;
	cssValue(opts?: TokenTransformOptions): string
	metadata?: {
		filePath: string
	}
}
