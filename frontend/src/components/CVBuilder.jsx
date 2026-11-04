import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  Camera,
  CheckCircle2,
  Download,
  FilePlus2,
  Link2,
  Mail,
  MapPin,
  Phone,
  Plus,
  Save,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import api from "../api.js";
import {
  addCVEntry,
  cvFilename,
  emptyCVContent,
  normalizeCVContent,
  parseHobbies,
  parseSkills,
  removeCVEntry,
  descriptionBullets,
  selectCVView,
  updateCVEntry,
} from "../cvBuilderData.js";
import { renderCVPdfBlob } from "./CVPdfDocument.jsx";
import { Alert, Spinner } from "./Common.jsx";


const COLLECTION_FIELDS = {
  experience: {
    title: "Kinh nghiệm",
    addLabel: "Thêm kinh nghiệm",
    fields: [
      ["company", "Công ty"],
      ["position", "Chức vụ"],
      ["period", "Thời gian"],
      ["description", "Công việc và thành tích", "textarea"],
    ],
  },
  education: {
    title: "Học vấn",
    addLabel: "Thêm học vấn",
    fields: [
      ["school", "Trường học"],
      ["major", "Chuyên ngành"],
      ["start_date", "Thời gian bắt đầu"],
      ["end_date", "Thời gian kết thúc"],
      ["gpa", "GPA", "gpa"],
    ],
  },
  projects: {
    title: "Dự án",
    addLabel: "Thêm dự án",
    fields: [
      ["name", "Tên dự án"],
      ["technologies", "Công nghệ sử dụng"],
      ["role", "Vai trò"],
      ["description", "Mô tả và kết quả", "textarea"],
    ],
  },
  awards: {
    title: "Danh hiệu và giải thưởng",
    addLabel: "Thêm giải thưởng",
    fields: [
      ["name", "Tên danh hiệu hoặc giải thưởng"],
      ["issuer", "Đơn vị trao"],
      ["period", "Thời gian"],
      ["description", "Mô tả", "textarea"],
    ],
  },
  certificates: {
    title: "Chứng chỉ",
    addLabel: "Thêm chứng chỉ",
    fields: [
      ["name", "Tên chứng chỉ"],
      ["issuer", "Đơn vị cấp"],
      ["period", "Thời gian"],
    ],
  },
};

const PERSONAL_FIELDS = [
  ["full_name", "Họ tên", "text"],
  ["desired_position", "Vị trí mong muốn", "text"],
  ["email", "Email", "email"],
  ["phone", "Số điện thoại", "tel"],
  ["address", "Địa chỉ", "text"],
  ["birth_date", "Ngày sinh", "date"],
  ["github", "GitHub", "url"],
];

const MAX_PORTRAIT_BYTES = 5 * 1024 * 1024;
const MAX_PORTRAIT_PIXELS = 16_000_000;
const DEFAULT_CROP = { x: 50, y: 50, zoom: 1 };

const CONTACT_ICONS = {
  phone: Phone,
  email: Mail,
  address: MapPin,
  birth_date: CalendarDays,
  github: Link2,
};

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Không thể đọc ảnh chân dung."));
    reader.readAsDataURL(blob);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("File không chứa ảnh hợp lệ."));
    image.src = src;
  });
}

async function cropPortraitSource(src, crop, size = 800) {
  const image = await loadImage(src);
  if (image.naturalWidth * image.naturalHeight > MAX_PORTRAIT_PIXELS) {
    throw new Error("Ảnh có độ phân giải quá lớn (tối đa 16 triệu pixel).");
  }
  const side = Math.min(image.naturalWidth, image.naturalHeight) / crop.zoom;
  const sourceX = (image.naturalWidth - side) * (crop.x / 100);
  const sourceY = (image.naturalHeight - side) * (crop.y / 100);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, size, size);
  context.drawImage(image, sourceX, sourceY, side, side, 0, 0, size, size);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
  if (!blob) throw new Error("Không thể xử lý ảnh chân dung.");
  return { blob, dataUrl: canvas.toDataURL("image/jpeg", 0.9) };
}

