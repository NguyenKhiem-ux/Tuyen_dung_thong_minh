import React from "react";
import { Document, Font, Image, Page, Path, StyleSheet, Svg, Text, View, pdf } from "@react-pdf/renderer";
import { descriptionBullets, selectCVView } from "../cvBuilderData.js";


const notoRegularUrl = "/fonts/NotoSans-Regular.ttf";
const notoBoldUrl = "/fonts/NotoSans-Bold.ttf";

let registeredFontSources = "";

export function registerCVFonts(sources = { regular: notoRegularUrl, bold: notoBoldUrl }) {
  const key = `${sources.regular}|${sources.bold}`;
  if (registeredFontSources === key) return;
  Font.register({
    family: "CV Noto Sans",
    fonts: [
      { src: sources.regular, fontWeight: 400 },
      { src: sources.bold, fontWeight: 700 },
    ],
  });
  Font.registerHyphenationCallback((word) => [word]);
  registeredFontSources = key;
}

const colors = {
  olive: "#667260",
  oliveDark: "#4d594a",
  oliveLight: "#dfe5dc",
  ink: "#273129",
  muted: "#667066",
  cream: "#f6f3eb",
};

const styles = StyleSheet.create({
  page: {
    paddingTop: "13mm",
    paddingBottom: "14mm",
    color: colors.ink,
    backgroundColor: "#ffffff",
    fontFamily: "CV Noto Sans",
    fontFeatureSettings: { ccmp: false },
    fontSize: 8.5,
    lineHeight: 1.42,
  },
  sidebarBackground: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: "35%",
    backgroundColor: colors.olive,
  },
  columns: { flexDirection: "row", alignItems: "stretch" },
  sidebar: {
    width: "35%",
    paddingHorizontal: "7mm",
    color: colors.cream,
  },
  main: { width: "65%", paddingHorizontal: "12mm", paddingLeft: "10mm", backgroundColor: "#ffffff" },
  portraitFrame: {
    alignSelf: "center",
    width: "38mm",
    height: "38mm",
    marginBottom: 6,
    padding: 2.5,
    borderRadius: 80,
    backgroundColor: colors.cream,
  },
  portrait: { width: "100%", height: "100%", borderRadius: 80, objectFit: "cover" },
  identity: { width: "100%", marginBottom: 10, textAlign: "center" },
  name: { width: "100%", fontSize: 18, lineHeight: 1.2, fontWeight: 700, letterSpacing: 0.35 },
  desiredPosition: { width: "100%", marginTop: 5, color: "#e6ebdf", fontSize: 9.5, lineHeight: 1.3, fontWeight: 700 },
  contactPanel: {
    marginHorizontal: "-7mm",
    marginBottom: 10,
    padding: "6mm 7mm",
    backgroundColor: colors.oliveDark,
  },
  contactItem: { flexDirection: "row", alignItems: "flex-start", marginBottom: 4 },
  contactItemLast: { marginBottom: 0 },
  contactIcon: { width: 10, height: 10, marginTop: 2, marginRight: 5 },
  contactText: { flexGrow: 1 },
  contactLabel: { color: "#cfd7cb", fontSize: 6.8, fontWeight: 700, textTransform: "uppercase" },
  contactValue: { marginTop: 1, color: "#ffffff", fontSize: 7.7 },
  sidebarSection: { marginBottom: 9 },
  sidebarTitle: {
    marginBottom: 5,
    paddingBottom: 2,
    borderBottomWidth: 0.8,
    borderBottomColor: "#b9c3b5",
    color: "#ffffff",
    fontSize: 9.5,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  compactEntry: { marginBottom: 5 },
  compactTitle: { color: "#ffffff", fontSize: 8.2, fontWeight: 700 },
  compactMeta: { marginTop: 1, color: "#dce2d8", fontSize: 7.3 },
  lightListItem: { marginBottom: 2.5, color: "#f4f6f1" },
  section: { marginBottom: 9 },
  sectionHeading: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  sectionPill: {
    padding: "3.5 9",
    borderRadius: 12,
    color: "#ffffff",
    backgroundColor: colors.olive,
    fontSize: 9.5,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 0.35,
  },
  sectionLine: { flexGrow: 1, marginLeft: 6, borderBottomWidth: 1, borderBottomColor: colors.oliveLight },
  paragraph: { color: "#3d473f" },
  entry: { marginBottom: 7 },
  entryHeading: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  entryTitle: { flexGrow: 1, color: colors.ink, fontSize: 9.2, fontWeight: 700 },
  entryPeriod: { color: colors.muted, fontSize: 7.6 },
  entrySubline: { marginTop: 1, color: colors.oliveDark, fontWeight: 700 },
  bulletRow: { flexDirection: "row", marginTop: 2, paddingRight: 2 },
  bullet: { width: 9, color: colors.oliveDark },
  bulletText: { flexGrow: 1, color: "#3d473f" },
});

function SectionHeading({ children }) {
  return (
    <View style={styles.sectionHeading} minPresenceAhead={45}>
      <Text style={styles.sectionPill}>{children}</Text>
      <View style={styles.sectionLine} />
    </View>
  );
}

function MainSection({ title, children }) {
  return <View style={styles.section}><SectionHeading>{title}</SectionHeading>{children}</View>;
}

function SidebarSection({ title, children }) {
  return <View style={styles.sidebarSection}><Text style={styles.sidebarTitle}>{title}</Text>{children}</View>;
}

