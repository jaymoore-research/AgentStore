import HowItWorksSteps from "../components/HowItWorksSteps";

export default function AboutView() {
  const platforms = [
    { x: 80, label: "Claude", colour: "var(--platform-claude)" },
    { x: 220, label: "Cursor", colour: "var(--platform-cursor)" },
    { x: 360, label: "Copilot", colour: "var(--platform-copilot)" },
    { x: 500, label: "Codex", colour: "var(--platform-codex)" },
    { x: 640, label: "Gemini", colour: "var(--text-tertiary)" },
  ];

  return (
    <div className="view">
      <section className="about-hero">
        <h2 className="about-tagline">One place to manage your agents.</h2>
        <p className="about-sub">
          AgentStore installs skills once and shares them across every AI tool you use.
        </p>
      </section>

      <div className="about-diagram">
        <svg viewBox="0 0 720 360" fill="none" xmlns="http://www.w3.org/2000/svg" className="about-svg">
          <defs>
            <linearGradient id="bag" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#FF9A7A" />
              <stop offset="1" stopColor="#C94DA3" />
            </linearGradient>
          </defs>

          {/* Central bag (the store) */}
          <g transform="translate(300, 40)">
            <path d="M45 40 a25 25 0 0 1 50 0" stroke="#7A2E6B" strokeWidth="6" fill="none" strokeLinecap="round" />
            <path d="M28 42 h84 l-8 80 a10 10 0 0 1 -10 9 h-48 a10 10 0 0 1 -10 -9 z" fill="url(#bag)" />
            <text x="70" y="92" textAnchor="middle" fontFamily="Inter, sans-serif" fontWeight="800" fontSize="32" fill="#fff">AS</text>
          </g>

          {/* Fan-out lines */}
          {platforms.map(({ x, colour }) => (
            <line
              key={`line-${x}`}
              x1="370"
              y1="190"
              x2={x}
              y2="260"
              stroke={colour}
              strokeWidth="1.5"
              strokeDasharray="5 4"
            />
          ))}

          {/* Platform chips */}
          {platforms.map(({ x, label, colour }) => (
            <g key={label}>
              <circle cx={x} cy={260} r="5" fill={colour} />
              <rect x={x - 50} y={275} width="100" height="40" rx="10" fill="var(--card-bg)" stroke={colour} strokeWidth="1.5" />
              <text x={x} y={300} textAnchor="middle" fontSize="13" fontWeight="600" fill="var(--text-primary)">{label}</text>
            </g>
          ))}
        </svg>
      </div>

      <HowItWorksSteps />

      <p className="about-note">
        <strong>Powered by symlinks.</strong> Each skill lives in one folder and
        is linked into every tool. Updates happen everywhere at once, and no
        duplicate files bloat your disk.
      </p>
    </div>
  );
}
