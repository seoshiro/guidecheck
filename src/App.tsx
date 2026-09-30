import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCheck,
  ChevronRight,
  CircleAlert,
  Clock3,
  FileCheck2,
  FilePlus2,
  GitCompareArrows,
  History,
  LoaderCircle,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";
import {
  compare,
  counts,
  latestReview,
  parseImport,
  validateScreenshot,
  wordDiff,
  type Guide,
  type GuideInput,
  type Review,
  type Screenshot,
  type Step,
  type Version,
  type Workspace,
} from "./core.ts";
import {
  browserMode,
  browserRequest,
  basePath,
  exportBrowserGuide,
} from "./browser-store.ts";
import BackupDialog from "./BackupDialog.tsx";

type Mode = "review" | "history";
type Filter = "attention" | "all" | "unreviewed" | "tested" | "needs_update";
const formatDate = (s: string) =>
  new Date(s).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }) + " UTC";
const statusLabel = (s?: string) =>
  s === "tested"
    ? "Tested"
    : s === "needs_update"
      ? "Needs update"
      : "Not reviewed";
function Badge({ status, children }: { status: string; children: ReactNode }) {
  return <span className={`badge ${status}`}>{children}</span>;
}
function Empty({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="empty">
      <BookOpen size={32} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!;
    const focus = document.activeElement as HTMLElement | null;
    d.showModal();
    return () => {
      d.close();
      focus?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        if (
          e.target === e.currentTarget &&
          (e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom)
        )
          close();
      }}
      aria-labelledby="dialog-title"
    >
      <div className="modal-head">
        <h2 id="dialog-title">{title}</h2>
        <button
          className="icon-button"
          onClick={close}
          aria-label="Close dialog"
        >
          <X />
        </button>
      </div>
      {children}
    </dialog>
  );
}
async function request(path: string, value?: unknown): Promise<Workspace> {
  if (browserMode) return browserRequest(path, value);
  const r = await fetch(
    path,
    value
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(value),
        }
      : undefined,
  );
  if (!r.ok) {
    const b = await r.json().catch(() => ({}));
    throw new Error(
      b.error ??
        "The workspace is unavailable. Check that the local server is running.",
    );
  }
  return r.json();
}
function ExportLink({
  workspace,
  guide,
  version,
  format,
  children,
}: {
  workspace: Workspace;
  guide: Guide;
  version: Version;
  format: "markdown" | "json" | "report";
  children: ReactNode;
}) {
  return (
    <a
      href={
        browserMode
          ? "#"
          : `/api/guides/${guide.id}/export?format=${format}&version=${version.id}`
      }
      onClick={(e) => {
        if (browserMode) {
          e.preventDefault();
          exportBrowserGuide(workspace, guide.id, version.id, format);
        }
      }}
    >
      {children}
    </a>
  );
}
function DiffPanel({
  step,
  other,
  side,
  version,
}: {
  step?: Step;
  other?: Step;
  side: "before" | "after";
  version?: Version;
}) {
  const tokens = wordDiff(
    side === "before" ? (step?.text ?? "") : (other?.text ?? ""),
    side === "after" ? (step?.text ?? "") : (other?.text ?? ""),
  );
  return (
    <section
      className={`diff-panel ${side}`}
      aria-label={
        side === "before" ? "Previous instructions" : "Current instructions"
      }
    >
      <div className="panel-label">
        <span className="dot" />
        {side === "before" ? "PREVIOUS" : "CURRENT"}
        <span>
          {version ? `Version ${version.number}` : "No prior version"}
        </span>
      </div>
      {step ? (
        <>
          <h3>{step.title}</h3>
          <div className="instruction-text">
            {tokens
              .filter((t) =>
                side === "before" ? t.type !== "add" : t.type !== "remove",
              )
              .map((t, i) =>
                t.type === "same" ? (
                  <span key={i}>{t.text}</span>
                ) : side === "before" ? (
                  <del key={i}>{t.text}</del>
                ) : (
                  <ins key={i}>{t.text}</ins>
                ),
              )}
          </div>
          {step.links.length > 0 && (
            <div className="references">
              <span>REFERENCES</span>
              {step.links.map((l) => (
                <a key={l} href={l} target="_blank" rel="noreferrer">
                  {l}
                  <ArrowRight size={13} />
                </a>
              ))}
            </div>
          )}
          {step.screenshots.map((img) => (
            <figure key={img.name + img.dataUrl.slice(-32)}>
              <img src={img.dataUrl} alt={img.name} />
              <figcaption>{img.name}</figcaption>
            </figure>
          ))}
        </>
      ) : (
        <div className="absent">
          {side === "before"
            ? "This step was added in this version."
            : "This step was removed from this version."}
        </div>
      )}
    </section>
  );
}
function ImportDialog({
  guide,
  revision,
  done,
  close,
}: {
  guide?: Guide;
  revision: number;
  done: (s: Workspace, id: string) => void;
  close: () => void;
}) {
  const [format, setFormat] = useState<"markdown" | "json">("markdown");
  const [source, setSource] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<GuideInput>();
  const current = guide?.versions.at(-1);
  async function file(f?: File) {
    if (!f) return;
    setError("");
    setPreview(undefined);
    if (f.size > 5_000_000) {
      setError("Choose a file smaller than 5 MB.");
      return;
    }
    if (!/\.(json|md|markdown)$/i.test(f.name)) {
      setError("Choose a .md, .markdown, or .json guide.");
      return;
    }
    setFormat(f.name.endsWith(".json") ? "json" : "markdown");
    setSource(await f.text());
  }
  function validate(e: FormEvent) {
    e.preventDefault();
    try {
      setPreview(parseImport(source, format));
      setError("");
    } catch (e) {
      setError((e as Error).message);
      setPreview(undefined);
    }
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      const s = await request(
        guide ? `/api/guides/${guide.id}/versions` : "/api/guides",
        {
          source,
          format,
          note,
          baseVersionId: current?.id,
          expectedRevision: revision,
        },
      );
      done(s, guide?.id ?? s.guides.at(-1)!.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={guide ? "Import a revised guide" : "Import your first version"}
      close={close}
    >
      <p className="muted">
        {guide
          ? "Compare an updated document with the current version. Changed steps return to review."
          : "Bring an existing guide into your local review workspace."}
      </p>
      <form onSubmit={validate}>
        <div className="form-row">
          <label>
            Format
            <select
              aria-label="Format"
              value={format}
              onChange={(e) => {
                setFormat(e.target.value as typeof format);
                setPreview(undefined);
              }}
            >
              <option value="markdown">Markdown</option>
              <option value="json">Structured JSON</option>
            </select>
          </label>
          <label className="file-label">
            Or choose a file
            <input
              type="file"
              accept=".md,.markdown,.json"
              onChange={(e) => void file(e.target.files?.[0])}
            />
          </label>
        </div>
        <label>
          Guide content
          <textarea
            className="import-source"
            required
            value={source}
            onChange={(e) => {
              setSource(e.target.value);
              setPreview(undefined);
            }}
            placeholder={
              format === "markdown"
                ? "# Guide title\nOwner: Support\n\n## Step title\n<!-- step:stable-id -->\nInstructions go here."
                : '{"title":"My guide","owner":"Support","steps":[{"id":"open","title":"Open settings","text":"Choose Settings."}]}'
            }
          />
        </label>
        {guide && (
          <label>
            Version note
            <input
              required
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What changed, and where did the update come from?"
            />
          </label>
        )}
        <details className="format-help">
          <summary>Import rules & privacy</summary>
          <p>
            Markdown uses one # title and ## headings for steps. Keep{" "}
            <code>&lt;!-- step:stable-id --&gt;</code> in each step when
            revising or reordering. Without IDs, steps match by position. Links
            must use HTTP(S). Images must be embedded PNG, JPEG, or WebP; remote
            images are rejected. No files or links are fetched or uploaded.
          </p>
          <p>
            JSON uses title, owner, description, and steps with id, title, text,
            links, and optional screenshots: {"{name, dataUrl}"}. Up to 100
            steps, 3 images per step, 500 KB per image, and 5 MB per import.
          </p>
          <a href={`${basePath}fixtures/example.md`} download>
            Download Markdown example
          </a>
          <a href={`${basePath}fixtures/example.json`} download>
            Download JSON example
          </a>
        </details>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {preview && (
          <div className="import-preview">
            <FileCheck2 size={22} />
            <div>
              <strong>{preview.title}</strong>
              <p>
                {preview.steps.length} steps ·{" "}
                {preview.owner || "Unassigned owner"}
                {current &&
                  ` · ${compare(current.steps, preview.steps).filter((c) => c.kind !== "unchanged").length} step changes`}
              </p>
            </div>
          </div>
        )}
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={close}>
            Cancel
          </button>
          <button className="button secondary" type="submit">
            Check import
          </button>
          <button
            className="button"
            type="button"
            onClick={() => void save()}
            disabled={!preview || busy || (!!guide && !note.trim())}
          >
            {busy ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <Upload size={16} />
            )}
            {guide ? "Create version" : "Import guide"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function EditDialog({
  guide,
  step,
  revision,
  done,
  close,
}: {
  guide: Guide;
  step: Step;
  revision: number;
  done: (s: Workspace, id: string) => void;
  close: () => void;
}) {
  const v = guide.versions.at(-1)!;
  const [title, setTitle] = useState(step.title);
  const [text, setText] = useState(step.text);
  const [links, setLinks] = useState(step.links.join("\n"));
  const [owner, setOwner] = useState(v.owner);
  const [guideTitle, setGuideTitle] = useState(v.title);
  const [description, setDescription] = useState(v.description);
  const [images, setImages] = useState<Screenshot[]>(step.screenshots);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function image(f?: File) {
    if (!f) return;
    setError("");
    if (f.size > 500_000 || images.length >= 3) {
      setError("Use up to 3 screenshots, each smaller than 500 KB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const img = validateScreenshot({
          name: f.name,
          dataUrl: reader.result,
        });
        setImages((prev) => [...prev, img]);
      } catch (e) {
        setError((e as Error).message);
      }
    };
    reader.onerror = () => setError("The screenshot could not be read.");
    reader.readAsDataURL(f);
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const input = {
        title: guideTitle,
        owner,
        description,
        steps: v.steps.map((s) =>
          s.id === step.id
            ? {
                ...s,
                title,
                text,
                links: links
                  .split("\n")
                  .map((l) => l.trim())
                  .filter(Boolean),
                screenshots: images,
              }
            : s,
        ),
      };
      const s = await request(`/api/guides/${guide.id}/versions`, {
        source: JSON.stringify(input),
        format: "json",
        note,
        baseVersionId: v.id,
        expectedRevision: revision,
      });
      done(s, guide.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Correct this step" close={close}>
      <p className="muted">
        Save a new version with your correction. Review evidence stays with the
        version it was recorded against.
      </p>
      <form onSubmit={(e) => void save(e)}>
        <label>
          Step title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={200}
          />
        </label>
        <label>
          Instructions
          <textarea
            aria-label="Instructions"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            maxLength={20000}
          />
        </label>
        <label>
          Reference links (one per line)
          <textarea
            value={links}
            onChange={(e) => setLinks(e.target.value)}
            rows={2}
          />
        </label>
        <div className="image-editor">
          <label>
            Attach screenshot
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => {
                void image(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          {images.map((img, i) => (
            <div key={i}>
              <img src={img.dataUrl} alt={img.name} />
              <span>{img.name}</span>
              <button
                type="button"
                className="icon-button"
                aria-label={`Remove ${img.name}`}
                onClick={() => setImages(images.filter((_, j) => i !== j))}
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
        <details>
          <summary>Guide title, ownership & context</summary>
          <label>
            Guide title
            <input
              required
              maxLength={160}
              value={guideTitle}
              onChange={(e) => setGuideTitle(e.target.value)}
            />
          </label>
          <label>
            Owner
            <input
              maxLength={100}
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
            />
          </label>
          <label>
            Guide context
            <textarea
              maxLength={2000}
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
        </details>
        <label>
          Version note
          <input
            required
            value={note}
            maxLength={500}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Explain the correction and its source"
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={close}>
            Cancel
          </button>
          <button type="submit" className="button" disabled={busy}>
            {busy ? (
              <LoaderCircle size={16} className="spin" />
            ) : (
              <Check size={16} />
            )}
            Save corrected version
          </button>
        </div>
      </form>
    </Modal>
  );
}
function ReviewForm({
  guide,
  step,
  revision,
  done,
}: {
  guide: Guide;
  step: Step;
  revision: number;
  done: (s: Workspace) => void;
}) {
  const [status, setStatus] = useState<Review["status"]>("tested");
  const [reviewer, setReviewer] = useState("");
  const [context, setContext] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      done(
        await request(`/api/guides/${guide.id}/reviews`, {
          versionId: guide.versions.at(-1)!.id,
          stepId: step.id,
          status,
          reviewer,
          context,
          note,
          expectedRevision: revision,
        }),
      );
      setNote("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="review-form" onSubmit={(e) => void save(e)}>
      <div className="review-form-head">
        <div>
          <h3>Record your review</h3>
          <p>
            Follow the step in your own environment, then record what you
            observed.
          </p>
        </div>
        <ShieldCheck size={26} />
      </div>
      <fieldset className="status-options">
        <legend className="sr-only">Review outcome</legend>
        <label className={status === "tested" ? "chosen" : ""}>
          <input
            type="radio"
            name="outcome"
            checked={status === "tested"}
            onChange={() => setStatus("tested")}
          />
          <CheckCheck size={16} />
          Tested
        </label>
        <label className={status === "needs_update" ? "chosen warning" : ""}>
          <input
            type="radio"
            name="outcome"
            checked={status === "needs_update"}
            onChange={() => setStatus("needs_update")}
          />
          <CircleAlert size={16} />
          Needs update
        </label>
      </fieldset>
      <div className="form-row">
        <label>
          Reviewer
          <input
            value={reviewer}
            required
            maxLength={100}
            onChange={(e) => setReviewer(e.target.value)}
            placeholder="Your name"
          />
        </label>
        <label>
          Environment / evidence source
          <input
            value={context}
            required
            maxLength={500}
            onChange={(e) => setContext(e.target.value)}
            placeholder="e.g. Atlas staging, build 2.4"
          />
        </label>
      </div>
      <label>
        {status === "tested"
          ? "What did you test and observe?"
          : "What needs to change?"}
        <textarea
          value={note}
          required
          maxLength={2000}
          rows={3}
          onChange={(e) => setNote(e.target.value)}
          placeholder={
            status === "tested"
              ? "Record the action, outcome, and any limitations."
              : "Describe the mismatch and the correction needed."
          }
        />
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="review-actions">
        <span>
          <Clock3 size={13} />
          Timestamped when saved
        </span>
        <button className="button" disabled={busy}>
          {busy ? (
            <LoaderCircle className="spin" size={16} />
          ) : (
            <Check size={16} />
          )}
          Save review
        </button>
      </div>
    </form>
  );
}
export default function App() {
  const [workspace, setWorkspace] = useState<Workspace>();
  const [loadError, setLoadError] = useState("");
  const [guideId, setGuideId] = useState("");
  const [stepId, setStepId] = useState("");
  const [versionId, setVersionId] = useState("");
  const [baseId, setBaseId] = useState("");
  const [mode, setMode] = useState<Mode>("review");
  const [filter, setFilter] = useState<Filter>("attention");
  const [query, setQuery] = useState("");
  const [guideSearch, setGuideSearch] = useState("");
  const [modal, setModal] = useState<
    "new" | "revision" | "edit" | "backup" | null
  >(null);
  const [notice, setNotice] = useState("");
  async function load() {
    try {
      setWorkspace(await request("/api/workspace"));
      setLoadError("");
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  const guide =
    workspace?.guides.find((g) => g.id === guideId) ?? workspace?.guides[0];
  const current = guide?.versions.at(-1);
  const version = guide?.versions.find((v) => v.id === versionId) ?? current;
  const base =
    guide?.versions.find(
      (v) => v.id === baseId && v.number < (version?.number ?? 0),
    ) ?? guide?.versions.find((v) => v.number === (version?.number ?? 0) - 1);
  const changes = version ? compare(base?.steps ?? [], version.steps) : [];
  const filtered = changes.filter((c) => {
    const review =
      guide && version ? latestReview(guide, version, c.id) : undefined;
    return (
      (!query ||
        [
          c.before?.title,
          c.after?.title,
          c.before?.text,
          c.after?.text,
          c.id,
          ...c.reasons,
        ]
          .join(" ")
          .toLowerCase()
          .includes(query.toLowerCase())) &&
      (filter === "all" ||
        (filter === "attention"
          ? c.kind === "removed" || !review || review.status === "needs_update"
          : filter === "unreviewed"
            ? c.kind !== "removed" && !review
            : review?.status === filter))
    );
  });
  const selected = filtered.find((c) => c.id === stepId) ?? filtered[0];
  const review =
    guide && version && selected
      ? latestReview(guide, version, selected.id)
      : undefined;
  const totals = guide
    ? counts(guide)
    : { tested: 0, needs_update: 0, unreviewed: 0, total: 0 };
  const editable = version?.id === current?.id;
  function chooseGuide(id: string) {
    setGuideId(id);
    setVersionId("");
    setBaseId("");
    setStepId("");
    setQuery("");
    setFilter("attention");
    setMode("review");
  }
  function saved(s: Workspace, id: string) {
    setWorkspace(s);
    chooseGuide(id);
    setModal(null);
    setNotice("Version saved. Changed content is ready for human review.");
  }
  const allAttention =
    workspace?.guides.reduce(
      (n, g) => n + counts(g).unreviewed + counts(g).needs_update,
      0,
    ) ?? 0;
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to workspace
      </a>
      <div className="app-shell">
        <aside className="sidebar">
          <a className="brand" href={basePath}>
            <span>
              <CheckCheck size={25} />
            </span>
            GuideCheck<span className="brand-dot">.</span>
          </a>
          <div className="workspace-label">
            <span className="avatar">L</span>
            <div>
              {browserMode ? "Private browser" : "Local workspace"}
              <small>Documentation health</small>
            </div>
          </div>
          <nav aria-label="Workspace views">
            <button
              aria-pressed={mode === "review"}
              className={mode === "review" ? "nav active" : "nav"}
              onClick={() => setMode("review")}
            >
              <GitCompareArrows size={18} />
              Review workspace<span className="nav-count">{allAttention}</span>
            </button>
            <button
              aria-pressed={mode === "history"}
              className={mode === "history" ? "nav active" : "nav"}
              onClick={() => setMode("history")}
            >
              <History size={18} />
              Verification log
            </button>
          </nav>
          <div className="guide-library">
            <div className="section-label">
              YOUR GUIDES
              <button
                className="icon-button"
                aria-label="Import a new guide"
                onClick={() => setModal("new")}
                disabled={!workspace}
              >
                <Plus size={17} />
              </button>
            </div>
            <label className="rail-search">
              <Search size={15} />
              <input
                aria-label="Search guides"
                placeholder="Find a guide"
                value={guideSearch}
                onChange={(e) => setGuideSearch(e.target.value)}
              />
            </label>
            {workspace?.guides
              .filter((g) =>
                [g.versions.at(-1)!.title, g.versions.at(-1)!.owner]
                  .join(" ")
                  .toLowerCase()
                  .includes(guideSearch.toLowerCase()),
              )
              .map((g) => (
                <button
                  aria-current={guide?.id === g.id ? "true" : undefined}
                  className={`guide-link ${guide?.id === g.id ? "selected" : ""}`}
                  key={g.id}
                  onClick={() => chooseGuide(g.id)}
                >
                  <BookOpen size={16} />
                  <span>
                    {g.versions.at(-1)!.title}
                    <small>{g.versions.at(-1)!.owner || "Unassigned"}</small>
                  </span>
                  <ChevronRight size={13} />
                </button>
              ))}
            {workspace && !workspace.guides.length && (
              <p className="rail-empty">
                Your imported guides will appear here.
              </p>
            )}
            {workspace?.guides.length &&
            !workspace.guides.some((g) =>
              [g.versions.at(-1)!.title, g.versions.at(-1)!.owner]
                .join(" ")
                .toLowerCase()
                .includes(guideSearch.toLowerCase()),
            ) ? (
              <p className="rail-empty">No matching guides.</p>
            ) : null}
          </div>
          <div className="sidebar-footer">
            <span className="local-dot" />
            <div>
              {browserMode ? "Saved in this browser" : "Stored on this device"}
              <small>No account. No guide upload.</small>
            </div>
            <ShieldCheck size={17} />
          </div>
        </aside>
        <main id="main-content">
          <header className="topbar">
            <div>
              <span className="breadcrumb">
                Workspace
                <ChevronRight size={13} />
                {mode === "review" ? "Review" : "Verification log"}
              </span>
              <span className="local-pill">
                <span className="local-dot" />
                {browserMode ? "BROWSER ONLY" : "LOCAL ONLY"}
              </span>
            </div>
            <div className="topbar-actions">
              <button
                className="button secondary"
                onClick={() => setModal("backup")}
                disabled={!workspace}
              >
                <ArrowDownToLine size={15} />
                Backup & restore
              </button>
              <button
                className="button secondary"
                onClick={() => setModal("new")}
                disabled={!workspace}
              >
                <FilePlus2 size={16} />
                Import guide
              </button>
            </div>
          </header>
          {browserMode && (
            <div className="storage-notice" role="note">
              <ShieldCheck size={16} />
              <span>
                Private browser workspace. Export a backup before clearing
                browser data. Free portfolio tool with public source; no hosted
                team account.
              </span>
              <button
                className="text-button"
                onClick={() => setModal("backup")}
                disabled={!workspace}
              >
                Back up
              </button>
            </div>
          )}
          {loadError ? (
            <Empty title="Workspace unavailable">
              {loadError}
              <br />
              <button className="button" onClick={() => void load()}>
                Try again
              </button>
            </Empty>
          ) : !workspace ? (
            <div className="loading" role="status">
              <LoaderCircle className="spin" />
              Opening your workspace...
            </div>
          ) : !guide || !version ? (
            <Empty title="Good instructions deserve a second look.">
              Import a Markdown or JSON guide, then compare revisions and record
              what you have tested.
              <br />
              <button className="button" onClick={() => setModal("new")}>
                <Upload size={16} />
                Import a guide
              </button>
            </Empty>
          ) : (
            <>
              <section className="page-heading">
                <div>
                  <div className="eyebrow">
                    {mode === "review"
                      ? "KEEP YOUR KNOWLEDGE CURRENT"
                      : "EVIDENCE, WITH CONTEXT"}
                    {guide.sample && (
                      <Badge status="sample">SYNTHETIC DEMO</Badge>
                    )}
                  </div>
                  <h1>{version.title}</h1>
                  <p>{version.description}</p>
                  <div className="guide-meta">
                    <span className="owner-avatar">
                      {(version.owner || "?").slice(0, 1)}
                    </span>
                    {version.owner || "Unassigned owner"}
                    <span className="meta-separator" />
                    {version.steps.length} steps
                    <span className="meta-separator" />
                    Imported {formatDate(version.createdAt)}
                  </div>
                </div>
                <button className="button" onClick={() => setModal("revision")}>
                  <Upload size={16} />
                  Import revision
                </button>
              </section>
              <section
                className="metrics"
                aria-label="Current version review counts"
              >
                <button
                  onClick={() => {
                    setMode("review");
                    setVersionId("");
                    setFilter("attention");
                  }}
                >
                  <span className="metric-icon amber">
                    <CircleAlert size={21} />
                  </span>
                  <div>
                    <strong>
                      {totals.unreviewed + totals.needs_update}
                      <small>/{totals.total}</small>
                    </strong>
                    <span>Steps need attention</span>
                  </div>
                  <ArrowRight size={17} />
                </button>
                <button
                  onClick={() => {
                    setMode("review");
                    setVersionId("");
                    setFilter("tested");
                  }}
                >
                  <span className="metric-icon green">
                    <CheckCheck size={21} />
                  </span>
                  <div>
                    <strong>{totals.tested}</strong>
                    <span>Steps with test evidence</span>
                  </div>
                  <ArrowRight size={17} />
                </button>
                <button onClick={() => setMode("history")}>
                  <span className="metric-icon neutral">
                    <History size={21} />
                  </span>
                  <div>
                    <strong>{guide.versions.length}</strong>
                    <span>Versions preserved</span>
                  </div>
                  <ArrowRight size={17} />
                </button>
              </section>
              {notice && (
                <div className="notice" role="status">
                  <Check size={16} />
                  {notice}
                  <button
                    className="icon-button"
                    onClick={() => setNotice("")}
                    aria-label="Dismiss message"
                  >
                    <X size={16} />
                  </button>
                </div>
              )}
              <section className="workbench">
                <div className="workbench-header">
                  <div className="tabs" aria-label="Guide view">
                    <button
                      aria-pressed={mode === "review"}
                      className={mode === "review" ? "selected" : ""}
                      onClick={() => setMode("review")}
                    >
                      <GitCompareArrows size={16} />
                      Compare & review
                    </button>
                    <button
                      aria-pressed={mode === "history"}
                      className={mode === "history" ? "selected" : ""}
                      onClick={() => setMode("history")}
                    >
                      <History size={16} />
                      History
                    </button>
                  </div>
                  <details className="export-menu">
                    <summary>
                      <ArrowDownToLine size={15} />
                      Export
                    </summary>
                    <div>
                      <ExportLink
                        workspace={workspace}
                        guide={guide}
                        version={version}
                        format="markdown"
                      >
                        Guide · Markdown
                      </ExportLink>
                      <ExportLink
                        workspace={workspace}
                        guide={guide}
                        version={version}
                        format="json"
                      >
                        Guide · JSON
                      </ExportLink>
                      <ExportLink
                        workspace={workspace}
                        guide={guide}
                        version={version}
                        format="report"
                      >
                        Verification history · JSON
                      </ExportLink>
                    </div>
                  </details>
                </div>
                {mode === "history" ? (
                  <div className="history-view">
                    <div className="history-intro">
                      <h2>A record you can trace</h2>
                      <p>
                        Review statements are recorded by people. Carried
                        evidence keeps its original timestamp; it is not a new
                        test.
                      </p>
                    </div>
                    {[...guide.versions].reverse().map((v) => (
                      <section key={v.id} className="version-record">
                        <div className="version-mark">
                          <History size={16} />
                        </div>
                        <div>
                          <div className="version-title">
                            <h3>Version {v.number}</h3>
                            <Badge
                              status={
                                v.id === current?.id ? "tested" : "neutral"
                              }
                            >
                              {v.id === current?.id ? "Current" : "Preserved"}
                            </Badge>
                            <button
                              className="text-button"
                              onClick={() => {
                                setVersionId(v.id);
                                setBaseId("");
                                setMode("review");
                                setFilter("all");
                                setStepId("");
                              }}
                            >
                              View version
                              <ArrowRight size={14} />
                            </button>
                          </div>
                          <p>{v.note}</p>
                          <small>
                            {formatDate(v.createdAt)} ·{" "}
                            {v.owner || "Unassigned"} · {v.steps.length} steps
                          </small>
                          {guide.reviews.filter((r) => r.versionId === v.id)
                            .length ? (
                            <div className="review-records">
                              {[...guide.reviews]
                                .filter((r) => r.versionId === v.id)
                                .reverse()
                                .map((r) => (
                                  <article key={r.id}>
                                    <Badge status={r.status}>
                                      {statusLabel(r.status)}
                                    </Badge>
                                    <strong>
                                      {v.steps.find((s) => s.id === r.stepId)
                                        ?.title ?? r.stepId}
                                    </strong>
                                    <p>{r.note}</p>
                                    <small>
                                      {r.reviewer} · {r.context} ·{" "}
                                      {formatDate(r.createdAt)}
                                      {r.inheritedFrom &&
                                        ` · Carried from version ${guide.versions.find((x) => x.id === r.inheritedFrom)?.number ?? "?"}`}
                                    </small>
                                  </article>
                                ))}
                            </div>
                          ) : (
                            <p className="muted">
                              No review evidence recorded for this version.
                            </p>
                          )}
                        </div>
                      </section>
                    ))}
                  </div>
                ) : (
                  <>
                    <div className="comparison-toolbar">
                      <div className="version-picker">
                        <label>
                          Compare
                          <select
                            aria-label="Previous version"
                            value={base?.id ?? ""}
                            onChange={(e) => setBaseId(e.target.value)}
                            disabled={version.number === 1}
                          >
                            {!base && (
                              <option value="">No prior version</option>
                            )}
                            {guide.versions
                              .filter((v) => v.number < version.number)
                              .map((v) => (
                                <option key={v.id} value={v.id}>
                                  Version {v.number}
                                </option>
                              ))}
                          </select>
                        </label>
                        <ArrowRight size={16} />
                        <label>
                          with
                          <select
                            aria-label="Current version"
                            value={version.id}
                            onChange={(e) => {
                              setVersionId(e.target.value);
                              setBaseId("");
                              setStepId("");
                            }}
                          >
                            {guide.versions.map((v) => (
                              <option key={v.id} value={v.id}>
                                Version {v.number}
                                {v.id === current?.id ? " (current)" : ""}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <span className="change-count">
                        {changes.filter((c) => c.kind !== "unchanged").length}{" "}
                        changed steps<small>against selected version</small>
                      </span>
                    </div>
                    <div className="review-layout">
                      <aside
                        className="step-queue"
                        aria-label="Step review queue"
                      >
                        <div className="queue-top">
                          <h2>
                            Review queue<span>{filtered.length}</span>
                          </h2>
                          <label className="search">
                            <Search size={16} />
                            <input
                              aria-label="Search steps"
                              placeholder="Search steps or changes"
                              value={query}
                              onChange={(e) => setQuery(e.target.value)}
                            />
                          </label>
                          <select
                            aria-label="Filter steps"
                            value={filter}
                            onChange={(e) =>
                              setFilter(e.target.value as Filter)
                            }
                          >
                            <option value="attention">Needs attention</option>
                            <option value="all">All steps</option>
                            <option value="unreviewed">Not reviewed</option>
                            <option value="tested">Tested</option>
                            <option value="needs_update">Needs update</option>
                          </select>
                        </div>
                        <div className="step-items">
                          {filtered.map((c) => {
                            const r = latestReview(guide, version, c.id);
                            return (
                              <button
                                aria-pressed={selected?.id === c.id}
                                key={c.id}
                                className={`step-item ${selected?.id === c.id ? "selected" : ""}`}
                                onClick={() => setStepId(c.id)}
                              >
                                <span
                                  className={`step-number ${r?.status ?? c.kind}`}
                                >
                                  {c.kind === "removed" ? (
                                    <X size={14} />
                                  ) : r?.status === "tested" ? (
                                    <Check size={14} />
                                  ) : (
                                    c.afterIndex + 1
                                  )}
                                </span>
                                <span>
                                  <strong>
                                    {c.after?.title ?? c.before?.title}
                                  </strong>
                                  <small>
                                    {c.reasons.length
                                      ? c.reasons.join(" · ")
                                      : "No content changes"}
                                  </small>
                                  <Badge
                                    status={
                                      c.kind === "removed"
                                        ? "removed"
                                        : (r?.status ?? "unreviewed")
                                    }
                                  >
                                    {c.kind === "removed"
                                      ? "Removed"
                                      : statusLabel(r?.status)}
                                  </Badge>
                                </span>
                              </button>
                            );
                          })}
                          {!filtered.length && (
                            <div className="queue-empty">
                              <CheckCheck size={24} />
                              <strong>
                                {query
                                  ? "No matching steps"
                                  : "This queue is clear"}
                              </strong>
                              <p>
                                {query
                                  ? "Try another search or filter."
                                  : "Choose All steps to see the full guide."}
                              </p>
                              <button
                                className="text-button"
                                onClick={() => {
                                  setFilter("all");
                                  setQuery("");
                                }}
                              >
                                Show all steps
                                <ArrowRight size={14} />
                              </button>
                            </div>
                          )}
                        </div>
                        <p className="queue-foot">
                          <ShieldCheck size={14} />
                          Content changes signal a possible issue. Human review
                          decides the outcome.
                        </p>
                      </aside>
                      <div className="review-detail">
                        {selected ? (
                          <>
                            <div className="step-heading">
                              <div>
                                <div className="eyebrow">
                                  {selected.kind === "removed"
                                    ? "REMOVED STEP"
                                    : `STEP ${selected.afterIndex + 1} OF ${version.steps.length}`}
                                  <Badge status={selected.kind}>
                                    {selected.kind === "unchanged"
                                      ? "Unchanged"
                                      : selected.kind === "changed"
                                        ? "Content changed"
                                        : selected.kind === "added"
                                          ? "Added"
                                          : "Removed"}
                                  </Badge>
                                </div>
                                <h2>
                                  {selected.after?.title ??
                                    selected.before?.title}
                                </h2>
                                <p>
                                  {selected.reasons.length
                                    ? `Changes detected: ${selected.reasons.join(", ").toLowerCase()}. Review in your own environment.`
                                    : "No changes detected against this version. Prior evidence may still need a new test."}
                                </p>
                              </div>
                              {editable && selected.after && (
                                <button
                                  className="button secondary compact"
                                  onClick={() => setModal("edit")}
                                >
                                  <Pencil size={14} />
                                  Correct step
                                </button>
                              )}
                            </div>
                            <div className="diff-grid">
                              <DiffPanel
                                step={selected.before}
                                other={selected.after}
                                side="before"
                                version={base}
                              />
                              <DiffPanel
                                step={selected.after}
                                other={selected.before}
                                side="after"
                                version={version}
                              />
                            </div>
                            {review && (
                              <div className={`evidence ${review.status}`}>
                                <ShieldCheck size={20} />
                                <div>
                                  <strong>
                                    {statusLabel(review.status)} by{" "}
                                    {review.reviewer}
                                    {review.inheritedFrom &&
                                      " · Carried evidence"}
                                  </strong>
                                  <p>{review.note}</p>
                                  <small>
                                    {review.context} ·{" "}
                                    {formatDate(review.createdAt)}
                                    {review.inheritedFrom &&
                                      ` · Originally recorded against version ${guide.versions.find((v) => v.id === review.inheritedFrom)?.number}`}
                                  </small>
                                </div>
                              </div>
                            )}
                            {editable && selected.after ? (
                              <ReviewForm
                                key={`${guide.id}-${version.id}-${selected.id}`}
                                guide={guide}
                                step={selected.after}
                                revision={workspace.revision}
                                done={(s) => {
                                  setWorkspace(s);
                                  setNotice(
                                    "Review saved with your name, environment, and timestamp.",
                                  );
                                }}
                              />
                            ) : (
                              <div className="read-only">
                                <Clock3 size={17} />
                                {selected.kind === "removed"
                                  ? "Removal is recorded in version history. Only steps in the current guide can be tested."
                                  : "Preserved versions are read-only. Select the current version to record a review."}
                              </div>
                            )}
                            <div className="step-pagination">
                              <button
                                className="text-button"
                                disabled={filtered.indexOf(selected) === 0}
                                onClick={() =>
                                  setStepId(
                                    filtered[filtered.indexOf(selected) - 1].id,
                                  )
                                }
                              >
                                <ArrowLeft size={14} />
                                Previous step
                              </button>
                              <span>
                                {filtered.indexOf(selected) + 1} of{" "}
                                {filtered.length} in this queue
                              </span>
                              <button
                                className="text-button"
                                disabled={
                                  filtered.indexOf(selected) ===
                                  filtered.length - 1
                                }
                                onClick={() =>
                                  setStepId(
                                    filtered[filtered.indexOf(selected) + 1].id,
                                  )
                                }
                              >
                                Next step
                                <ArrowRight size={14} />
                              </button>
                            </div>
                          </>
                        ) : (
                          <Empty title="No steps in this view">
                            Adjust your search or choose another review filter.
                          </Empty>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </section>
              <footer className="main-footer">
                <ShieldCheck size={14} />
                Your evidence. Your judgment.
                <span>
                  GuideCheck records human review; it does not automatically
                  verify a procedure.
                </span>
                <button className="text-button" onClick={() => void load()}>
                  Refresh workspace
                </button>
              </footer>
            </>
          )}
        </main>
      </div>
      {workspace && modal && (
        <>
          {modal === "backup" ? (
            <Modal title="Backup & restore" close={() => setModal(null)}>
              <BackupDialog
                workspace={workspace}
                request={request}
                done={(s) => {
                  setWorkspace(s);
                  chooseGuide(s.guides[0]?.id ?? "");
                  setModal(null);
                  setNotice(
                    "Workspace restored. Original version and review timestamps were preserved.",
                  );
                }}
              />
            </Modal>
          ) : modal === "new" || modal === "revision" ? (
            <ImportDialog
              guide={modal === "revision" ? guide : undefined}
              revision={workspace.revision}
              done={saved}
              close={() => setModal(null)}
            />
          ) : (
            guide &&
            selected?.after && (
              <EditDialog
                guide={guide}
                step={selected.after}
                revision={workspace.revision}
                done={saved}
                close={() => setModal(null)}
              />
            )
          )}
        </>
      )}
    </>
  );
}
