import React from "react";

export default function CandidateHero({ title, description, children, className = "" }) {
  return (
    <section className={`candidate-hero-shell ${className}`}>
      <div className="candidate-hero-copy">
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {children && <div className="candidate-hero-extra">{children}</div>}
    </section>
  );
}
