import { ChangeSet, Text } from "@codemirror/state";
import type { ChangedRange } from "@lezer/common";
import { describe, expect, it } from "vitest";
import { TextDocument } from "vscode-languageserver-textdocument";
import { changedRange } from "../src/util";

describe("text document changes", () => {
  it("changed range", () => {
    const content = "<div>1</div>\n".repeat(3);

    const doc1 = TextDocument.create("file1", "", 1, content);
    const vchanges = [
      { range: { start: { line: 2, character: 5 }, end: { line: 2, character: 6 } }, text: "" },
      { range: { start: { line: 1, character: 5 }, end: { line: 1, character: 6 } }, text: "hello" },
      { range: { start: { line: 0, character: 8 }, end: { line: 0, character: 11 } }, text: "a" },
      { range: { start: { line: 0, character: 1 }, end: { line: 0, character: 4 } }, text: "a" },
    ];
    const vc = changedRange(doc1, vchanges);
    const doc2 = TextDocument.update(doc1, vchanges, 2);

    const text1 = Text.of(content.split("\n"));
    const cchanges = ChangeSet.of(
      [
        { from: 1, to: 4, insert: "a" },
        { from: 8, to: 11, insert: "a" },
        { from: 18, to: 19, insert: "hello" },
        { from: 31, to: 32 },
      ],
      text1.length,
    );
    const cc = codemirrorChanges(cchanges);
    const text2 = cchanges.apply(text1);

    expect(text2.toString()).eq(doc2.getText());
    expect(vc).eql(cc);
  });
});

function codemirrorChanges(changes: ChangeSet): ReadonlyArray<ChangedRange> {
  const ranges = new Array<ChangedRange>();
  changes.iterChangedRanges((fromA, toA, fromB, toB) => ranges.push({ fromA, toA, fromB, toB }));
  return ranges;
}
