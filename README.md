# css-class-intellisense

CSS Class 智能提示。

![demo](./resources/readme/demo.gif)

## Features

实时监测 HTML 文件，对引入的 CSS 文件进行智能提示，包括本地和远程文件。  
Watch HTML file in real time and give intellisense.

## Instructions

默认关闭远程 CSS 缓存，要开启该功能需要进行设置。  
Remote CSS Cache is off by default. You can enable it by setting "Remote CSSCache Path".

![setting](./resources/readme/setting.png)

## Release Notes

### 2.0.0

使用 **tree-sitter** ，实时监测文件更改。  
Use **tree-sitter** to watch file changes in real time.

### 1.1.0

提供远程css支持选项设置。  
Provide remote CSS support option setting.

### 1.0.0

将远程css文件下载到本地，提高提示的流畅度。  
Improve the fluency of Intellisense by download remote CSS files to local.

### 0.2.0

智能提示内嵌CSS。  
Class Intellisense for embedding CSS.

### 0.1.0

对外部引入的css文件提供class智能提示。  
Class Intellisense for linking CSS.