export default function CVBuilder({ user, onSavedToResumes }) {
  const [drafts, setDrafts] = useState([]);
  const [draftId, setDraftId] = useState(null);
  const [title, setTitle] = useState(() => `CV ${user?.full_name || "trực tuyến"}`);
  const [content, setContent] = useState(() => emptyCVContent(user));
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const portraitInputRef = useRef(null);
  const portraitLoadRef = useRef(0);
  const [storedPortraitSrc, setStoredPortraitSrc] = useState("");
  const [portraitSource, setPortraitSource] = useState("");
  const [portraitPreviewSrc, setPortraitPreviewSrc] = useState("");
  const [portraitCrop, setPortraitCrop] = useState(DEFAULT_CROP);
  const [portraitRemoved, setPortraitRemoved] = useState(false);
  const [portraitLoading, setPortraitLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    api.listResumeDrafts()
      .then((items) => {
        if (!alive) return;
        setDrafts(items || []);
        if (items?.length) selectDraft(items[0]);
      })
      .catch((err) => alive && setError(err.message || "Không tải được bản nháp CV."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
      portraitLoadRef.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => {
    if (portraitSource) URL.revokeObjectURL(portraitSource);
  }, [portraitSource]);

  useEffect(() => {
    if (!portraitSource) {
      setPortraitPreviewSrc(portraitRemoved ? "" : storedPortraitSrc);
      return undefined;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      cropPortraitSource(portraitSource, portraitCrop, 500)
        .then(({ dataUrl }) => active && setPortraitPreviewSrc(dataUrl))
        .catch((err) => active && setError(err.message || "Không thể xem trước ảnh."));
    }, 100);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [portraitSource, portraitCrop, portraitRemoved, storedPortraitSrc]);

  async function selectDraft(draft) {
    const requestId = ++portraitLoadRef.current;
    setDraftId(draft.id);
    setTitle(draft.title);
    setContent(normalizeCVContent(draft.content, user));
    setStoredPortraitSrc("");
    setPortraitSource("");
    setPortraitPreviewSrc("");
    setPortraitCrop(DEFAULT_CROP);
    setPortraitRemoved(false);
    setPortraitLoading(false);
    setError("");
    setMessage("");
    if (!draft.has_portrait) return;
    setPortraitLoading(true);
    try {
      const dataUrl = await blobToDataUrl(await api.getDraftPortrait(draft.id, draft.portrait_version));
      if (requestId !== portraitLoadRef.current) return;
      setStoredPortraitSrc(dataUrl);
      setPortraitPreviewSrc(dataUrl);
    } catch (err) {
      if (requestId === portraitLoadRef.current) setError(err.message || "Không tải được ảnh chân dung.");
    } finally {
      if (requestId === portraitLoadRef.current) setPortraitLoading(false);
    }
  }

  function newDraft() {
    portraitLoadRef.current += 1;
    setDraftId(null);
    setTitle(`CV ${user?.full_name || "trực tuyến"}`);
    setContent(emptyCVContent(user));
    setStoredPortraitSrc("");
    setPortraitSource("");
    setPortraitPreviewSrc("");
    setPortraitCrop(DEFAULT_CROP);
    setPortraitRemoved(false);
    setPortraitLoading(false);
    setError("");
    setMessage("");
  }

  function updatePersonal(field, value) {
    setContent((current) => ({ ...current, personal: { ...current.personal, [field]: value } }));
  }

  function updateText(field, value) {
    setContent((current) => ({ ...current, [field]: value }));
  }

  function payload() {
    return { title: title.trim() || "CV chưa đặt tên", template_key: "olive_sidebar", content };
  }

  function mergeDraft(saved) {
    setDrafts((items) => [saved, ...items.filter((item) => item.id !== saved.id)]);
    setDraftId(saved.id);
    setTitle(saved.title);
    setContent(normalizeCVContent(saved.content, user));
    return saved;
  }

  async function persistDraft(showMessage = true) {
    let saved = draftId
      ? await api.updateResumeDraft(draftId, payload())
      : await api.createResumeDraft(payload());
    // Keep the persisted draft reachable even if the separate portrait request fails.
    mergeDraft(saved);
    let portraitDataUrl = portraitRemoved ? "" : storedPortraitSrc;
    try {
      if (portraitSource) {
        const processed = await cropPortraitSource(portraitSource, portraitCrop);
        const portraitFile = new File([processed.blob], "portrait.jpg", { type: "image/jpeg" });
        saved = await api.uploadDraftPortrait(saved.id, portraitFile);
        portraitDataUrl = processed.dataUrl;
        setStoredPortraitSrc(processed.dataUrl);
        setPortraitPreviewSrc(processed.dataUrl);
        setPortraitSource("");
        setPortraitCrop(DEFAULT_CROP);
        setPortraitRemoved(false);
      } else if (portraitRemoved && saved.has_portrait) {
        saved = await api.deleteDraftPortrait(saved.id);
        portraitDataUrl = "";
        setStoredPortraitSrc("");
        setPortraitPreviewSrc("");
        setPortraitRemoved(false);
      } else if (portraitRemoved) {
        setPortraitRemoved(false);
      }
    } catch (err) {
      throw new Error(`Nội dung bản nháp đã được lưu nhưng ảnh chân dung chưa được cập nhật: ${err.message || "lỗi không xác định"}`);
    }
    mergeDraft(saved);
    if (showMessage) setMessage("Đã lưu bản nháp.");
    return { draft: saved, portraitSrc: portraitDataUrl };
  }

  async function saveDraft() {
    setBusy("save");
    setError("");
    setMessage("");
    try {
      await persistDraft();
    } catch (err) {
      setError(err.message || "Không thể lưu bản nháp.");
    } finally {
      setBusy("");
    }
  }

  function ensureExportable() {
    if (!content.personal.full_name.trim()) throw new Error("Vui lòng nhập họ tên trước khi xuất PDF.");
  }

  async function currentPortraitData() {
    if (portraitSource) return (await cropPortraitSource(portraitSource, portraitCrop)).dataUrl;
    return portraitRemoved ? "" : storedPortraitSrc;
  }

  async function createPdf(portraitOverride) {
    ensureExportable();
    if (portraitLoading) throw new Error("Ảnh chân dung vẫn đang được tải. Vui lòng thử lại sau.");
    const portrait = portraitOverride === undefined ? await currentPortraitData() : portraitOverride;
    return renderCVPdfBlob(content, title, undefined, portrait);
  }

  async function exportPdf() {
    setBusy("export");
    setError("");
    setMessage("");
    try {
      const blob = await createPdf();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = cvFilename(title);
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage("Đã tạo PDF A4. Bản nháp chưa bị thay đổi.");
    } catch (err) {
      setError(err.message || "Không thể xuất PDF.");
    } finally {
      setBusy("");
    }
  }

  async function saveToResumes() {
    setBusy("resume");
    setError("");
    setMessage("");
    try {
      const saved = await persistDraft(false);
      const blob = await createPdf(saved.portraitSrc);
      const file = new File([blob], cvFilename(title), { type: "application/pdf" });
      const resume = await api.saveDraftToResumes(saved.draft.id, file, file.name);
      setMessage("Đã lưu vào CV của tôi và chọn làm CV đang sử dụng. AI đã phân tích nội dung PDF.");
      onSavedToResumes?.(resume);
    } catch (err) {
      setError(err.message || "Không thể lưu PDF vào CV của tôi. Bản nháp vẫn được giữ nguyên.");
    } finally {
      setBusy("");
    }
  }

  async function choosePortrait(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    if (file.type && !(["image/jpeg", "image/png", "image/webp"].includes(file.type))) {
      setError("Chỉ hỗ trợ ảnh JPG, PNG hoặc WebP.");
      return;
    }
    if (file.size > MAX_PORTRAIT_BYTES) {
      setError("Ảnh chân dung vượt quá giới hạn 5 MB.");
      return;
    }
    const source = URL.createObjectURL(file);
    try {
      const image = await loadImage(source);
      if (image.naturalWidth * image.naturalHeight > MAX_PORTRAIT_PIXELS) {
        throw new Error("Ảnh có độ phân giải quá lớn (tối đa 16 triệu pixel).");
      }
      setPortraitSource(source);
      setPortraitCrop(DEFAULT_CROP);
      setPortraitRemoved(false);
      setMessage("Căn chỉnh ảnh rồi lưu bản nháp để lưu ảnh riêng tư.");
    } catch (err) {
      URL.revokeObjectURL(source);
      setError(err.message || "File không chứa ảnh hợp lệ.");
    }
  }

  function removePortrait() {
    setPortraitSource("");
    setPortraitPreviewSrc("");
    setStoredPortraitSrc("");
    setPortraitCrop(DEFAULT_CROP);
    setPortraitRemoved(true);
    setMessage("Ảnh sẽ được xóa khi bạn lưu bản nháp.");
  }

  async function deleteDraft() {
    if (!draftId || !window.confirm("Xóa bản nháp này? Các CV đã xuất vẫn được giữ lại.")) return;
    setBusy("delete");
    setError("");
    try {
      await api.deleteResumeDraft(draftId);
      const remaining = drafts.filter((item) => item.id !== draftId);
      setDrafts(remaining);
      if (remaining.length) selectDraft(remaining[0]);
      else newDraft();
      setMessage("Đã xóa bản nháp. CV đã lưu không bị xóa.");
    } catch (err) {
      setError(err.message || "Không thể xóa bản nháp.");
    } finally {
      setBusy("");
    }
  }

  if (loading) return <Spinner />;

  return (
    <div className="cv-builder" data-testid="cv-builder">
      <header className="cv-builder-toolbar">
        <div>
          <span className="cv-builder-kicker"><Sparkles size={16} /> Mẫu Olive Sidebar</span>
          <h2>Tạo CV trực tuyến</h2>
          <p>Nhập thông tin, xem trước theo thời gian thực và lưu PDF để AI Matching sử dụng.</p>
        </div>
        <div className="cv-builder-draft-picker">
          <label htmlFor="cv-draft-picker">Bản nháp</label>
          <select
            id="cv-draft-picker"
            value={draftId || ""}
            onChange={(event) => {
              const selected = drafts.find((draft) => draft.id === Number(event.target.value));
              if (selected) selectDraft(selected);
              else newDraft();
            }}
          >
            <option value="">Bản nháp mới</option>
            {drafts.map((draft) => <option key={draft.id} value={draft.id}>{draft.title}</option>)}
          </select>
          <button className="btn-ghost btn-with-icon" type="button" onClick={newDraft} disabled={Boolean(busy)}>
            <FilePlus2 size={17} /> Tạo mới
          </button>
        </div>
      </header>

      <Alert type="success">{message}</Alert>
      <Alert>{error}</Alert>

      <div className="cv-builder-layout">
        <form className="cv-builder-form" onSubmit={(event) => event.preventDefault()}>
          <FormSection title="Thông tin bản CV">
            <Field label="Tên bản nháp">
              <input value={title} maxLength={160} onChange={(event) => setTitle(event.target.value)} />
            </Field>
          </FormSection>

          <FormSection title="Ảnh chân dung">
            <PortraitEditor
              inputRef={portraitInputRef}
              portraitSrc={portraitPreviewSrc}
              crop={portraitCrop}
              setCrop={setPortraitCrop}
              canAdjust={Boolean(portraitSource)}
              loading={portraitLoading}
              onChoose={choosePortrait}
              onRemove={removePortrait}
            />
          </FormSection>

          <FormSection title="Thông tin cá nhân">
            <div className="cv-form-grid">
              {PERSONAL_FIELDS.map(([field, label, type]) => (
                <Field label={label} key={field} wide={["address", "github"].includes(field)}>
                  <input
                    type={type}
                    value={content.personal[field] || ""}
                    maxLength={field === "github" ? 500 : 200}
                    onChange={(event) => updatePersonal(field, event.target.value)}
                  />
                </Field>
              ))}
            </div>
          </FormSection>

          <FormSection title="Giới thiệu bản thân">
            <Field label="Mục tiêu nghề nghiệp">
              <textarea rows={4} maxLength={4000} value={content.objective} onChange={(event) => updateText("objective", event.target.value)} />
            </Field>
            <Field label="Tóm tắt năng lực">
              <textarea rows={5} maxLength={4000} value={content.summary} onChange={(event) => updateText("summary", event.target.value)} />
            </Field>
          </FormSection>

          <CollectionSection section="experience" content={content} setContent={setContent} />
          <CollectionSection section="education" content={content} setContent={setContent} />

          <FormSection title="Kỹ năng">
            <Field label="Danh sách kỹ năng chuyên môn" hint="Ngăn cách bằng dấu phẩy hoặc xuống dòng">
              <textarea
                rows={4}
                value={content.skills.join(", ")}
                onChange={(event) => updateText("skills", parseSkills(event.target.value))}
              />
            </Field>
          </FormSection>

          <FormSection title="Sở thích">
            <Field label="Danh sách sở thích" hint="Ngăn cách bằng dấu phẩy hoặc xuống dòng">
              <textarea
                rows={3}
                value={content.hobbies.join(", ")}
                onChange={(event) => updateText("hobbies", parseHobbies(event.target.value))}
              />
            </Field>
          </FormSection>

          <CollectionSection section="projects" content={content} setContent={setContent} />
          <CollectionSection section="awards" content={content} setContent={setContent} />
          <CollectionSection section="certificates" content={content} setContent={setContent} />
        </form>

        <aside className="cv-preview-panel">
          <div className="cv-preview-label">Xem trước A4</div>
          <CVPreview content={content} portraitSrc={portraitPreviewSrc} />
        </aside>
      </div>

      <footer className="cv-builder-actions">
        {draftId ? (
          <button className="btn-danger-outline btn-with-icon" type="button" onClick={deleteDraft} disabled={Boolean(busy)}>
            <Trash2 size={17} /> {busy === "delete" ? "Đang xóa..." : "Xóa bản nháp"}
          </button>
        ) : <span />}
        <div>
          <button className="btn-ghost btn-with-icon" type="button" onClick={saveDraft} disabled={Boolean(busy)}>
            <Save size={17} /> {busy === "save" ? "Đang lưu..." : "Lưu bản nháp"}
          </button>
          <button className="btn-ghost btn-with-icon" type="button" onClick={exportPdf} disabled={Boolean(busy)}>
            <Download size={17} /> {busy === "export" ? "Đang tạo PDF..." : "Xuất PDF"}
          </button>
          <button className="btn-primary btn-with-icon" type="button" onClick={saveToResumes} disabled={Boolean(busy)}>
            <CheckCircle2 size={17} /> {busy === "resume" ? "Đang phân tích..." : "Lưu vào CV của tôi"}
          </button>
        </div>
      </footer>
    </div>
  );
}

function FormSection({ title, children }) {
  return <section className="cv-form-section"><h3>{title}</h3>{children}</section>;
}

function Field({ label, hint, wide = false, children }) {
  return (
    <label className={wide ? "cv-field cv-field-wide" : "cv-field"}>
      <span>{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

function PortraitEditor({ inputRef, portraitSrc, crop, setCrop, canAdjust, loading, onChoose, onRemove }) {
  return (
    <div className="cv-portrait-editor">
      <div className={`cv-portrait-editor-preview ${portraitSrc ? "has-image" : ""}`}>
        {portraitSrc ? <img src={portraitSrc} alt="Xem trước ảnh chân dung" /> : <Camera size={42} aria-hidden="true" />}
      </div>
      <div className="cv-portrait-editor-controls">
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={onChoose} hidden />
        <div className="cv-portrait-buttons">
          <button className="btn-ghost btn-with-icon" type="button" onClick={() => inputRef.current?.click()} disabled={loading}>
            <Camera size={17} /> {portraitSrc ? "Thay đổi ảnh" : "Chọn ảnh"}
          </button>
          {portraitSrc ? <button className="btn-danger-outline btn-with-icon" type="button" onClick={onRemove}><Trash2 size={16} /> Xóa ảnh</button> : null}
        </div>
        <small>JPG, PNG hoặc WebP; tối đa 5 MB và 16 triệu pixel. Ảnh được cắt vuông, xóa metadata và lưu riêng tư.</small>
        {canAdjust ? (
          <div className="cv-crop-controls">
            <label>Trái / phải<input type="range" min="0" max="100" value={crop.x} onChange={(event) => setCrop((current) => ({ ...current, x: Number(event.target.value) }))} /></label>
            <label>Lên / xuống<input type="range" min="0" max="100" value={crop.y} onChange={(event) => setCrop((current) => ({ ...current, y: Number(event.target.value) }))} /></label>
            <label>Thu phóng<input type="range" min="1" max="2.5" step="0.05" value={crop.zoom} onChange={(event) => setCrop((current) => ({ ...current, zoom: Number(event.target.value) }))} /></label>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function CollectionSection({ section, content, setContent }) {
  const config = COLLECTION_FIELDS[section];
  const items = content[section] || [];
  return (
    <FormSection title={config.title}>
      <div className="cv-collection">
        {items.map((item, index) => (
          <article className="cv-collection-item" key={`${section}-${index}`}>
            <header>
              <strong>{config.title} {index + 1}</strong>
              <button
                type="button"
                aria-label={`Xóa ${config.title.toLowerCase()} ${index + 1}`}
                onClick={() => setContent((current) => removeCVEntry(current, section, index))}
              >
                <X size={17} />
              </button>
            </header>
            <div className="cv-form-grid">
              {config.fields.map(([field, label, type]) => (
                <Field key={field} label={label} wide={type === "textarea"}>
                  {type === "textarea" ? (
                    <textarea
                      rows={4}
                      maxLength={4000}
                      value={item[field] || ""}
                      onChange={(event) => setContent((current) => updateCVEntry(current, section, index, field, event.target.value))}
                    />
                  ) : (
                    <input
                      value={item[field] || ""}
                      maxLength={type === "gpa" ? 20 : 200}
                      inputMode={type === "gpa" ? "decimal" : undefined}
                      pattern={type === "gpa" ? String.raw`\d+(?:\.\d+)?/\d+(?:\.\d+)?` : undefined}
                      placeholder={type === "gpa" ? "Ví dụ: 3.4/4.0 hoặc 8.5/10" : undefined}
                      onChange={(event) => setContent((current) => updateCVEntry(current, section, index, field, event.target.value))}
                    />
                  )}
                </Field>
              ))}
            </div>
          </article>
        ))}
      </div>
      <button className="cv-add-button" type="button" onClick={() => setContent((current) => addCVEntry(current, section))}>
        <Plus size={17} /> {config.addLabel}
      </button>
    </FormSection>
  );
}

export function CVPreview({ content, portraitSrc = "" }) {
  const view = useMemo(() => selectCVView(content), [content]);
  const personal = view.personal;
  return (
    <article className="cv-sheet cv-sheet-two-column" aria-label="Bản xem trước CV">
      <aside className="cv-sheet-sidebar">
        {portraitSrc ? <div className="cv-sheet-portrait"><img src={portraitSrc} alt="Ảnh chân dung trong CV" /></div> : null}
        <header className="cv-sheet-identity">
          <h1>{personal.full_name || "HỌ TÊN ỨNG VIÊN"}</h1>
          {personal.desired_position ? <h2>{personal.desired_position}</h2> : null}
        </header>
        {view.contactItems.length ? (
          <div className="cv-sheet-contact">
            {view.contactItems.map((item) => {
              const Icon = CONTACT_ICONS[item.key] || Link2;
              return <p key={item.key}><Icon size={12} aria-hidden="true" /><span><small>{item.label}</small>{item.value}</span></p>;
            })}
          </div>
        ) : null}
        {view.education.length ? <PreviewSidebarSection title="Học vấn">{view.education.map((item, index) => <PreviewEducationEntry key={index} item={item} />)}</PreviewSidebarSection> : null}
        {view.skills.length ? <PreviewSidebarSection title="Kỹ năng"><ul>{view.skills.map((skill) => <li key={skill}>{skill}</li>)}</ul></PreviewSidebarSection> : null}
        {view.hobbies.length ? <PreviewSidebarSection title="Sở thích"><ul>{view.hobbies.map((hobby) => <li key={hobby}>{hobby}</li>)}</ul></PreviewSidebarSection> : null}
      </aside>
      <main className="cv-sheet-main">
        {view.objective ? <PreviewSection title="Mục tiêu nghề nghiệp"><p>{view.objective}</p></PreviewSection> : null}
        {view.summary ? <PreviewSection title="Giới thiệu bản thân"><p>{view.summary}</p></PreviewSection> : null}
        {view.experience.length ? <PreviewSection title="Kinh nghiệm làm việc">{view.experience.map((item, index) => <PreviewEntry key={index} title={item.position} subtitle={item.company} period={item.period} description={item.description} />)}</PreviewSection> : null}
        {view.projects.length ? <PreviewSection title="Dự án">{view.projects.map((item, index) => <PreviewEntry key={index} title={item.name} subtitle={[item.role, item.technologies].filter(Boolean).join(" | ")} description={item.description} />)}</PreviewSection> : null}
        {view.awards.length ? <PreviewSection title="Danh hiệu và giải thưởng">{view.awards.map((item, index) => <PreviewEntry key={index} title={item.name} subtitle={item.issuer} period={item.period} description={item.description} />)}</PreviewSection> : null}
        {view.certificates.length ? <PreviewSection title="Chứng chỉ">{view.certificates.map((item, index) => <PreviewEntry key={index} title={item.name} subtitle={item.issuer} period={item.period} />)}</PreviewSection> : null}
      </main>
    </article>
  );
}

function PreviewSection({ title, children }) {
  return <section className="cv-sheet-section"><div className="cv-sheet-section-heading"><h3>{title}</h3><span /></div>{children}</section>;
}

function PreviewSidebarSection({ title, children }) {
  return <section className="cv-sheet-sidebar-section"><h3>{title}</h3>{children}</section>;
}

function PreviewEducationEntry({ item }) {
  return <article className="cv-sheet-compact-entry"><strong>{item.school}</strong>{item.major ? <span>Chuyên ngành: {item.major}</span> : null}{item.period ? <span>{item.period}</span> : null}{item.gpa ? <span>GPA: {item.gpa}</span> : null}</article>;
}

function PreviewEntry({ title, subtitle, period, description }) {
  return (
    <article className="cv-sheet-entry">
      <header><strong>{title}</strong>{period ? <span>{period}</span> : null}</header>
      {subtitle ? <b>{subtitle}</b> : null}
      {description ? <ul>{descriptionBullets(description).map((line, index) => <li key={`${line}-${index}`}>{line}</li>)}</ul> : null}
    </article>
  );
}
