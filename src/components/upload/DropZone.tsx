/**
 * The upload control: a drop target, a file picker, and an "Upload folder" button.
 * A drop of a folder is walked by collectFiles. The picker is a hidden input
 * so the same files can be chosen again after the value is cleared.
 */

import {
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent as ReactDragEvent,
} from "react";
import { collectFiles } from "@/data/ingest/readFiles";
import styles from "./DropZone.module.css";

type DropZoneProps = {
  /** "zone" is the empty-page target. "replace" is the one button on the hub. */
  variant: "zone" | "replace";
  disabled: boolean;
  /** Called with the files from a picker or a drop. Not called when the list is empty. */
  onFiles: (files: readonly File[]) => void;
};

/**
 * Renders the upload controls.
 * Input is the variant, whether a parse is already running, and onFiles.
 * The zone is a button, so Enter and Space open the picker.
 * A second drop is refused while disabled.
 */
export function DropZone({ variant, disabled, onFiles }: DropZoneProps) {
  const filesRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const depth = useRef(0);
  const [over, setOver] = useState(false);
  const [live, setLive] = useState("");
  const id = useId();
  const filesId = `${id}-files`;
  const folderId = `${id}-folder`;

  const openFiles = () => {
    if (disabled) return;
    filesRef.current?.click();
  };

  const openFolder = () => {
    if (disabled) return;
    folderRef.current?.click();
  };

  const onInput = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    // Copy first. The list is live, and clearing the input empties it.
    const files = input.files ? Array.from(input.files) : [];
    input.value = "";
    if (disabled || files.length === 0) return;
    setLive("");
    onFiles(files);
  };

  const onDragEnter = (event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (disabled) return;
    depth.current += 1;
    setOver(true);
    setLive("Release to upload.");
  };

  const onDragLeave = (event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault();
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) {
      setOver(false);
      setLive("");
    }
  };

  const onDragOver = (event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = disabled ? "none" : "copy";
  };

  const onDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault();
    depth.current = 0;
    setOver(false);
    setLive("");
    if (disabled) return;
    void takeDrop(event.dataTransfer);
  };

  const takeDrop = async (transfer: DataTransfer) => {
    try {
      const files = await collectFiles(transfer);
      if (files.length === 0) {
        setLive("No files were found in that drop.");
        return;
      }
      onFiles(files);
    } catch {
      setLive("Those files could not be opened.");
    }
  };

  const setFolderNode = (node: HTMLInputElement | null) => {
    folderRef.current = node;
    // Not in the React types. The attribute is what opens a folder picker.
    node?.setAttribute("webkitdirectory", "");
  };

  return (
    <div className={variant === "zone" ? styles.wrap : undefined}>
      {variant === "zone" ? (
        <div
          className={styles.zone}
          data-active={over && !disabled ? "true" : "false"}
          aria-disabled={disabled}
          onDragEnter={onDragEnter}
          onDragLeave={onDragLeave}
          onDragOver={onDragOver}
          onDrop={onDrop}
        >
          <button
            type="button"
            className={styles.zoneButton}
            onClick={openFiles}
            disabled={disabled}
            aria-disabled={disabled}
          >
            Drop files here, or choose files
          </button>
          <p className={styles.live} aria-live="polite">
            {live}
          </p>
        </div>
      ) : (
        <button
          type="button"
          className={styles.button}
          onClick={openFiles}
          disabled={disabled}
          aria-disabled={disabled}
        >
          Replace data
        </button>
      )}
      {variant === "zone" ? (
        <div className={styles.row}>
          <button
            type="button"
            className={styles.button}
            onClick={openFiles}
            disabled={disabled}
            aria-disabled={disabled}
          >
            Choose files
          </button>
          <button
            type="button"
            className={styles.button}
            onClick={openFolder}
            disabled={disabled}
            aria-disabled={disabled}
          >
            Upload folder
          </button>
        </div>
      ) : null}
      <label htmlFor={filesId} className={styles.clip}>
        Choose JSON or zip files
      </label>
      <input
        id={filesId}
        ref={filesRef}
        className={styles.clip}
        type="file"
        multiple
        accept=".json,.zip"
        tabIndex={-1}
        onChange={onInput}
      />
      <label htmlFor={folderId} className={styles.clip}>
        Upload a folder
      </label>
      <input
        id={folderId}
        ref={setFolderNode}
        className={styles.clip}
        type="file"
        multiple
        tabIndex={-1}
        onChange={onInput}
      />
    </div>
  );
}

