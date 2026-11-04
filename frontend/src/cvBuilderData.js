const EMPTY_PERSONAL = {
  full_name: "",
  desired_position: "",
  email: "",
  phone: "",
  address: "",
  birth_date: "",
  github: "",
  linkedin: "",
  portfolio: "",
};

const ENTRY_FACTORIES = {
  education: () => ({
    school: "",
    major: "",
    start_date: "",
    end_date: "",
    gpa: "",
    // Keep legacy fields in saved JSON so editing an old draft never discards data.
    period: "",
    description: "",
  }),
  experience: () => ({ company: "", position: "", period: "", description: "" }),
  projects: () => ({ name: "", technologies: "", role: "", description: "" }),
  awards: () => ({ name: "", issuer: "", period: "", description: "" }),
  certificates: () => ({ name: "", issuer: "", period: "" }),
};

export const CV_COLLECTIONS = Object.freeze(Object.keys(ENTRY_FACTORIES));

export function emptyCVContent(user = {}) {
  return {
    personal: {
      ...EMPTY_PERSONAL,
      full_name: user.full_name || "",
      email: user.email || "",
      phone: user.phone || "",
    },
    objective: "",
    summary: "",
    education: [ENTRY_FACTORIES.education()],
    experience: [ENTRY_FACTORIES.experience()],
    skills: [],
    hobbies: [],
    projects: [ENTRY_FACTORIES.projects()],
    awards: [],
    certificates: [],
  };
}

export function normalizeCVContent(value = {}, user = {}) {
  const initial = emptyCVContent(user);
  return {
    ...initial,
    ...value,
    personal: { ...initial.personal, ...(value.personal || {}) },
    ...Object.fromEntries(CV_COLLECTIONS.map((key) => [key, Array.isArray(value[key]) ? value[key] : initial[key]])),
    skills: Array.isArray(value.skills) ? value.skills.filter((skill) => typeof skill === "string") : [],
    hobbies: Array.isArray(value.hobbies) ? value.hobbies.filter((hobby) => typeof hobby === "string") : [],
  };
}

export function addCVEntry(content, section) {
  const makeEntry = ENTRY_FACTORIES[section];
  if (!makeEntry) return content;
  return { ...content, [section]: [...(content[section] || []), makeEntry()] };
}

export function removeCVEntry(content, section, index) {
  if (!ENTRY_FACTORIES[section]) return content;
  return { ...content, [section]: (content[section] || []).filter((_, itemIndex) => itemIndex !== index) };
}

export function updateCVEntry(content, section, index, field, value) {
  if (!ENTRY_FACTORIES[section]) return content;
  return {
    ...content,
    [section]: (content[section] || []).map((item, itemIndex) =>
      itemIndex === index ? { ...item, [field]: value } : item
    ),
  };
}

export function parseSkills(value) {
  return parseList(value, 60);
}

export function parseHobbies(value) {
  return parseList(value, 20);
}

function parseList(value, limit) {
  return [...new Set(String(value || "").split(/[,\n]/).map((item) => item.trim()).filter(Boolean))].slice(0, limit);
}

export function descriptionBullets(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[-•*]\s*/, ""))
    .filter(Boolean);
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function filledEntries(items = []) {
  return items.filter((item) => Object.values(item || {}).some(hasText));
}

function educationEntries(items = []) {
  return items
    .filter((item) => ["school", "major", "start_date", "end_date", "gpa", "period"].some((key) => hasText(item?.[key])))
    .map((item) => ({
      ...item,
      period: [item.start_date, item.end_date].filter(hasText).join(" – ") || String(item.period || "").trim(),
    }));
}

export function selectCVView(content) {
  const normalized = normalizeCVContent(content);
  const personal = normalized.personal;
  return {
    personal,
    contactItems: [
      ["phone", "Điện thoại", personal.phone],
      ["email", "Email", personal.email],
      ["address", "Địa chỉ", personal.address],
      ["birth_date", "Ngày sinh", personal.birth_date],
      ["github", "GitHub", personal.github],
    ].filter(([, , value]) => hasText(value)).map(([key, label, value]) => ({ key, label, value })),
    contacts: [personal.email, personal.phone, personal.address].filter(hasText),
    links: [personal.github].filter(hasText),
    objective: normalized.objective.trim(),
    summary: normalized.summary.trim(),
    education: educationEntries(normalized.education),
    experience: filledEntries(normalized.experience),
    skills: normalized.skills.filter(hasText),
    hobbies: normalized.hobbies.filter(hasText),
    projects: filledEntries(normalized.projects),
    awards: filledEntries(normalized.awards),
    certificates: filledEntries(normalized.certificates),
  };
}

export function cvPlainText(content) {
  const view = selectCVView(content);
  const entryText = (items) => items.flatMap((item) => Object.values(item).filter(hasText));
  return [
    view.personal.full_name,
    view.personal.desired_position,
    ...view.contacts,
    ...view.links,
    view.objective,
    view.summary,
    ...view.education.flatMap(({ school, major, period, gpa }) => [school, major, period, gpa].filter(hasText)),
    ...entryText(view.experience),
    ...view.skills,
    ...view.hobbies,
    ...entryText(view.projects),
    ...entryText(view.awards),
    ...entryText(view.certificates),
  ].filter(hasText).join("\n");
}

export function cvFilename(title) {
  const safe = String(title || "CV-truc-tuyen")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${safe || "CV-truc-tuyen"}.pdf`;
}