const contactIconPaths = {
  phone: "M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.8a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.84.57 2.8.7A2 2 0 0 1 22 16.92z",
  email: "M3 5h18v14H3z M3 6l9 7 9-7",
  address: "M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0z M12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  birth_date: "M3 5h18v16H3z M7 2v6 M17 2v6 M3 10h18",
  link: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71 M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
};

function ContactIcon({ type }) {
  const path = contactIconPaths[type] || contactIconPaths.link;
  return <Svg viewBox="0 0 24 24" style={styles.contactIcon}><Path d={path} fill="none" stroke="#dce2d8" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" /></Svg>;
}

function BulletDescription({ value }) {
  return descriptionBullets(value).map((line, index) => (
    <View key={`${line}-${index}`} style={styles.bulletRow}>
      <Text style={styles.bullet}>•</Text>
      <Text style={styles.bulletText}>{line}</Text>
    </View>
  ));
}

function TimelineEntry({ title, subtitle, period, description }) {
  return (
    <View style={styles.entry} wrap={false}>
      <View style={styles.entryHeading}>
        {title ? <Text style={styles.entryTitle}>{title}</Text> : <Text />}
        {period ? <Text style={styles.entryPeriod}>{period}</Text> : null}
      </View>
      {subtitle ? <Text style={styles.entrySubline}>{subtitle}</Text> : null}
      {description ? <BulletDescription value={description} /> : null}
    </View>
  );
}

export default function CVPdfDocument({ content, title = "CV trực tuyến", portraitSrc = "" }) {
  const view = selectCVView(content);
  const personal = view.personal;
  return (
    <Document title={title} author={personal.full_name || "Smart Recruitment AI"} language="vi">
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.sidebarBackground} fixed />
        <View style={styles.columns}>
          <View style={styles.sidebar}>
            <View wrap={false}>
              {portraitSrc ? <View style={styles.portraitFrame}><Image src={portraitSrc} style={styles.portrait} /></View> : null}
              <View style={styles.identity}>
                <Text style={styles.name}>{personal.full_name || "HỌ TÊN ỨNG VIÊN"}</Text>
                {personal.desired_position ? <Text style={styles.desiredPosition}>{personal.desired_position}</Text> : null}
              </View>
            </View>

            {view.contactItems.length ? (
              <View style={styles.contactPanel} wrap={false}>
                {view.contactItems.map((item, index) => (
                  <View key={item.key} style={[styles.contactItem, index === view.contactItems.length - 1 ? styles.contactItemLast : null]}>
                    <ContactIcon type={item.key} />
                    <View style={styles.contactText}>
                      <Text style={styles.contactLabel}>{item.label}</Text>
                      <Text style={styles.contactValue}>{item.value}</Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}

            {view.education.length ? (
              <SidebarSection title="Học vấn">
                {view.education.map((item, index) => (
                  <View key={`${item.school}-${index}`} style={styles.compactEntry} wrap={false}>
                    <Text style={styles.compactTitle}>{item.school}</Text>
                    {item.major ? <Text style={styles.compactMeta}>Chuyên ngành: {item.major}</Text> : null}
                    {item.period ? <Text style={styles.compactMeta}>{item.period}</Text> : null}
                    {item.gpa ? <Text style={styles.compactMeta}>GPA: {item.gpa}</Text> : null}
                  </View>
                ))}
              </SidebarSection>
            ) : null}
            {view.skills.length ? <SidebarSection title="Kỹ năng">{view.skills.map((item) => <Text key={item} style={styles.lightListItem}>• {item}</Text>)}</SidebarSection> : null}
            {view.hobbies.length ? <SidebarSection title="Sở thích">{view.hobbies.map((item) => <Text key={item} style={styles.lightListItem}>• {item}</Text>)}</SidebarSection> : null}
          </View>

          <View style={styles.main}>
            {view.objective ? <MainSection title="Mục tiêu nghề nghiệp"><Text style={styles.paragraph}>{view.objective}</Text></MainSection> : null}
            {view.summary ? <MainSection title="Giới thiệu bản thân"><Text style={styles.paragraph}>{view.summary}</Text></MainSection> : null}
            {view.experience.length ? (
              <MainSection title="Kinh nghiệm làm việc">
                {view.experience.map((item, index) => <TimelineEntry key={`${item.company}-${item.position}-${index}`} title={item.position} subtitle={item.company} period={item.period} description={item.description} />)}
              </MainSection>
            ) : null}
            {view.projects.length ? (
              <MainSection title="Dự án">
                {view.projects.map((item, index) => <TimelineEntry key={`${item.name}-${index}`} title={item.name} subtitle={[item.role, item.technologies].filter(Boolean).join(" | ")} description={item.description} />)}
              </MainSection>
            ) : null}
            {view.awards.length ? (
              <MainSection title="Danh hiệu và giải thưởng">
                {view.awards.map((item, index) => <TimelineEntry key={`${item.name}-${index}`} title={item.name} subtitle={item.issuer} period={item.period} description={item.description} />)}
              </MainSection>
            ) : null}
            {view.certificates.length ? (
              <MainSection title="Chứng chỉ">
                {view.certificates.map((item, index) => <TimelineEntry key={`${item.name}-${index}`} title={item.name} subtitle={item.issuer} period={item.period} />)}
              </MainSection>
            ) : null}
          </View>
        </View>
      </Page>
    </Document>
  );
}

export async function renderCVPdfBlob(content, title, fontSources, portraitSrc = "") {
  registerCVFonts(fontSources);
  return pdf(<CVPdfDocument content={content} title={title} portraitSrc={portraitSrc} />).toBlob();
}
