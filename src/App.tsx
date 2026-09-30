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
import { ConflictError } from "./workspace.ts";
import { download } from "./browser-store.ts";
import {
  t,
  errorText,
  date,
  count,
  number,
  useLanguage,
  setLanguage,
  type Language,
} from "./i18n.ts";

type Mode = "review" | "history";
type Filter = "attention" | "all" | "unreviewed" | "tested" | "needs_update";
const formatDate = date;
const statusLabel = (s?: string) =>
  s === "tested"
    ? t("Tested")
    : s === "needs_update"
      ? t("Needs update")
      : t("Not reviewed");
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
function LanguagePicker() {
  const language = useLanguage();
  const [warning, setWarning] = useState(false);
  return (
    <label className="language-picker">
      <span>{t("Language")}</span>
      <select
        aria-label={t("Language")}
        value={language}
        onChange={(e) => setWarning(!setLanguage(e.target.value as Language))}
      >
        <option value="en" lang="en">
          {t("English")}
        </option>
        <option value="ru" lang="ru">
          Русский
        </option>
        <option value="kk" lang="kk">
          Қазақша
        </option>
      </select>
      {warning && (
        <span className="preference-warning" role="status">
          {t(
            "Language preference could not be saved. It applies to this tab only.",
          )}
        </span>
      )}
    </label>
  );
}
function Modal({
  title,
  close,
  children,
  busy = false,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
  busy?: boolean;
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
        if (!busy) close();
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
          if (!busy) close();
      }}
      aria-labelledby="dialog-title"
      aria-busy={busy}
    >
      <div className="modal-head">
        <h2 id="dialog-title">{title}</h2>
        <LanguagePicker />
        <button
          className="icon-button"
          onClick={close}
          aria-label={t("Close dialog")}
          disabled={busy}
        >
          <X />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function ReviewHistoryList({
  guide,
  version,
}: {
  guide: Guide;
  version: Version;
}) {
  const [page, setPage] = useState(0);
  const entries = guide.reviews
    .filter((r) => r.versionId === version.id)
    .reverse();
  const pages = Math.ceil(entries.length / 25);
  const currentPage = Math.min(page, Math.max(0, pages - 1));
  if (!entries.length)
    return (
      <p className="muted">
        {t("No review evidence recorded for this version.")}
      </p>
    );
  return (
    <div className="review-records">
      <p className="history-count">{count("reviews", entries.length)}</p>
      {entries.slice(currentPage * 25, currentPage * 25 + 25).map((r) => (
        <article key={r.id}>
          <Badge status={r.status}>{statusLabel(r.status)}</Badge>
          <strong>
            {version.steps.find((s) => s.id === r.stepId)?.title ?? r.stepId}
          </strong>
          <p>{r.note}</p>
          <small>
            {r.reviewer} · {r.context} · {formatDate(r.createdAt)}
            {r.inheritedFrom && (
              <>
                {" "}
                ·{" "}
                {t("Carried from version {number}", {
                  number:
                    guide.versions.find((x) => x.id === r.inheritedFrom)
                      ?.number ?? "?",
                })}
              </>
            )}
          </small>
        </article>
      ))}
      {pages > 1 && (
        <div className="step-pagination history-pagination">
          <button
            className="text-button"
            disabled={currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
          >
            {t("Previous page")}
          </button>
          <span>
            {t("Page {number} of {total}", {
              number: currentPage + 1,
              total: pages,
            })}
          </span>
          <button
            className="text-button"
            disabled={currentPage + 1 >= pages}
            onClick={() => setPage(currentPage + 1)}
          >
            {t("Next page")}
          </button>
        </div>
      )}
    </div>
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
    if (r.status === 409)
      throw new ConflictError(
        b.error ??
          t("The workspace changed in another tab. Refresh and try again."),
      );
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
        side === "before"
          ? t("Previous instructions")
          : t("Current instructions")
      }
    >
      <div className="panel-label">
        <span className="dot" />
        {side === "before" ? t("PREVIOUS") : t("CURRENT")}
        <span>
          {version
            ? t("Version {number}", { number: version.number })
            : t("No prior version")}
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
              <span>{t("REFERENCES")}</span>
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
            ? t("This step was added in this version.")
            : t("This step was removed from this version.")}
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
  const [current, setCurrent] = useState(guide?.versions.at(-1));
  const [expectedRevision, setExpectedRevision] = useState(revision);
  const [reading, setReading] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [info, setInfo] = useState("");
  const readGeneration = useRef(0);
  const saving = useRef(false);
  async function file(f?: File) {
    const generation = ++readGeneration.current;
    setReading(false);
    setSource("");
    setPreview(undefined);
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
    setFormat(f.name.toLowerCase().endsWith(".json") ? "json" : "markdown");
    setReading(true);
    try {
      const content = await f.text();
      if (generation !== readGeneration.current) return;
      setSource(content);
      setPreview(undefined);
    } catch {
      if (generation === readGeneration.current)
        setError("The selected file could not be read.");
    } finally {
      if (generation === readGeneration.current) setReading(false);
    }
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
    if (saving.current || reading || !preview) return;
    saving.current = true;
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
          expectedRevision,
        },
      );
      done(s, guide?.id ?? s.guides.at(-1)!.id);
    } catch (e) {
      setError((e as Error).message);
      setConflict(e instanceof ConflictError);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  async function refreshDraft() {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    try {
      const next = await request("/api/workspace");
      if (guide) {
        const updated = next.guides.find((g) => g.id === guide.id);
        if (!updated) {
          setError(
            "This guide was removed or replaced in another tab. Download your draft before closing.",
          );
          return;
        }
        setCurrent(updated.versions.at(-1));
      }
      setExpectedRevision(next.revision);
      setPreview(undefined);
      setConflict(false);
      setError("");
      setInfo("Workspace refreshed. Check your draft again before saving.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  return (
    <Modal
      title={
        guide ? t("Import a revised guide") : t("Import your first version")
      }
      close={close}
      busy={busy}
    >
      <p className="muted">
        {guide
          ? t(
              "Compare an updated document with the current version. Changed steps return to review.",
            )
          : t("Bring an existing guide into your local review workspace.")}
      </p>
      <form onSubmit={validate} noValidate aria-busy={busy}>
        <fieldset disabled={busy} className="form-fields">
          <div className="form-row">
            <label>
              {t("Format")}
              <select
                aria-label={t("Format")}
                value={format}
                onChange={(e) => {
                  setFormat(e.target.value as typeof format);
                  setPreview(undefined);
                  ++readGeneration.current;
                  setReading(false);
                }}
              >
                <option value="markdown">Markdown</option>
                <option value="json">{t("Structured JSON")}</option>
              </select>
            </label>
            <label className="file-label">
              {t("Or choose a file")}
              <input
                type="file"
                accept=".md,.markdown,.json"
                onChange={(e) => void file(e.target.files?.[0])}
              />
            </label>
          </div>
          <label>
            {t("Guide content")}
            <textarea
              className="import-source"
              required
              value={source}
              onChange={(e) => {
                setSource(e.target.value);
                setPreview(undefined);
                ++readGeneration.current;
                setReading(false);
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
              {t("Version note")}
              <input
                required
                maxLength={500}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t(
                  "What changed, and where did the update come from?",
                )}
              />
            </label>
          )}
          <details className="format-help">
            <summary>{t("Import rules & privacy")}</summary>
            <p>
              {t("Markdown uses one # title and ## headings for steps. Keep")}{" "}
              <code>&lt;!-- step:stable-id --&gt;</code>{" "}
              {t(
                "in each step when revising or reordering. Without IDs, steps match by position. Links must use HTTP(S). Images must be embedded PNG, JPEG, or WebP; remote images are rejected. No files or links are fetched or uploaded.",
              )}
            </p>
            <p>
              {t(
                "JSON uses title, owner, description, and steps with id, title, text, links, and optional screenshots:",
              )}
              {"{name, dataUrl}"}
              {t(
                ". Up to 100 steps, 3 images per step, 500 KB per image, and 5 MB per import.",
              )}
            </p>
            <a href={`${basePath}fixtures/example.md`} download>
              {t("Download Markdown example")}
            </a>
            <a href={`${basePath}fixtures/example.json`} download>
              {t("Download JSON example")}
            </a>
          </details>
          {error && (
            <p className="form-error" role="alert">
              {errorText(error)}
            </p>
          )}
          {reading && (
            <p role="status" className="muted">
              {t("Reading file...")}
            </p>
          )}
          {info && (
            <p role="status" className="notice">
              {t(info)}
            </p>
          )}
          {conflict && (
            <div className="conflict-actions">
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => void refreshDraft()}
              >
                {t("Refresh and keep draft")}
              </button>
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  download(
                    source,
                    `guidecheck-draft.${format === "json" ? "json" : "md"}`,
                    format === "json" ? "application/json" : "text/markdown",
                  )
                }
              >
                {t("Download draft")}
              </button>
            </div>
          )}
          {preview && (
            <div className="import-preview">
              <FileCheck2 size={22} />
              <div>
                <strong>{preview.title}</strong>
                <p>
                  {count("steps", preview.steps.length)} ·{" "}
                  {preview.owner || t("Unassigned owner")}
                  {current &&
                    ` · ${count("changed steps", compare(current.steps, preview.steps).filter((c) => c.kind !== "unchanged").length)}`}
                </p>
              </div>
            </div>
          )}
          <div className="modal-actions">
            <button type="button" className="button secondary" onClick={close}>
              {t("Cancel")}
            </button>
            <button
              className="button secondary"
              type="submit"
              disabled={reading || busy}
            >
              {t("Check import")}
            </button>
            <button
              className="button"
              type="button"
              onClick={() => void save()}
              disabled={
                !preview || busy || reading || (!!guide && !note.trim())
              }
            >
              {busy ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <Upload size={16} />
              )}
              {busy
                ? t("Saving...")
                : guide
                  ? t("Create version")
                  : t("Import guide")}
            </button>
          </div>
        </fieldset>
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
  const [v, setVersion] = useState(guide.versions.at(-1)!);
  const [baseStep, setBaseStep] = useState(step);
  const [expectedRevision, setExpectedRevision] = useState(revision);
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
  const [reading, setReading] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [info, setInfo] = useState("");
  const imageReader = useRef<FileReader | null>(null);
  const saving = useRef(false);
  useEffect(() => () => imageReader.current?.abort(), []);
  async function image(f?: File) {
    if (!f || imageReader.current?.readyState === FileReader.LOADING) return;
    setError("");
    if (f.size > 500_000 || images.length >= 3) {
      setError("Use up to 3 screenshots, each smaller than 500 KB.");
      return;
    }
    const reader = new FileReader();
    imageReader.current = reader;
    setReading(true);
    reader.onload = () => {
      try {
        const img = validateScreenshot({
          name: f.name,
          dataUrl: reader.result,
        });
        setImages((prev) => [...prev, img]);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setReading(false);
      }
    };
    reader.onerror = () => {
      setReading(false);
      setError("The screenshot could not be read.");
    };
    reader.onabort = () => setReading(false);
    reader.readAsDataURL(f);
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (saving.current || reading || unavailable) return;
    saving.current = true;
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
        expectedRevision,
      });
      done(s, guide.id);
    } catch (e) {
      setError((e as Error).message);
      setConflict(e instanceof ConflictError);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  async function refreshDraft() {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    try {
      const next = await request("/api/workspace");
      const updated = next.guides
        .find((g) => g.id === guide.id)
        ?.versions.at(-1);
      const updatedStep = updated?.steps.find((s) => s.id === step.id);
      if (!updated || !updatedStep) {
        setUnavailable(true);
        setError(
          updated
            ? "This step was removed in another tab. Download your draft before closing."
            : "This guide was removed or replaced in another tab. Download your draft before closing.",
        );
        return;
      }
      if (title === baseStep.title) setTitle(updatedStep.title);
      if (text === baseStep.text) setText(updatedStep.text);
      if (links === baseStep.links.join("\n"))
        setLinks(updatedStep.links.join("\n"));
      if (JSON.stringify(images) === JSON.stringify(baseStep.screenshots))
        setImages(updatedStep.screenshots);
      if (owner === v.owner) setOwner(updated.owner);
      if (guideTitle === v.title) setGuideTitle(updated.title);
      if (description === v.description) setDescription(updated.description);
      setVersion(updated);
      setBaseStep(updatedStep);
      setExpectedRevision(next.revision);
      setConflict(false);
      setError("");
      setInfo(
        "Latest version loaded. Your edited fields were kept. Review them before saving.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  return (
    <Modal title={t("Correct this step")} close={close} busy={busy}>
      <p className="muted">
        {t(
          "Save a new version with your correction. Review evidence stays with the version it was recorded against.",
        )}
      </p>
      <form onSubmit={(e) => void save(e)} noValidate aria-busy={busy}>
        <fieldset disabled={busy} className="form-fields">
          <label>
            {t("Step title")}
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={200}
            />
          </label>
          <label>
            {t("Instructions")}
            <textarea
              aria-label={t("Instructions")}
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={5}
              maxLength={20000}
            />
          </label>
          <label>
            {t("Reference links (one per line)")}
            <textarea
              value={links}
              onChange={(e) => setLinks(e.target.value)}
              rows={2}
            />
          </label>
          <div className="image-editor">
            <label>
              {t("Attach screenshot")}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={reading}
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
                  aria-label={t("Remove {name}", { name: img.name })}
                  onClick={() => setImages(images.filter((_, j) => i !== j))}
                >
                  <X size={16} />
                </button>
              </div>
            ))}
            {reading && (
              <p role="status" className="muted">
                {t("Reading screenshot...")}
              </p>
            )}
          </div>
          <details>
            <summary>{t("Guide title, ownership & context")}</summary>
            <label>
              {t("Guide title")}
              <input
                required
                maxLength={160}
                value={guideTitle}
                onChange={(e) => setGuideTitle(e.target.value)}
              />
            </label>
            <label>
              {t("Owner")}
              <input
                maxLength={100}
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
              />
            </label>
            <label>
              {t("Guide context")}
              <textarea
                maxLength={2000}
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
          </details>
          <label>
            {t("Version note")}
            <input
              required
              value={note}
              maxLength={500}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("Explain the correction and its source")}
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {errorText(error)}
            </p>
          )}
          {info && (
            <p role="status" className="notice">
              {t(info)}
            </p>
          )}
          {conflict && (
            <div className="conflict-actions">
              <button
                type="button"
                className="button secondary"
                disabled={busy || reading}
                onClick={() => void refreshDraft()}
              >
                {t("Refresh and keep draft")}
              </button>
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  download(
                    JSON.stringify(
                      {
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
                      },
                      null,
                      2,
                    ),
                    "guidecheck-correction-draft.json",
                  )
                }
              >
                {t("Download draft")}
              </button>
            </div>
          )}
          <div className="modal-actions">
            <button type="button" className="button secondary" onClick={close}>
              {t("Cancel")}
            </button>
            <button
              type="submit"
              className="button"
              disabled={busy || reading || unavailable}
            >
              {busy ? (
                <LoaderCircle size={16} className="spin" />
              ) : (
                <Check size={16} />
              )}
              {busy ? t("Saving...") : t("Save corrected version")}
            </button>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
