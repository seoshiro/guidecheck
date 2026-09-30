import { useRef, useState } from "react";
import { ArrowDownToLine, Upload } from "lucide-react";
import { type Workspace } from "./core.ts";
import { parseWorkspaceBackup } from "./workspace.ts";
import { browserMode, downloadBrowserBackup } from "./browser-store.ts";
export default function BackupDialog({
  workspace,
  request,
  done,
}: {
  workspace: Workspace;
  request: (path: string, value?: unknown) => Promise<Workspace>;
  done: (s: Workspace) => void;
}) {
  const [source, setSource] = useState("");
  const [preview, setPreview] = useState<Workspace>();
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [savedBackup, setSavedBackup] = useState(false);
  const selection = useRef(0);
  async function choose(f?: File) {
    const generation = ++selection.current;
    setPreview(undefined);
    setSource("");
    setConfirmed(false);
    setError("");
    if (!f) return;
    if (f.size > 50_000_000) {
      setError("Choose a backup smaller than 50 MB.");
      return;
    }
    try {
      const content = await f.text();
      if (generation !== selection.current) return;
      const parsed = parseWorkspaceBackup(content);
      setPreview(parsed);
      setSource(content);
      setConfirmed(false);
    } catch (e) {
      if (generation !== selection.current) return;
      setError((e as Error).message);
    }
  }
  async function restore() {
    setBusy(true);
    setError("");
    try {
      done(
        await request("/api/workspace/restore", {
          source,
          expectedRevision: workspace.revision,
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="backup-panel">
      <p className="muted">
        {browserMode
          ? "Guides, screenshots, versions and reviews stay in this browser profile. Clearing site data, private browsing, device loss or browser eviction can remove them. Browser storage is shared with other sites on this same origin."
          : "The local workspace uses SQLite on this device."}{" "}
        Keep a complete backup on your own device. Backups contain your private
        guide content; they are not encrypted.
      </p>
      <button
        className="button secondary"
        onClick={() => {
          if (browserMode) downloadBrowserBackup(workspace);
          else {
            const a = document.createElement("a");
            a.href = "/api/workspace/export";
            a.download = "guidecheck-workspace.json";
            a.click();
          }
          setSavedBackup(true);
        }}
      >
        <ArrowDownToLine size={16} />
        Download complete backup
      </button>
      <div className="backup-divider" />
      <h3>Restore a workspace</h3>
      <p className="muted">
        Restoring replaces this workspace. It preserves the backup’s original
        versions, notes and review timestamps. Download your current backup
        first.
      </p>
      <label>
        GuideCheck workspace backup
        <input
          type="file"
          accept=".json,application/json"
          disabled={busy}
          onChange={(e) => void choose(e.target.files?.[0])}
        />
      </label>
      {preview && (
        <div className="import-preview">
          <strong>
            {preview.guides.length} guides ·{" "}
            {preview.guides.reduce((n, g) => n + g.versions.length, 0)} versions
            · {preview.guides.reduce((n, g) => n + g.reviews.length, 0)} review
            entries
          </strong>
        </div>
      )}
      <label className="restore-confirm">
        <input
          type="checkbox"
          checked={confirmed}
          disabled={!preview || busy}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        I have saved a current backup and want to replace this workspace.
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <span className="muted">
          {savedBackup
            ? "Backup download requested. Confirm it is saved before restoring."
            : "Download a backup before replacing data."}
        </span>
        <button
          className="button"
          disabled={!preview || !confirmed || busy}
          onClick={() => void restore()}
        >
          <Upload size={16} />
          {busy ? "Restoring..." : "Restore workspace"}
        </button>
      </div>
    </div>
  );
}
