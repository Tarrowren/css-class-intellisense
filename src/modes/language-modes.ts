import { CompletionItem, CompletionList, Disposable, Position, TextDocument } from "vscode";
import { RuntimeEnvironment } from "../runner";
import { createHtmlMode } from "./html-mode";

export function createLanguageModes(runtime: RuntimeEnvironment): LanguageModes {
  const modes = new Map<string, LanguageMode>();

  const html = createHtmlMode(runtime);
  modes.set(html.id, html);

  return {
    getMode(languageId) {
      return modes.get(languageId);
    },
    onDocumentRemoved(document) {
      const mode = modes.get(document.languageId);

      if (!mode) {
        return;
      }

      mode.onDocumentRemoved(document);
    },
    dispose() {
      for (const mode of modes.values()) {
        mode.dispose();
      }
      modes.clear();
    },
  };
}

export interface LanguageModes extends Disposable {
  getMode(languageId: string): LanguageMode | undefined;
  onDocumentRemoved(document: TextDocument): void;
}

export interface LanguageMode extends Disposable {
  readonly id: string;
  doComplete?(
    document: TextDocument,
    position: Position
  ): Promise<CompletionList | CompletionItem[] | null | undefined>;
  // doResolve?(document: TextDocument, item: CompletionItem): Promise<CompletionItem>;
  // findDefinition?(document: TextDocument, position: Position): Promise<Location[] | null | undefined>;
  // findReferences?(document: TextDocument, position: Position): Promise<Location[] | null | undefined>;
  // doRename?(document: TextDocument, position: Position, newName: string): Promise<WorkspaceEdit | null | undefined>;
  onDocumentRemoved(document: TextDocument): void;
}
