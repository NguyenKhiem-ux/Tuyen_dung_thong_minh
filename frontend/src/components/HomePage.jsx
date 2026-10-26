import React, { useMemo, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  BrainCircuit,
  BriefcaseBusiness,
  Building2,
  CalendarCheck,
  ClipboardList,
  Clock3,
  Code2,
  FileText,
  Megaphone,
  MapPin,
  Palette,
  ScanLine,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
  TrendingUp,
} from "lucide-react";
import {
  categoryCounts,
  companySummaries,
  featuredJobs,
  hotJobIds,
  marketStats,
  parseJobDate,
  topLocations,
} from "../homeData.js";
import { candidateRoutes, dashboardPath, Link, loginPath } from "../navigation.jsx";
import { Brand } from "./Navbar.jsx";
import { CompanyMark, JobGrid, JobSearchBar, useJobs } from "./PublicJobs.jsx";

const POPULAR_SEARCHES = ["Developer", "Data Analyst", "Marketing", "Product Manager", "Designer"];
const AI_FEATURES = [
  [ScanLine, "Phân tích kỹ năng", "Xác định thế mạnh từ CV của bạn"],
  [ShieldCheck, "Đánh giá kinh nghiệm", "Hiểu rõ kinh nghiệm và mức độ phù hợp"],
  [TrendingUp, "Phát hiện kỹ năng còn thiếu", "Gợi ý kỹ năng cần bổ sung"],
  [BriefcaseBusiness, "Gợi ý việc làm phù hợp", "Đề xuất công việc dựa trên dữ liệu thông minh"],
];

const CATEGORY_ICONS = {
  developer: Code2,
  data: BarChart3,
  ai: BrainCircuit,
  product: ClipboardList,
  design: Palette,
  marketing: Megaphone,
};
const EMPLOYER_FEATURES = [
  [Building2, "Đăng tin tuyển dụng", "Tạo hồ sơ công ty và đăng tin chỉ trong vài phút"],
  [BrainCircuit, "AI xếp hạng ứng viên", "Điểm phù hợp theo kỹ năng, kinh nghiệm, ngữ nghĩa và dự án"],
  [ClipboardList, "Quản lý quy trình ATS", "Theo dõi từ ứng tuyển, sàng lọc, phỏng vấn đến nhận việc"],
  [CalendarCheck, "Lịch phỏng vấn & đánh giá", "Lên lịch online hoặc trực tiếp, chấm điểm và nhận xét ứng viên"],
];
const FOOTER_SEARCHES = [
  ["Developer", { q: "Developer" }],
  ["Data Analyst", { q: "Data Analyst" }],
  ["Machine Learning", { q: "Machine Learning" }],
  ["Việc làm Remote", { location: "Remote" }],
  ["Việc làm tại Hà Nội", { location: "Hà Nội" }],
  ["Việc làm tại TP. Hồ Chí Minh", { location: "TP. Hồ Chí Minh" }],
];

function searchHref(params) {
  return `/jobs?${new URLSearchParams(params)}`;
}

function employerPath(user) {
  if (!user) return "/register?role=recruiter";
  return user.role === "candidate" ? null : dashboardPath(user);
}

const numberFormat = new Intl.NumberFormat("vi-VN");

function aiPath(user) {
  return !user
    ? loginPath(candidateRoutes.recommendations)
    : user.role === "candidate"
      ? candidateRoutes.recommendations
      : dashboardPath(user);
}

