# css-class-intellisense

[![Build Status](https://dev.azure.com/tarrowren/css-class-intellisense/_apis/build/status/Tarrowren.css-class-intellisense?branchName=master)](https://dev.azure.com/tarrowren/css-class-intellisense/_build/latest?definitionId=1&branchName=master)

Html/Vue/Jsx/PHP id/class attribute completion

## Features

- Html/Vue/Jsx/PHP id/class attribute completion (Include Vue/Jsx imported CSS/SCSS/LESS file)

  **the official VUE plugin has implemented CSS intellisense, use this configuration item `"cssci.languages.vue": false` if there is a conflict.**

- Jump to definition or reference
- Rename (May conflict with other extensions, cannot currently be resolved, use with care)
- Limited language support for web extensions ([issues](https://github.com/microsoft/vscode-test-web/issues/4))

## Usage

### Global

Create the `cssconfig.json` file to specify global CSS:

```json
{
  "globalCssFiles": ["https://getbootstrap.com/docs/5.2/dist/css/bootstrap.css", "../main.css"]
}
```

Using the `include` and `exclude` properties:

```json
{
  "globalCssFiles": ["https://getbootstrap.com/docs/5.2/dist/css/bootstrap.css", "../main.css"],
  "include": ["**/*.{vue,tsx}"],
  "exclude": ["**/*.html"]
}
```

### Embed

```html
<!doctype html>
<html>
  <head>
    <style>
      .hello {
      }
    </style>
  </head>
  <body>
    <div class="hello"></div>
  </body>
</html>
```

```vue
<template>
  <div class="hello"></div>
</template>

<style>
.hello {
}
</style>
```

### Link

```html
<!doctype html>
<html>
  <head>
    <link rel="stylesheet" href="https://getbootstrap.com/docs/5.2/dist/css/bootstrap.css" />
  </head>
  <body>
    <div class="accordion"></div>
  </body>
</html>
```

### Import

```jsx
import "./App.scss";

export default function App() {
  return <div className="hello"></div>;
}
```

```vue
<template>
  <div class="hello"></div>
</template>

<script>
import "./App.css";
</script>
```
