import React from "react";
import {
  ArrowRight,
  BrainCircuit,
  BriefcaseBusiness,
  Clock3,
  FileText,
  ScanLine,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
  TrendingUp,
} from "lucide-react";
import { candidateRoutes, dashboardPath, Link, loginPath } from "../navigation.jsx";
import { Brand } from "./Navbar.jsx";
import { JobGrid, JobSearchBar, useJobs } from "./PublicJobs.jsx";

const POPULAR_SEARCHES = ["Developer", "Data Analyst", "Marketing", "Product Manager", "Designer"];
const AI_FEATURES = [
  [ScanLine, "Phân tích kỹ năng", "Xác định thế mạnh từ CV của bạn"],
  [ShieldCheck, "Đánh giá kinh nghiệm", "Hiểu rõ kinh nghiệm và mức độ phù hợp"],
  [TrendingUp, "Phát hiện kỹ năng còn thiếu", "Gợi ý kỹ năng cần bổ sung"],
  [BriefcaseBusiness, "Gợi ý việc làm phù hợp", "Đề xuất công việc dựa trên dữ liệu thông minh"],
];

function aiPath(user) {
  return !user
    ? loginPath(candidateRoutes.recommendations)
    : user.role === "candidate"
      ? candidateRoutes.recommendations
      : dashboardPath(user);
}

export default function HomePage({ user }) {
  const state = useJobs();
  const latest = [...state.jobs].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const featured = [...latest].sort((a, b) => b.applicants_count - a.applicants_count).slice(0, 3);
  return (
    <main className="home-page">
      <HeroSection locations={state.jobs.map((job) => job.location)} />
      <section className="site-container home-jobs-section" aria-labelledby="featured-title">
        <SectionHeading
          id="featured-title"
          icon={Star}
          title="Việc làm nổi bật"
          subtitle="Những cơ hội việc làm đáng chú ý dành cho bạn"
          tone="gold"
        />
        <JobGrid {...state} jobs={featured} />
      </section>
      <AIIntroSection user={user} />
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
      <HomeCTA user={user} />
    </main>
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
          <JobSearchBar locations={locations} />
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
  return (
    <footer className="site-footer" id="about">
      <div className="site-container">
        <div className="site-footer-grid">
          <div className="site-footer-brand">
            <Brand />
            <p>Nền tảng tuyển dụng thông minh tích hợp AI.</p>
          </div>
          <div>
            <h2>Về Smart Recruitment</h2>
            <Link href="/#smart-ai">Giới thiệu</Link>
            <Link href="/jobs">Việc làm</Link>
          </div>
          <div>
            <h2>Ứng viên</h2>
            <Link href="/jobs">Tìm việc</Link>
            <Link href={user && user.role !== "candidate" ? dashboardPath(user) : candidateRoutes.resume}>
              CV của tôi
            </Link>
            <Link href={aiPath(user)}>Gợi ý AI</Link>
          </div>
          <div>
            <h2>Hỗ trợ</h2>
            <span aria-disabled="true">Điều khoản</span>
            <span aria-disabled="true">Chính sách</span>
            <span aria-disabled="true">Liên hệ</span>
          </div>
        </div>
        <div className="site-footer-bottom">© 2026 Smart Recruitment AI.</div>
      </div>
    </footer>
  );
}
