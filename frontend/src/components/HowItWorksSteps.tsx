export default function HowItWorksSteps() {
  return (
    <div className="about-steps">
      <div className="about-step">
        <div className="about-step-art">
          <svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="hw1" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#FF9A7A" />
                <stop offset="1" stopColor="#C94DA3" />
              </linearGradient>
            </defs>
            <path d="M60 14 v44 M48 48 l12 12 l12 -12" stroke="#7A2E6B" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M30 62 h60 l-4 24 a6 6 0 0 1 -6 5 h-40 a6 6 0 0 1 -6 -5 z" fill="url(#hw1)" />
          </svg>
        </div>
        <h4>Install once</h4>
        <p>Pull any skill pack straight from GitHub into one central folder.</p>
      </div>

      <div className="about-step">
        <div className="about-step-art">
          <svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="hw2" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#FF9A7A" />
                <stop offset="1" stopColor="#C94DA3" />
              </linearGradient>
            </defs>
            <circle cx="60" cy="50" r="14" fill="url(#hw2)" />
            <circle cx="24" cy="28" r="7" fill="none" stroke="#C94DA3" strokeWidth="2.5" />
            <circle cx="24" cy="72" r="7" fill="none" stroke="#C94DA3" strokeWidth="2.5" />
            <circle cx="96" cy="28" r="7" fill="none" stroke="#FF9A7A" strokeWidth="2.5" />
            <circle cx="96" cy="72" r="7" fill="none" stroke="#FF9A7A" strokeWidth="2.5" />
            <line x1="46" y1="50" x2="31" y2="32" stroke="#C94DA3" strokeWidth="1.5" strokeDasharray="3 3" />
            <line x1="46" y1="50" x2="31" y2="68" stroke="#C94DA3" strokeWidth="1.5" strokeDasharray="3 3" />
            <line x1="74" y1="50" x2="89" y2="32" stroke="#FF9A7A" strokeWidth="1.5" strokeDasharray="3 3" />
            <line x1="74" y1="50" x2="89" y2="68" stroke="#FF9A7A" strokeWidth="1.5" strokeDasharray="3 3" />
          </svg>
        </div>
        <h4>Share everywhere</h4>
        <p>Symlinks fan it out to every AI tool. No copies, no bloat.</p>
      </div>

      <div className="about-step">
        <div className="about-step-art">
          <svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="hw3" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#FF9A7A" />
                <stop offset="1" stopColor="#C94DA3" />
              </linearGradient>
            </defs>
            <path d="M30 50 a30 30 0 1 1 14 25" stroke="url(#hw3)" strokeWidth="6" fill="none" strokeLinecap="round" />
            <path d="M30 50 l-8 -4 l4 10 z" fill="#FF9A7A" />
            <circle cx="60" cy="50" r="6" fill="#C94DA3" />
          </svg>
        </div>
        <h4>Update once</h4>
        <p>Pull upstream changes and every tool sees the new version instantly.</p>
      </div>
    </div>
  );
}
