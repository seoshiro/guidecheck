import { t, errorText, count } from "./i18n.ts";
import { useEffect, useRef, useState } from "react";
import { ArrowDownToLine, Upload } from "lucide-react";
import { type Workspace } from "./core.ts";
import { MAX_BACKUP_BYTES, parseWorkspaceBackup } from "./workspace.ts";
import {
  browserMode,
  download,
  downloadBrowserBackup,
} from "./browser-store.ts";

type Operation = "download" | "restore" | "refresh";
const message = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "The workspace action could not be completed.";
export default function BackupDialog({
  workspace,
  request,
  done,
  onBusy,
}: {
  workspace: Workspace;
  request: (path: string, value?: unknown) => Promise<Workspace>;
  done: (s: Workspace) => void;
  onBusy?: (busy: boolean) => void;
}) {
  const [source, setSource] = useState("");
  const [preview, setPreview] = useState<Workspace>();
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [operation, setOperation] = useState<Operation | null>(null);
  const [reading, setReading] = useState(false);
  const [savedBackup, setSavedBackup] = useState(false);
  const [expectedRevision, setExpectedRevision] = useState(workspace.revision);
  const [notice, setNotice] = useState("");
  const selection = useRef(0);
  const operationRef = useRef<Operation | null>(null);
  const readingRef = useRef(false);
  const mounted = useRef(true);
  const busy = operation !== null;
  const pending = busy || reading;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      selection.current++;
    };
  }, []);

  function begin(next: Operation): boolean {
    if (operationRef.current || readingRef.current) return false;
    operationRef.current = next;
    setOperation(next);
    setError("");
    onBusy?.(true);
    return true;
  }

  function finish() {
    operationRef.current = null;
    if (!mounted.current) return;
    setOperation(null);
    onBusy?.(false);
  }

  async function choose(f?: File) {
    if (operationRef.current) return;
    const generation = ++selection.current;
    readingRef.current = false;
    setReading(false);
    setPreview(undefined);
    setSource("");
    setConfirmed(false);
    setError("");
    setNotice("");
    if (!f) return;
    if (f.size > MAX_BACKUP_BYTES) {
      setError("Choose a backup smaller than 50 MB.");
      return;
    }
    readingRef.current = true;
    setReading(true);
    try {
      const content = await f.text();
      if (generation !== selection.current) return;
      const parsed = parseWorkspaceBackup(content);
      setPreview(parsed);
      setSource(content);
      setConfirmed(false);
    } catch (error) {
      if (generation !== selection.current) return;
      setError(message(error));
    } finally {
      if (generation === selection.current) {
        readingRef.current = false;
        setReading(false);
      }
    }
  }

  async function saveBackup() {
    if (!begin("download")) return;
    setSavedBackup(false);
    try {
      if (browserMode) await downloadBrowserBackup();
      else {
        const response = await fetch("/api/workspace/export");
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error ?? "The backup could not be downloaded.");
        }
        const content = await response.text();
        parseWorkspaceBackup(content);
        download(content, "guidecheck-workspace.json");
      }
      if (mounted.current) setSavedBackup(true);
    } catch (error) {
      if (mounted.current) setError(message(error));
    } finally {
      finish();
    }
  }

  async function refresh() {
    if (!preview || !begin("refresh")) return;
    setConfirmed(false);
    try {
      const latest = await request("/api/workspace");
      if (!mounted.current) return;
      setExpectedRevision(latest.revision);
      setNotice(
        "Workspace refreshed. Your selected backup is unchanged. Review its preview and confirm replacement again.",
      );
    } catch (error) {
      if (mounted.current) setError(message(error));
    } finally {
      finish();
    }
  }

  async function restore() {
    if (!preview || !confirmed || !begin("restore")) return;
    setNotice("");
    try {
      const restored = await request("/api/workspace/restore", {
        source,
        expectedRevision,
      });
      if (mounted.current) done(restored);
    } catch (error) {
      if (mounted.current) {
        setConfirmed(false);
        setError(message(error));
      }
    } finally {
      finish();
    }
  }
  return (
    <div className="backup-panel">
      <p className="muted">
        {browserMode
          ? t(
              "Guides, screenshots, versions and reviews stay in this browser profile. Clearing site data, private browsing, device loss or browser eviction can remove them. Browser storage is shared with other sites on this same origin.",
            )
          : t("The local workspace uses SQLite on this device.")}{" "}
        {t(
          "Keep a complete backup on your own device. Backups contain your private guide content; they are not encrypted.",
        )}
      </p>
      <button
        className="button secondary"
        disabled={pending}
        onClick={() => void saveBackup()}
      >
        <ArrowDownToLine size={16} />
        {operation === "download"
          ? t("Preparing backup...")
          : t("Download complete backup")}
      </button>
      <div className="backup-divider" />
      <h3>{t("Restore a workspace")}</h3>
      <p className="muted">
        {t(
          "Restoring replaces this workspace. It preserves the backup’s original versions, notes and review timestamps. Download your current backup first.",
        )}
      </p>
      <label>
        {t("GuideCheck workspace backup")}
        <input
          type="file"
          accept=".json,application/json"
          disabled={busy}
          onChange={(e) => void choose(e.target.files?.[0])}
        />
      </label>
      {reading && (
        <p className="muted" role="status">
          {t("Reading and checking backup...")}
        </p>
      )}
      {preview && (
        <div className="import-preview">
          <strong>
            {count("guides", preview.guides.length)} ·{" "}
            {count(
              "versions",
              preview.guides.reduce((n, g) => n + g.versions.length, 0),
            )}{" "}
            ·{" "}
            {count(
              "reviews",
              preview.guides.reduce((n, g) => n + g.reviews.length, 0),
            )}
          </strong>
        </div>
      )}
      <label className="restore-confirm">
        <input
          type="checkbox"
          checked={confirmed}
          disabled={!preview || pending}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        {t("I have saved a current backup and want to replace this workspace.")}
      </label>
      {notice && (
        <p className="notice" role="status">
          {t(notice)}
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {errorText(error)}
        </p>
      )}
      <div className="modal-actions">
        <span className="muted">
          {savedBackup
            ? t(
                "Backup download requested. Confirm it is saved before restoring.",
              )
            : t("Download a backup before replacing data.")}
        </span>
        <button
          className="button secondary"
          disabled={!preview || pending}
          onClick={() => void refresh()}
        >
          {operation === "refresh"
            ? t("Refreshing...")
            : t("Refresh workspace")}
        </button>
        <button
          className="button"
          disabled={!preview || !confirmed || pending}
          onClick={() => void restore()}
        >
          <Upload size={16} />
          {operation === "restore" ? t("Restoring...") : t("Restore workspace")}
        </button>
      </div>
    </div>
  );
}
