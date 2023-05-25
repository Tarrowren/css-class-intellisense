import { minimatch } from "minimatch";
import { CancellationTokenSource, Disposable, FileSystemWatcher, Uri, workspace } from "vscode";
import { HTTPS_SCHEME, HTTP_SCHEME, convertToHttpSchemeEx } from "./http-file-system";
import { RuntimeEnvironment, log } from "./runner";
import { emptySet } from "./util/empty";
import { notNull } from "./util/string";

export interface CssConfig extends Disposable {
  getGlobalCssFiles(uri: Uri): Promise<Set<string>>;
}

export function createCssConfig(runtime: RuntimeEnvironment): CssConfig {
  return new CssConfigImpl(runtime);
}

const CSS_CONFIG_FILE = "cssconfig.json";

class CssConfigImpl implements CssConfig {
  private watcher: FileSystemWatcher;
  private disposables: Disposable[];
  private promise: Promise<void> | null | undefined;
  private map = new Map<string, Options>();
  private source = new CancellationTokenSource();

  constructor(private runtime: RuntimeEnvironment) {
    this.watcher = workspace.createFileSystemWatcher(`**/${CSS_CONFIG_FILE}`);
    this.disposables = [
      this.watcher.onDidCreate(this.onDidChange, this),
      this.watcher.onDidChange(this.onDidChange, this),
      this.watcher.onDidDelete(this.onDidDelete, this),
    ];
    this.promise = this.findConfigFiles();
  }

  private async findConfigFiles() {
    try {
      if (this.runtime.isBrowser) {
        return;
      }

      const uris = await workspace.findFiles(
        `**/${CSS_CONFIG_FILE}`,
        "**/{node_modules,.*}/**",
        undefined,
        this.source.token
      );

      if (uris.length === 0) {
        return;
      }

      await Promise.all(uris.map(this.onDidChange, this));
    } catch (e) {
      log.error(e, "rebuild css config");
    } finally {
      this.promise = null;
    }
  }

  async getGlobalCssFiles(uri: Uri): Promise<Set<string>> {
    if (this.promise) {
      await this.promise;
    }

    const uriString = uri.toString(true);

    for (const options of this.map.values()) {
      if (options._cache.has(uriString)) {
        return options.globalCssFiles;
      }

      let include;
      if (options.include) {
        include = false;
        for (const pattern of options.include) {
          if (minimatch(uriString, pattern)) {
            include = true;
            break;
          }
        }
      } else {
        include = true;
      }

      if (include && options.exclude) {
        for (const pattern of options.exclude) {
          if (minimatch(uriString, pattern)) {
            include = false;
            break;
          }
        }
      }

      if (include) {
        options._cache.add(uriString);
        return options.globalCssFiles;
      }
    }

    return emptySet();
  }

  dispose() {
    this.source.cancel();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.watcher.dispose();
    this.map.clear();
  }

  private async onDidChange(uri: Uri) {
    const dir = Uri.joinPath(uri, "..");
    const dirString = dir.toString(true);

    try {
      const document = await workspace.openTextDocument(uri);

      const options = JSON.parse(document.getText());
      if (!isCssConfigOptions(options)) {
        this.map.delete(dirString);
        return;
      }

      const globalCssFiles = options.globalCssFiles
        .map((v) => {
          const uri = Uri.parse(v);
          if (uri.scheme === HTTP_SCHEME || uri.scheme === HTTPS_SCHEME) {
            return convertToHttpSchemeEx(uri).toString(true);
          } else if (uri.scheme === "file") {
            return Uri.joinPath(dir, uri.path).toString(true);
          } else {
            return;
          }
        })
        .filter(notNull);

      if (globalCssFiles.length === 0) {
        this.map.delete(dirString);
        return;
      }

      const include =
        options.include && options.include.length > 0
          ? options.include.map((v) => Uri.joinPath(dir, v).toString(true))
          : undefined;

      const exclude =
        options.exclude && options.exclude.length > 0
          ? options.exclude.map((v) => Uri.joinPath(dir, v).toString(true))
          : undefined;

      this.map.set(dirString, {
        globalCssFiles: new Set(globalCssFiles),
        include,
        exclude,
        _cache: new Set(),
      });
    } catch (e) {
      this.map.delete(dirString);
      log.error(e, "css config");
    }
  }

  private onDidDelete(uri: Uri) {
    const dirString = Uri.joinPath(uri, "..").toString(true);

    this.map.delete(dirString);
  }
}

export interface CssConfigOptions {
  globalCssFiles: string[];
  include?: string[];
  exclude?: string[];
}

interface Options {
  globalCssFiles: Set<string>;
  include?: string[];
  exclude?: string[];

  _cache: Set<string>;
}

function isCssConfigOptions(value: unknown): value is CssConfigOptions {
  if (!value) {
    return false;
  }

  if (typeof value !== "object") {
    return false;
  }

  // TODO ajv

  return true;
}
