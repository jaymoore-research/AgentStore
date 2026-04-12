export default function AboutView() {
  return (
    <div className="view">
      <h2 className="view-title">About AgentStore</h2>

      {/* How it works */}
      <section className="about-section">
        <h3 className="about-heading">How it works</h3>
        <p className="about-text">
          AgentStore is a local package manager for AI agent skills. It downloads
          skill packages from GitHub into a single central folder, then creates
          lightweight symlinks into each platform's config directory. The files
          only exist once on disk: every tool reads the same source.
        </p>

        {/* Architecture diagram */}
        <div className="about-diagram">
          <svg viewBox="0 0 720 380" fill="none" xmlns="http://www.w3.org/2000/svg" className="about-svg">
            {/* GitHub cloud */}
            <g>
              <rect x="260" y="10" width="200" height="60" rx="12" fill="var(--accent-subtle)" stroke="var(--accent)" strokeWidth="1.5" />
              <text x="360" y="36" textAnchor="middle" fontSize="13" fontWeight="600" fill="var(--text-primary)">GitHub</text>
              <text x="360" y="54" textAnchor="middle" fontSize="11" fill="var(--text-secondary)">e.g. obra/superpowers</text>
            </g>

            {/* Arrow: GitHub to Central store */}
            <line x1="360" y1="70" x2="360" y2="120" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeDasharray="6 3" />
            <polygon points="354,116 360,128 366,116" fill="var(--text-tertiary)" />
            <text x="375" y="100" fontSize="10" fill="var(--text-tertiary)">git clone</text>

            {/* Central store box */}
            <rect x="200" y="130" width="320" height="80" rx="14" fill="var(--card-bg)" stroke="var(--accent)" strokeWidth="2" />
            <text x="360" y="158" textAnchor="middle" fontSize="14" fontWeight="700" fill="var(--text-primary)">~/Library/.../AgentStore/packages/</text>
            <text x="360" y="178" textAnchor="middle" fontSize="11" fill="var(--text-secondary)">Skills, MCP servers, instructions</text>
            <text x="360" y="198" textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--accent)">Single copy on disk</text>

            {/* Symlink fan-out arrows */}
            {[
              { x: 72, label: "Claude", sub: "~/.claude/", colour: "var(--platform-claude)" },
              { x: 216, label: "Cursor", sub: "~/.cursor/", colour: "var(--platform-cursor)" },
              { x: 360, label: "Copilot", sub: "~/.github/", colour: "var(--platform-copilot)" },
              { x: 504, label: "Codex", sub: "~/.codex/", colour: "var(--platform-codex)" },
              { x: 648, label: "More...", sub: "Gemini, VS Code", colour: "var(--text-tertiary)" },
            ].map(({ x, label, sub, colour }) => (
              <g key={label}>
                <line
                  x1="360" y1="210"
                  x2={x} y2="270"
                  stroke={colour}
                  strokeWidth="1.5"
                  strokeDasharray="5 3"
                />
                <circle cx={x} cy="270" r="4" fill={colour} />
                <rect
                  x={x - 60} y="280"
                  width="120" height="52"
                  rx="10"
                  fill="var(--card-bg)"
                  stroke={colour}
                  strokeWidth="1.5"
                />
                <text x={x} y="302" textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--text-primary)">{label}</text>
                <text x={x} y="320" textAnchor="middle" fontSize="10" fill="var(--text-tertiary)">{sub}</text>
              </g>
            ))}

            {/* Symlink label */}
            <rect x="245" y="232" width="230" height="24" rx="6" fill="var(--bg-secondary)" />
            <text x="360" y="248" textAnchor="middle" fontSize="11" fontWeight="500" fill="var(--text-secondary)">
              symlinks  —  zero-copy ghost files
            </text>
          </svg>
        </div>
      </section>

      {/* Key concepts */}
      <section className="about-section">
        <h3 className="about-heading">Key concepts</h3>
        <div className="about-cards">
          <div className="about-card">
            <div className="about-card-icon">&#x1f4e6;</div>
            <h4>One source, many tools</h4>
            <p>
              Each package is cloned once. Symlinks make it appear in every
              platform's skills directory without duplicating files. Edit a skill
              in one place and every tool sees the change instantly.
            </p>
          </div>
          <div className="about-card">
            <div className="about-card-icon">&#x1f504;</div>
            <h4>Version control built in</h4>
            <p>
              Packages are full Git repos. Improve a skill locally, commit the
              change, and push it back to GitHub. Pull updates from upstream
              with a single click.
            </p>
          </div>
          <div className="about-card">
            <div className="about-card-icon">&#x1f517;</div>
            <h4>Symlinks, not copies</h4>
            <p>
              Symlinks are lightweight filesystem pointers. They use no extra
              disk space and stay in sync automatically. AgentStore manages
              creating and removing them for you.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