export default function HomePage({ user }) {
  const state = useJobs();
  const [location, setLocation] = useState("");
  const { jobs } = state;
  const latest = useMemo(
    () => [...jobs].sort((a, b) => parseJobDate(b.created_at) - parseJobDate(a.created_at)),
    [jobs],
  );
  const locations = useMemo(() => topLocations(jobs, 4), [jobs]);
  const hotIds = useMemo(() => hotJobIds(jobs), [jobs]);
  const activeLocation = locations.includes(location) ? location : "";
  const featured = featuredJobs(jobs, activeLocation, 6);
  return (
    <main className="home-page">
      <HeroSection locations={jobs.map((job) => job.location)} />
      <MarketStats {...state} />
      <section className="site-container home-jobs-section" aria-labelledby="featured-title">
        <SectionHeading
          id="featured-title"
          icon={Star}
          title="Việc làm nổi bật"
          subtitle="Những cơ hội việc làm đáng chú ý dành cho bạn"
          tone="gold"
        />
        {locations.length > 1 && (
          <div className="home-chip-row" role="group" aria-label="Lọc việc làm nổi bật theo địa điểm">
            {["", ...locations].map((item) => (
              <button
                key={item || "all"}
                type="button"
                className={`home-chip ${item === activeLocation ? "is-active" : ""}`}
                aria-pressed={item === activeLocation}
                onClick={() => setLocation(item)}
              >
                {item && <MapPin size={14} aria-hidden="true" />}
                {item || "Tất cả"}
              </button>
            ))}
          </div>
        )}
        <JobGrid {...state} jobs={featured} count={6} hotIds={hotIds} />
      </section>
      <AIIntroSection user={user} />
      <CategorySection {...state} />
      <section className="site-container home-jobs-section" aria-labelledby="latest-title">
        <SectionHeading
          id="latest-title"
          icon={Clock3}
          title="Việc làm mới nhất"
          subtitle="Cập nhật những cơ hội việc làm mới nhất từ các nhà tuyển dụng"
          tone="blue"
        />
        <JobGrid {...state} jobs={latest.slice(0, 5)} compact count={5} />
      </section>
      <CompanySection {...state} />
      <EmployerBand user={user} />
      <HomeCTA user={user} />
    </main>
  );
}

