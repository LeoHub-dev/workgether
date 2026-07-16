"use client";

import { useCallback, useEffect, useState } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getSelection,
  $isRangeSelection,
  FORMAT_TEXT_COMMAND,
  SELECTION_CHANGE_COMMAND,
  COMMAND_PRIORITY_CRITICAL,
  $createParagraphNode,
  $isRootOrShadowRoot,
} from "lexical";
import {
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  REMOVE_LIST_COMMAND,
  $isListNode,
} from "@lexical/list";
import {
  $createHeadingNode,
  $isHeadingNode,
  type HeadingTagType,
} from "@lexical/rich-text";
import { $setBlocksType } from "@lexical/selection";
import { $findMatchingParent, mergeRegister } from "@lexical/utils";

type Props = {
  canEdit: boolean;
};

export function Toolbar({ canEdit }: Props) {
  const [editor] = useLexicalComposerContext();
  const [bold, setBold] = useState(false);
  const [italic, setItalic] = useState(false);
  const [underline, setUnderline] = useState(false);
  const [blockType, setBlockType] = useState<string>("paragraph");

  const updateToolbar = useCallback(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return;
    setBold(selection.hasFormat("bold"));
    setItalic(selection.hasFormat("italic"));
    setUnderline(selection.hasFormat("underline"));

    const anchor = selection.anchor.getNode();
    let element =
      anchor.getKey() === "root"
        ? anchor
        : $findMatchingParent(anchor, (e) => {
            const parent = e.getParent();
            return parent !== null && $isRootOrShadowRoot(parent);
          });
    if (element === null) element = anchor.getTopLevelElementOrThrow();

    if ($isListNode(element)) {
      setBlockType(element.getListType());
    } else {
      const type = $isHeadingNode(element) ? element.getTag() : element.getType();
      setBlockType(type);
    }
  }, []);

  useEffect(() => {
    return mergeRegister(
      editor.registerUpdateListener(({ editorState }) => {
        editorState.read(() => updateToolbar());
      }),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          updateToolbar();
          return false;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
    );
  }, [editor, updateToolbar]);

  const formatHeading = (tag: HeadingTagType | "paragraph") => {
    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      if (tag === "paragraph") {
        $setBlocksType(selection, () => $createParagraphNode());
      } else {
        $setBlocksType(selection, () => $createHeadingNode(tag));
      }
    });
  };

  const btn = (active: boolean) =>
    `rounded px-2 py-1 text-sm font-medium transition ${
      active
        ? "bg-teal-800 text-white"
        : "bg-white text-stone-700 hover:bg-stone-100 border border-stone-200"
    } disabled:opacity-40 disabled:cursor-not-allowed`;

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-stone-200 bg-[#f7f4ef] px-3 py-2">
      <button
        type="button"
        disabled={!canEdit}
        className={btn(bold)}
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold")}
        aria-label="Bold"
      >
        <span className="font-bold">B</span>
      </button>
      <button
        type="button"
        disabled={!canEdit}
        className={btn(italic)}
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic")}
        aria-label="Italic"
      >
        <span className="italic">I</span>
      </button>
      <button
        type="button"
        disabled={!canEdit}
        className={btn(underline)}
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "underline")}
        aria-label="Underline"
      >
        <span className="underline">U</span>
      </button>
      <span className="mx-1 h-5 w-px bg-stone-300" />
      <button
        type="button"
        disabled={!canEdit}
        className={btn(blockType === "h1")}
        onClick={() => formatHeading("h1")}
      >
        H1
      </button>
      <button
        type="button"
        disabled={!canEdit}
        className={btn(blockType === "h2")}
        onClick={() => formatHeading("h2")}
      >
        H2
      </button>
      <button
        type="button"
        disabled={!canEdit}
        className={btn(blockType === "paragraph")}
        onClick={() => formatHeading("paragraph")}
      >
        ¶
      </button>
      <span className="mx-1 h-5 w-px bg-stone-300" />
      <button
        type="button"
        disabled={!canEdit}
        className={btn(blockType === "bullet")}
        onClick={() => {
          if (blockType === "bullet") {
            editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
          } else {
            editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
          }
        }}
      >
        • List
      </button>
      <button
        type="button"
        disabled={!canEdit}
        className={btn(blockType === "number")}
        onClick={() => {
          if (blockType === "number") {
            editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
          } else {
            editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
          }
        }}
      >
        1. List
      </button>
    </div>
  );
}
