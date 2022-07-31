# CSS Gradients Preview

Preview CSS gradients in VSCode with live updates.

## Features

Hover over a CSS gradient and click `Show Gradient`.

![Open the gradients preview](css/css-gradients-preview/images/preview-2.png)

Once shown the preview will update as you change code.
This is not very solid and you might need to click `Show Gradient` again to see the updated preview.

![Gradients will refresh automatically](css/css-gradients-preview/images/preview-1.png)

Uses [PostCSS Preset Env](https://github.com/csstools/postcss-plugins/tree/main/plugin-packs/postcss-preset-env) to preview color functions like `oklch` which are not yet supported by VSCode.

## Known Issues

Will not work with CSS variables.
This extension can not mimic your real HTML structure nor your full CSS code.
Only self contained CSS gradients are supported.

```css
.a-gradient {
	background: conic-gradient(
		from 0.25turn,
		var(--some-color),
		10deg,
		#3f87a6,
		var(--some-amount-of-degrees),
		#ebf8e1
	);
}
```

## 1.0.4

Prevent the preview from re-opening after manually closing it and then editing a gradient.

### 1.0.3

Various fixes.

### 1.0.0

Initial release