function MarketStats({ jobs, loading, error }) {
  if (error || (!loading && !jobs.length)) return null;
  const stats = marketStats(jobs);
  const items = [
    [BriefcaseBusiness, "Việc làm đang tuyển", stats.openJobs, "green"],
    [Building2, "Doanh nghiệp tuyển dụng", stats.companies, "blue"],
    [Sparkles, "Việc làm mới trong 7 ngày", stats.newThisWeek, "gold"],
    [Send, "Lượt ứng tuyển", stats.applications, "rose"],
  ];
  return (
    <section className="site-container home-stats" aria-labelledby="stats-title" aria-busy={loading}>
      <div className="home-stats-card">
        <div className="home-stats-head">
          <h2 id="stats-title">Thị trường việc làm hôm nay</h2>
          <time>{new Date().toLocaleDateString("vi-VN")}</time>
        </div>
        {items.map(([Icon, label, value, tone]) => (
          <div className="home-stat" key={label}>
            <span className={`home-stat-icon ${tone}`}>
              <Icon size={22} aria-hidden="true" />
            </span>
            <div>
              {loading ? <i className="home-stat-skeleton" aria-hidden="true" /> : <strong>{numberFormat.format(value)}</strong>}
              <span>{label}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function CategorySection({ jobs, loading, error }) {
  const categories = useMemo(() => categoryCounts(jobs), [jobs]);
  if (loading || error || !categories.length) return null;
  return (
    <section className="site-container home-jobs-section" aria-labelledby="category-title">
      <SectionHeading
        id="category-title"
        icon={BriefcaseBusiness}
        title="Việc làm theo vị trí"
        subtitle="Khám phá cơ hội theo lĩnh vực bạn quan tâm"
        tone="green"
      />
      <div className="home-category-grid">
        {categories.map((category) => {
          const Icon = CATEGORY_ICONS[category.key] || BriefcaseBusiness;
          return (
            <Link key={category.key} className="home-category-card" href={searchHref({ q: category.q })}>
              <span className="home-category-icon">
                <Icon size={24} aria-hidden="true" />
              </span>
              <span className="home-category-copy">
                <strong>{category.label}</strong>
                <small>{numberFormat.format(category.count)} việc làm</small>
              </span>
              <ArrowRight className="home-category-arrow" size={17} aria-hidden="true" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function CompanySection({ jobs, loading, error }) {
  const companies = useMemo(() => companySummaries(jobs, 6), [jobs]);
  if (loading || error || !companies.length) return null;
  return (
    <section className="site-container home-jobs-section" aria-labelledby="company-title">
      <SectionHeading
        id="company-title"
        icon={Building2}
        title="Nhà tuyển dụng tiêu biểu"
        subtitle="Các doanh nghiệp đang tuyển dụng trên Smart Recruitment AI"
        tone="green"
      />
      <div className="home-company-grid">
        {companies.map((company) => (
          <Link key={company.key} className="home-company-card" href={searchHref({ q: company.name })}>
            <CompanyMark job={company.sample} />
            <span className="home-company-copy">
              <strong>{company.name}</strong>
              <small>
                <BriefcaseBusiness size={13} aria-hidden="true" />
                {numberFormat.format(company.jobs)} việc làm đang tuyển
              </small>
              {company.locations.length > 0 && (
                <small>
                  <MapPin size={13} aria-hidden="true" />
                  {company.locations.slice(0, 2).join(", ")}
                </small>
              )}
            </span>
            <ArrowRight className="home-category-arrow" size={17} aria-hidden="true" />
          </Link>
        ))}
      </div>
    </section>
  );
}

function HeroSection({ locations }) {
  return (
    <section className="home-hero">
      <div className="site-container home-hero-inner">
        <img
          className="home-hero-art"
          src="/images/home-career.png"
          alt="Ứng viên sử dụng laptop để tìm kiếm cơ hội nghề nghiệp với AI"
          fetchpriority="high"
          width="1942"
          height="809"
        />
        <div className="home-hero-copy">
          <p className="home-eyebrow">
            <Sparkles size={14} aria-hidden="true" />
            SMART RECRUITMENT AI
          </p>
          <h1>
            Tìm công việc phù hợp
            <br />
            với bạn bằng <span>AI</span>
          </h1>
          <p className="home-hero-subtitle">
            Smart Recruitment AI giúp bạn phân tích CV, hiểu rõ năng lực và kết nối với những cơ hội việc làm phù hợp
            nhất.
          </p>
          <JobSearchBar locations={locations} withEmployment />
          <div className="popular-searches">
            <span>Tìm kiếm phổ biến:</span>
            {POPULAR_SEARCHES.map((keyword) => (
              <Link key={keyword} href={`/jobs?${new URLSearchParams({ q: keyword })}`}>
                {keyword}
              </Link>
            ))}
          </div>
        </div>
        <div className="home-hero-notes" aria-hidden="true">
          <div className="home-hero-note note-cv">
            <span>
              <FileText />
            </span>
            <div>
              <strong>Phân tích CV bằng AI</strong>
              <p>Hiểu rõ thế mạnh của bạn</p>
            </div>
          </div>
          <div className="home-hero-note note-career">
            <span>
              <TrendingUp />
            </span>
            <div>
              <strong>Phát triển sự nghiệp</strong>
              <p>Khám phá cơ hội tốt hơn</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function SectionHeading({ id, icon: Icon, title, subtitle, tone }) {
  return (
    <div className="home-section-heading">
      <div className="home-section-title">
        <span className={`home-section-icon ${tone}`}>
          <Icon size={23} aria-hidden="true" />
        </span>
        <div>
          <h2 id={id}>{title}</h2>
          <p>{subtitle}</p>
        </div>
      </div>
      <Link className="home-text-link" href="/jobs">
        Xem tất cả <ArrowRight size={17} aria-hidden="true" />
      </Link>
    </div>
  );
}

function AIIntroSection({ user }) {
  const steps = [
    [FileText, "Tải CV lên", "Chỉ mất vài giây"],
    [BrainCircuit, "AI phân tích", "Phân tích kỹ năng, kinh nghiệm"],
    [BriefcaseBusiness, "Gợi ý việc phù hợp", "Những cơ hội tốt nhất dành cho bạn"],
  ];
  return (
    <section className="home-ai-band" id="smart-ai" aria-labelledby="ai-title">
      <div className="site-container home-ai-inner">
        <div className="home-ai-copy">
          <p className="home-eyebrow">SỨC MẠNH CỦA AI</p>
          <h2 id="ai-title">
            Tìm việc thông minh hơn với <span>AI</span>
          </h2>
          <p>
            Biến CV của bạn thành cơ hội. Smart Recruitment AI sử dụng trí tuệ nhân tạo để phân tích kỹ năng, đánh giá
            kinh nghiệm và gợi ý những công việc phù hợp nhất.
          </p>
          <Link className="home-button" href={aiPath(user)}>
            {user && user.role !== "candidate" ? "Bảng điều khiển" : "Khám phá AI"}
            <ArrowRight size={17} />
          </Link>
        </div>
        <ol className="home-ai-flow">
          {steps.map(([Icon, title, subtitle], index) => (
            <li key={title}>
              <span className={`ai-step-icon step-${index}`}>
                <Icon size={32} strokeWidth={1.8} aria-hidden="true" />
              </span>
              <strong>
                {index + 1}. {title}
              </strong>
              <p>{subtitle}</p>
              {index < 2 && <ArrowRight className="ai-step-arrow" size={23} aria-hidden="true" />}
            </li>
          ))}
        </ol>
        <div className="home-ai-features">
          {AI_FEATURES.map(([Icon, title, subtitle]) => (
            <div key={title}>
              <span>
                <Icon size={23} strokeWidth={1.8} aria-hidden="true" />
              </span>
              <div>
                <h3>{title}</h3>
                <p>{subtitle}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function EmployerBand({ user }) {
  const href = employerPath(user);
  if (!href) return null;
  return (
    <section className="home-employer-band" id="employers" aria-labelledby="employer-title">
      <div className="site-container home-employer-inner">
        <div className="home-employer-copy">
          <p className="home-eyebrow">DÀNH CHO NHÀ TUYỂN DỤNG</p>
          <h2 id="employer-title">
            Tuyển đúng người, nhanh hơn với <span>AI</span>
          </h2>
          <p>
            Đăng tin, nhận hồ sơ và để AI chấm điểm mức độ phù hợp của từng ứng viên, giúp bạn tập trung vào những
            người xứng đáng nhất.
          </p>
          <Link className="home-button" href={href}>
            {user ? "Bảng điều khiển" : "Đăng tin tuyển dụng"}
            <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </div>
        <ul className="home-employer-features">
          {EMPLOYER_FEATURES.map(([Icon, title, subtitle]) => (
            <li key={title}>
              <span>
                <Icon size={22} strokeWidth={1.8} aria-hidden="true" />
              </span>
              <div>
                <h3>{title}</h3>
                <p>{subtitle}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function HomeCTA({ user }) {
  return (
    <section className="home-cta-band">
      <div className="site-container home-cta-inner">
        <Send className="home-cta-icon" size={50} strokeWidth={1.4} aria-hidden="true" />
        <div>
          <h2>Sẵn sàng bắt đầu hành trình tìm việc?</h2>
          <p>Để AI đồng hành cùng bạn khám phá những cơ hội tốt hơn.</p>
        </div>
        <div className="home-cta-actions">
          {!user && (
            <Link className="home-button" href="/register">
              Tạo tài khoản miễn phí <ArrowRight size={16} />
            </Link>
          )}
          <Link className={`home-button ${!user ? "secondary" : ""}`} href="/jobs">
            Tìm việc ngay <ArrowRight size={16} />
          </Link>
          {user?.role === "candidate" && (
            <Link className="home-button secondary" href={candidateRoutes.recommendations}>
              Xem gợi ý AI <Sparkles size={16} />
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}

export function Footer({ user }) {
  const employerHref = employerPath(user);
  return (
    <footer className="site-footer" id="about">
      <div className="site-container">
        <div className="site-footer-grid">
          <div className="site-footer-brand">
            <Brand />
            <p>Nền tảng tuyển dụng thông minh tích hợp AI, kết nối ứng viên với cơ hội việc làm phù hợp nhất.</p>
          </div>
          <div>
            <h2>Về Smart Recruitment</h2>
            <Link href="/#smart-ai">Giới thiệu</Link>
            <Link href="/jobs">Việc làm</Link>
            {employerHref && <Link href="/#employers">Dành cho nhà tuyển dụng</Link>}
          </div>
          <div>
            <h2>Ứng viên</h2>
            <Link href="/jobs">Tìm việc</Link>
            <Link href={user && user.role !== "candidate" ? dashboardPath(user) : candidateRoutes.resume}>
              CV của tôi
            </Link>
            <Link href={aiPath(user)}>Gợi ý AI</Link>
          </div>
          {employerHref && (
            <div>
              <h2>Nhà tuyển dụng</h2>
              <Link href={employerHref}>{user ? "Bảng điều khiển" : "Đăng tin tuyển dụng"}</Link>
              <Link href="/#employers">Giải pháp tuyển dụng AI</Link>
            </div>
          )}
          <div>
            <h2>Việc làm phổ biến</h2>
            {FOOTER_SEARCHES.map(([label, params]) => (
              <Link key={label} href={searchHref(params)}>
                {label}
              </Link>
            ))}
          </div>
          <div>
            <h2>Hỗ trợ</h2>
            <span aria-disabled="true">Điều khoản</span>
            <span aria-disabled="true">Chính sách</span>
            <span aria-disabled="true">Liên hệ</span>
          </div>
        </div>
        <div className="site-footer-bottom">
          <span>© 2026 Smart Recruitment AI.</span>
          <span>Tìm việc thông minh hơn với AI</span>
        </div>
      </div>
    </footer>
  );
}