function ReviewForm({
  guide,
  step,
  revision,
  done,
  refreshed,
}: {
  guide: Guide;
  step: Step;
  revision: number;
  done: (s: Workspace) => void;
  refreshed: (s: Workspace) => void;
}) {
  const [status, setStatus] = useState<Review["status"]>("tested");
  const [reviewer, setReviewer] = useState("");
  const [context, setContext] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [expectedRevision, setExpectedRevision] = useState(revision);
  const [basisVersion, setBasisVersion] = useState(guide.versions.at(-1)!.id);
  const [retested, setRetested] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [info, setInfo] = useState("");
  const saving = useRef(false);
  const changedVersion = basisVersion !== guide.versions.at(-1)!.id;
  const latestVersionId = guide.versions.at(-1)!.id;
  useEffect(() => {
    // An empty form contains no assertion about the old version. A populated
    // draft remains tied to its original version until explicitly retested.
    if (!reviewer && !context && !note) {
      setBasisVersion(latestVersionId);
      setExpectedRevision(revision);
      setRetested(false);
    }
  }, [latestVersionId]);
  async function refreshDraft() {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    try {
      const fresh = await request("/api/workspace");
      const latest = fresh.guides.find((g) => g.id === guide.id);
      if (!latest) {
        setUnavailable(true);
        throw new Error(
          "This guide was removed or replaced in another tab. Download your draft before closing.",
        );
      }
      if (!latest.versions.at(-1)!.steps.some((s) => s.id === step.id)) {
        setUnavailable(true);
        throw new Error(
          "This step was removed in another tab. Download your draft before closing.",
        );
      }
      setExpectedRevision(fresh.revision);
      setRetested(false);
      setConflict(false);
      setError("");
      setInfo("Workspace refreshed. Check your draft again before saving.");
      refreshed(fresh);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (saving.current || unavailable || (changedVersion && !retested)) return;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await request(`/api/guides/${guide.id}/reviews`, {
        versionId: guide.versions.at(-1)!.id,
        stepId: step.id,
        status,
        reviewer,
        context,
        note,
        expectedRevision,
      });
      setExpectedRevision(result.revision);
      setBasisVersion(guide.versions.at(-1)!.id);
      setRetested(false);
      setInfo("");
      done(result);
      setNote("");
    } catch (e) {
      setError((e as Error).message);
      setConflict(e instanceof ConflictError);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  return (
    <form
      className="review-form"
      onSubmit={(e) => void save(e)}
      noValidate
      aria-busy={busy}
    >
      <fieldset disabled={busy} className="form-fields">
        <div className="review-form-head">
          <div>
            <h3>{t("Record your review")}</h3>
            <p>
              {t(
                "Follow the step in your own environment, then record what you observed.",
              )}
            </p>
          </div>
        </div>
        <fieldset className="status-options">
          <legend className="sr-only">{t("Review outcome")}</legend>
          <label className={status === "tested" ? "chosen" : ""}>
            <input
              type="radio"
              name="outcome"
              checked={status === "tested"}
              onChange={() => setStatus("tested")}
            />
            <Check size={16} />
            {t("Tested")}
          </label>
          <label className={status === "needs_update" ? "chosen warning" : ""}>
            <input
              type="radio"
              name="outcome"
              checked={status === "needs_update"}
              onChange={() => setStatus("needs_update")}
            />
            <CircleAlert size={16} />
            {t("Needs update")}
          </label>
        </fieldset>
        <div className="form-row">
          <label>
            {t("Reviewer")}
            <input
              value={reviewer}
              required
              maxLength={100}
              onChange={(e) => setReviewer(e.target.value)}
              placeholder={t("Your name")}
            />
          </label>
          <label>
            {t("Environment / evidence source")}
            <input
              value={context}
              required
              maxLength={500}
              onChange={(e) => setContext(e.target.value)}
              placeholder={t("e.g. Atlas staging, build 2.4")}
            />
          </label>
        </div>
        <label>
          {status === "tested"
            ? t("What did you test and observe?")
            : t("What needs to change?")}
          <textarea
            value={note}
            required
            maxLength={2000}
            rows={3}
            onChange={(e) => setNote(e.target.value)}
            placeholder={
              status === "tested"
                ? t("Record the action, outcome, and any limitations.")
                : t("Describe the mismatch and the correction needed.")
            }
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {errorText(error)}
          </p>
        )}
        {info && (
          <p className="notice" role="status">
            {t(info)}
          </p>
        )}
        {changedVersion && (
          <label className="restore-confirm">
            <input
              type="checkbox"
              checked={retested}
              onChange={(e) => setRetested(e.target.checked)}
            />
            {t("I have retested the current version.")}
            <span className="muted">
              {t(
                "A newer version exists. Retest the current step before saving this review.",
              )}
            </span>
          </label>
        )}
        {conflict && (
          <div className="conflict-actions">
            <button
              type="button"
              className="button secondary"
              onClick={() => void refreshDraft()}
            >
              {t("Refresh and keep draft")}
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() =>
                download(
                  JSON.stringify(
                    {
                      guideId: guide.id,
                      stepId: step.id,
                      basisVersion,
                      status,
                      reviewer,
                      context,
                      note,
                    },
                    null,
                    2,
                  ),
                  "guidecheck-review-draft.json",
                )
              }
            >
              {t("Download draft")}
            </button>
          </div>
        )}
        <div className="review-actions">
          <span>
            <Clock3 size={13} />
            {t("Timestamped when saved")}
          </span>
          <button
            className="button"
            disabled={busy || unavailable || (changedVersion && !retested)}
          >
            {busy ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <Check size={16} />
            )}
            {busy ? t("Saving...") : t("Save review")}
          </button>
        </div>
      </fieldset>
    </form>
  );
}
export default function App() {
  const language = useLanguage();
  useEffect(() => {
    document.title = t("GuideCheck · Review workspace");
  }, [language]);
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
  const [backupBusy, setBackupBusy] = useState(false);
  const [historyPage, setHistoryPage] = useState(0);
  function applyWorkspace(incoming: Workspace) {
    setWorkspace((current) =>
      !current || incoming.revision >= current.revision ? incoming : current,
    );
  }
  async function load() {
    try {
      applyWorkspace(await request("/api/workspace"));
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
  const historyPageIndex = Math.min(
    historyPage,
    Math.max(0, Math.ceil((guide?.versions.length ?? 0) / 5) - 1),
  );
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
    setHistoryPage(0);
    setGuideId(id);
    setVersionId("");
    setBaseId("");
    setStepId("");
    setQuery("");
    setFilter("attention");
    setMode("review");
  }
  function saved(s: Workspace, id: string) {
    applyWorkspace(s);
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
        {t("Skip to workspace")}
      </a>
      <div className="app-shell">
        <aside className="sidebar">
          <a className="brand" href={basePath}>
            <span>GC</span>
            GuideCheck<span className="brand-dot">.</span>
          </a>
          <div className="workspace-label">
            <div>
              {browserMode ? t("Private browser") : t("Local workspace")}
              <small>{t("Documentation health")}</small>
            </div>
          </div>
          <nav aria-label={t("Workspace views")}>
            <button
              aria-pressed={mode === "review"}
              className={mode === "review" ? "nav active" : "nav"}
              onClick={() => setMode("review")}
            >
              <GitCompareArrows size={18} />
              {t("Review workspace")}
              <span className="nav-count">{number(allAttention)}</span>
            </button>
            <button
              aria-pressed={mode === "history"}
              className={mode === "history" ? "nav active" : "nav"}
              onClick={() => setMode("history")}
            >
              <History size={18} />
              {t("Verification log")}
            </button>
          </nav>
          <div className="guide-library">
            <div className="section-label">
              {t("YOUR GUIDES")}
              <button
                className="icon-button"
                aria-label={t("Import a new guide")}
                onClick={() => setModal("new")}
                disabled={!workspace}
              >
                <Plus size={17} />
              </button>
            </div>
            <label className="rail-search">
              <Search size={15} />
              <input
                aria-label={t("Search guides")}
                placeholder={t("Find a guide")}
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
                    <small>{g.versions.at(-1)!.owner || t("Unassigned")}</small>
                  </span>
                  <ChevronRight size={13} />
                </button>
              ))}
            {workspace && !workspace.guides.length && (
              <p className="rail-empty">
                {t("Your imported guides will appear here.")}
              </p>
            )}
            {workspace?.guides.length &&
            !workspace.guides.some((g) =>
              [g.versions.at(-1)!.title, g.versions.at(-1)!.owner]
                .join(" ")
                .toLowerCase()
                .includes(guideSearch.toLowerCase()),
            ) ? (
              <p className="rail-empty">{t("No matching guides.")}</p>
            ) : null}
          </div>
          <div className="sidebar-footer">
            <span className="local-dot" />
            <div>
              {browserMode
                ? t("Saved in this browser")
                : t("Stored on this device")}
              <small>{t("No account. No guide upload.")}</small>
            </div>
          </div>
        </aside>
        <main id="main-content">
          <header className="topbar">
            <div>
              <span className="breadcrumb">
                {t("Workspace")}
                <ChevronRight size={13} />
                {mode === "review" ? t("Review") : t("Verification log")}
              </span>
              <span className="local-pill">
                <span className="local-dot" />
                {browserMode ? t("BROWSER ONLY") : t("LOCAL ONLY")}
              </span>
            </div>
            <div className="topbar-actions">
              <LanguagePicker />
              <button
                className="button secondary"
                onClick={() => setModal("backup")}
                disabled={!workspace}
              >
                <ArrowDownToLine size={15} />
                {t("Backup & restore")}
              </button>
              <button
                className="button secondary"
                onClick={() => setModal("new")}
                disabled={!workspace}
              >
                <FilePlus2 size={16} />
                {t("Import guide")}
              </button>
            </div>
          </header>
          {browserMode && (
            <div className="storage-notice" role="note">
              <span>
                {t(
                  "Private browser workspace. Export a backup before clearing browser data. Free portfolio tool with public source; no hosted team account.",
                )}
              </span>
              <button
                className="text-button"
                onClick={() => setModal("backup")}
                disabled={!workspace}
              >
                {t("Back up")}
              </button>
            </div>
          )}
          {loadError ? (
            <Empty title={t("Workspace unavailable")}>
              {errorText(loadError)}
              <br />
              <button className="button" onClick={() => void load()}>
                {t("Try again")}
              </button>
            </Empty>
          ) : !workspace ? (
            <div className="loading" role="status">
              <LoaderCircle className="spin" />
              {t("Opening your workspace...")}
            </div>
          ) : !guide || !version ? (
            <Empty title={t("Good instructions deserve a second look.")}>
              {t(
                "Import a Markdown or JSON guide, then compare revisions and record what you have tested.",
              )}
              <br />
              <button className="button" onClick={() => setModal("new")}>
                <Upload size={16} />
                {t("Import a guide")}
              </button>
            </Empty>
          ) : (
            <>
              <section className="page-heading">
                <div>
                  <div className="eyebrow">
                    {mode === "review"
                      ? t("KEEP YOUR KNOWLEDGE CURRENT")
                      : t("EVIDENCE, WITH CONTEXT")}
                    {guide.sample && (
                      <Badge status="sample">{t("SYNTHETIC DEMO")}</Badge>
                    )}
                  </div>
                  <h1>{version.title}</h1>
                  <p>{version.description}</p>
                  <div className="guide-meta">
                    <span className="owner-avatar">
                      {(version.owner || "?").slice(0, 1)}
                    </span>
                    {version.owner || t("Unassigned owner")}
                    <span className="meta-separator" />
                    {count("steps", version.steps.length)}
                    <span className="meta-separator" />
                    {t("Imported")} {formatDate(version.createdAt)}
                  </div>
                </div>
                <button className="button" onClick={() => setModal("revision")}>
                  <Upload size={16} />
                  {t("Import revision")}
                </button>
              </section>
              <section
                className="metrics"
                aria-label={t("Current version review counts")}
              >
                <button
                  onClick={() => {
                    setMode("review");
                    setVersionId("");
                    setFilter("attention");
                  }}
                >
                  <div>
                    <strong>
                      {number(totals.unreviewed + totals.needs_update)}
                      <small>/{number(totals.total)}</small>
                    </strong>
                    <span>{t("Steps need attention")}</span>
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
                  <div>
                    <strong>{number(totals.tested)}</strong>
                    <span>{t("Steps with test evidence")}</span>
                  </div>
                  <ArrowRight size={17} />
                </button>
                <button onClick={() => setMode("history")}>
                  <div>
                    <strong>{number(guide.versions.length)}</strong>
                    <span>{t("Versions preserved")}</span>
                  </div>
                  <ArrowRight size={17} />
                </button>
              </section>
              {notice && (
                <div className="notice" role="status">
                  <Check size={16} />
                  {t(notice)}
                  <button
                    className="icon-button"
                    onClick={() => setNotice("")}
                    aria-label={t("Dismiss message")}
                  >
                    <X size={16} />
                  </button>
                </div>
              )}
              <section className="workbench">
                <div className="workbench-header">
                  <div className="tabs" aria-label={t("Guide view")}>
                    <button
                      aria-pressed={mode === "review"}
                      className={mode === "review" ? "selected" : ""}
                      onClick={() => setMode("review")}
                    >
                      <GitCompareArrows size={16} />
                      {t("Compare & review")}
                    </button>
                    <button
                      aria-pressed={mode === "history"}
                      className={mode === "history" ? "selected" : ""}
                      onClick={() => setMode("history")}
                    >
                      <History size={16} />
                      {t("History")}
                    </button>
                  </div>
                  <details className="export-menu">
                    <summary>
                      <ArrowDownToLine size={15} />
                      {t("Export")}
                    </summary>
                    <div>
                      <ExportLink
                        workspace={workspace}
                        guide={guide}
                        version={version}
                        format="markdown"
                      >
                        {t("Guide · Markdown")}
                      </ExportLink>
                      <ExportLink
                        workspace={workspace}
                        guide={guide}
                        version={version}
                        format="json"
                      >
                        {t("Guide · JSON")}
                      </ExportLink>
                      <ExportLink
                        workspace={workspace}
                        guide={guide}
                        version={version}
                        format="report"
                      >
                        {t("Verification history · JSON")}
                      </ExportLink>
                    </div>
                  </details>
                </div>
                {mode === "history" ? (
                  <div className="history-view">
                    <div className="history-intro">
                      <h2>{t("A record you can trace")}</h2>
                      <p>
                        {t(
                          "Review statements are recorded by people. Carried evidence keeps its original timestamp; it is not a new test.",
                        )}
                      </p>
                    </div>
                    {[...guide.versions]
                      .reverse()
                      .slice(historyPageIndex * 5, historyPageIndex * 5 + 5)
                      .map((v) => (
                        <section key={v.id} className="version-record">
                          <div className="version-mark">
                            <History size={16} />
                          </div>
                          <div>
                            <div className="version-title">
                              <h3>
                                {t("Version {number}", { number: v.number })}
                              </h3>
                              <Badge
                                status={
                                  v.id === current?.id ? "tested" : "neutral"
                                }
                              >
                                {v.id === current?.id
                                  ? t("Current")
                                  : t("Preserved")}
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
                                {t("View version")}
                                <ArrowRight size={14} />
                              </button>
                            </div>
                            <p>{v.note}</p>
                            <small>
                              {formatDate(v.createdAt)} ·{" "}
                              {v.owner || t("Unassigned")} ·{" "}
                              {count("steps", v.steps.length)}
                            </small>
                            <ReviewHistoryList
                              key={v.id}
                              guide={guide}
                              version={v}
                            />
                          </div>
                        </section>
                      ))}
                    {guide.versions.length > 5 && (
                      <div className="step-pagination">
                        <button
                          className="text-button"
                          disabled={historyPageIndex === 0}
                          onClick={() => setHistoryPage(historyPageIndex - 1)}
                        >
                          {t("Previous page")}
                        </button>
                        <span>
                          {t("Page {number} of {total}", {
                            number: historyPageIndex + 1,
                            total: Math.ceil(guide.versions.length / 5),
                          })}
                        </span>
                        <button
                          className="text-button"
                          disabled={
                            (historyPageIndex + 1) * 5 >= guide.versions.length
                          }
                          onClick={() => setHistoryPage(historyPageIndex + 1)}
                        >
                          {t("Next page")}
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="comparison-toolbar">
                      <div className="version-picker">
                        <label>
                          {t("Compare")}
                          <select
                            aria-label={t("Previous version")}
                            value={base?.id ?? ""}
                            onChange={(e) => setBaseId(e.target.value)}
                            disabled={version.number === 1}
                          >
                            {!base && (
                              <option value="">{t("No prior version")}</option>
                            )}
                            {guide.versions
                              .filter((v) => v.number < version.number)
                              .map((v) => (
                                <option key={v.id} value={v.id}>
                                  {t("Version {number}", { number: v.number })}
                                </option>
                              ))}
                          </select>
                        </label>
                        <ArrowRight size={16} />
                        <label>
                          {t("with")}
                          <select
                            aria-label={t("Current version")}
                            value={version.id}
                            onChange={(e) => {
                              setVersionId(e.target.value);
                              setBaseId("");
                              setStepId("");
                            }}
                          >
                            {guide.versions.map((v) => (
                              <option key={v.id} value={v.id}>
                                {t("Version {number}", { number: v.number })}
                                {v.id === current?.id ? ` ${t("Current")}` : ""}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <span className="change-count">
                        {count(
                          "changed steps",
                          changes.filter((c) => c.kind !== "unchanged").length,
                        )}
                        <small>{t("against selected version")}</small>
                      </span>
                    </div>
                    <div className="review-layout">
                      <aside
                        className="step-queue"
                        aria-label={t("Step review queue")}
                      >
                        <div className="queue-top">
                          <h2>
                            {t("Review queue")}
                            <span>{number(filtered.length)}</span>
                          </h2>
                          <label className="search">
                            <Search size={16} />
                            <input
                              aria-label={t("Search steps")}
                              placeholder={t("Search steps or changes")}
                              value={query}
                              onChange={(e) => setQuery(e.target.value)}
                            />
                          </label>
                          <select
                            aria-label={t("Filter steps")}
                            value={filter}
                            onChange={(e) =>
                              setFilter(e.target.value as Filter)
                            }
                          >
                            <option value="attention">
                              {t("Needs attention")}
                            </option>
                            <option value="all">{t("All steps")}</option>
                            <option value="unreviewed">
                              {t("Not reviewed")}
                            </option>
                            <option value="tested">{t("Tested")}</option>
                            <option value="needs_update">
                              {t("Needs update")}
                            </option>
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
                                      ? c.reasons
                                          .map((reason) => t(reason))
                                          .join(" · ")
                                      : t("No content changes")}
                                  </small>
                                  <Badge
                                    status={
                                      c.kind === "removed"
                                        ? "removed"
                                        : (r?.status ?? "unreviewed")
                                    }
                                  >
                                    {c.kind === "removed"
                                      ? t("Removed")
                                      : statusLabel(r?.status)}
                                  </Badge>
                                </span>
                              </button>
                            );
                          })}
                          {!filtered.length && (
                            <div className="queue-empty">
                              <Check size={24} />
                              <strong>
                                {query
                                  ? t("No matching steps")
                                  : t("This queue is clear")}
                              </strong>
                              <p>
                                {query
                                  ? t("Try another search or filter.")
                                  : t(
                                      "Choose All steps to see the full guide.",
                                    )}
                              </p>
                              <button
                                className="text-button"
                                onClick={() => {
                                  setFilter("all");
                                  setQuery("");
                                }}
                              >
                                {t("Show all steps")}
                                <ArrowRight size={14} />
                              </button>
                            </div>
                          )}
                        </div>
                        <p className="queue-foot">
                          {t(
                            "Content changes signal a possible issue. Human review decides the outcome.",
                          )}
                        </p>
                      </aside>
                      <div className="review-detail">
                        {selected ? (
                          <>
                            <div className="step-heading">
                              <div>
                                <div className="eyebrow">
                                  {selected.kind === "removed"
                                    ? t("REMOVED STEP")
                                    : t("Step {number} of {total}", {
                                        number: selected.afterIndex + 1,
                                        total: version.steps.length,
                                      })}
                                  <Badge status={selected.kind}>
                                    {selected.kind === "unchanged"
                                      ? t("Unchanged")
                                      : selected.kind === "changed"
                                        ? t("Content changed")
                                        : selected.kind === "added"
                                          ? t("Added")
                                          : t("Removed")}
                                  </Badge>
                                </div>
                                <h2>
                                  {selected.after?.title ??
                                    selected.before?.title}
                                </h2>
                                <p>
                                  {selected.reasons.length
                                    ? t(
                                        "Changes detected: {reasons}. Review in your own environment.",
                                        {
                                          reasons: selected.reasons
                                            .map((reason) => t(reason))
                                            .join(", "),
                                        },
                                      )
                                    : t(
                                        "No changes detected against this version. Prior evidence may still need a new test.",
                                      )}
                                </p>
                              </div>
                              {editable && selected.after && (
                                <button
                                  className="button secondary compact"
                                  onClick={() => setModal("edit")}
                                >
                                  <Pencil size={14} />
                                  {t("Correct step")}
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
                                <div>
                                  <strong>
                                    {t("{status} by {reviewer}", {
                                      status: statusLabel(review.status),
                                      reviewer: review.reviewer,
                                    })}
                                    {review.inheritedFrom &&
                                      t(" · Carried evidence")}
                                  </strong>
                                  <p>{review.note}</p>
                                  <small>
                                    {review.context} ·{" "}
                                    {formatDate(review.createdAt)}
                                    {review.inheritedFrom &&
                                      ` · ${t("Originally recorded against version {number}", { number: guide.versions.find((v) => v.id === review.inheritedFrom)?.number ?? "?" })}`}
                                  </small>
                                </div>
                              </div>
                            )}
                            {editable && selected.after ? (
                              <ReviewForm
                                key={`${guide.id}-${selected.id}`}
                                guide={guide}
                                step={selected.after}
                                revision={workspace.revision}
                                refreshed={(s) => {
                                  applyWorkspace(s);
                                  setVersionId("");
                                  setBaseId("");
                                }}
                                done={(s) => {
                                  applyWorkspace(s);
                                  setNotice(
                                    "Review saved with your name, environment, and timestamp.",
                                  );
                                }}
                              />
                            ) : (
                              <div className="read-only">
                                <Clock3 size={17} />
                                {selected.kind === "removed"
                                  ? t(
                                      "Removal is recorded in version history. Only steps in the current guide can be tested.",
                                    )
                                  : t(
                                      "Preserved versions are read-only. Select the current version to record a review.",
                                    )}
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
                                {t("Previous step")}
                              </button>
                              <span>
                                {t("{number} of {total} in this queue", {
                                  number: filtered.indexOf(selected) + 1,
                                  total: filtered.length,
                                })}
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
                                {t("Next step")}
                                <ArrowRight size={14} />
                              </button>
                            </div>
                          </>
                        ) : (
                          <Empty title={t("No steps in this view")}>
                            {t(
                              "Adjust your search or choose another review filter.",
                            )}
                          </Empty>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </section>
              <footer className="main-footer">
                {t("Your evidence. Your judgment.")}
                <span>
                  {t(
                    "GuideCheck records human review; it does not automatically verify a procedure.",
                  )}
                </span>
                <button className="text-button" onClick={() => void load()}>
                  {t("Refresh workspace")}
                </button>
              </footer>
            </>
          )}
        </main>
      </div>
      {workspace && modal && (
        <>
          {modal === "backup" ? (
            <Modal
              title={t("Backup & restore")}
              close={() => setModal(null)}
              busy={backupBusy}
            >
              <BackupDialog
                workspace={workspace}
                request={request}
                onBusy={setBackupBusy}
                done={(s) => {
                  applyWorkspace(s);
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
