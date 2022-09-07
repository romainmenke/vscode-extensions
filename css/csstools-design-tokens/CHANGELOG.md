# Change Log

### 1.2.0

- Added support for design token file imports from npm packages.

npm package : `@your-org/your-tokens`

```json
{
	"font-size": 0.2
}
```

```css
@design-tokens url(node_modules://@your-org/your-tokens/tokens.json) format('style-dictionary3');

.example {
	font-size: design-token('font-size');
}
```

## 1.1.0

- Added `designTokens.valueFunctionName` option to control the design-token function name.
- Added `designTokens.importAtRuleName` option to control the design-tokens at-rule name.

```json
  "designTokens.importAtRuleName": "gimme-tokens",
  "designTokens.valueFunctionName": "token"
```

## 1.0.2

- Various improvements to completion item triggers.

## 1.0.0

- Initial release
