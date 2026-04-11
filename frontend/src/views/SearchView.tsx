import { useState, useRef, useCallback } from "react";

interface SearchResult {
  full_name: string;
  owner: { login: string };
  name: string;
  description: string | null;
  stargazers_count: number;
  language: string | null;
  topics: string[];
  html_url: string;
  default_branch: string;
}

interface Props {
  onInstall: (repo: string) => void;
  installedRepos: Set<string>;
}

export default function SearchView({ onInstall, installedRepos }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setSearched(false);
      return;
    }

    setLoading(true);
    setError(null);
    setSearched(true);

    try {
      // Direct owner/repo lookup
      if (/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(q.trim())) {
        const res = await fetch(`https://api.github.com/repos/${q.trim()}`, {
          headers: { "Accept": "application/vnd.github+json" },
        });
        if (res.ok) {
          const repo = await res.json();
          setResults([repo]);
          setLoading(false);
          return;
        }
        // Fall through to search if direct lookup fails
      }

      const res = await fetch(
        `https://api.github.com/search/repositories?q=${encodeURIComponent(q.trim())}&sort=stars&order=desc&per_page=20`,
        { headers: { "Accept": "application/vnd.github+json" } }
      );

      if (res.status === 403) {
        setError("GitHub rate limit reached. Wait a minute and try again.");
        setLoading(false);
        return;
      }

      if (!res.ok) {
        setError(`GitHub API error: ${res.status}`);
        setLoading(false);
        return;
      }

      const data = await res.json();
      setResults(data.items ?? []);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  function handleInput(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(value), 400);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      search(query);
    }
  }

  function formatStars(n: number): string {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return String(n);
  }

  return (
    <div className="view search-view">
      <h2 className="view-title">Browse Packages</h2>
      <p className="search-subtitle">
        Search GitHub for agent skill repositories, or paste an owner/repo directly.
      </p>

      <div className="search-bar">
        <input
          className="search-input"
          type="text"
          placeholder="Search repos or paste owner/repo..."
          value={query}
          onChange={(e) => handleInput(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
        />
      </div>

      {error && <p className="form-error">{error}</p>}

      {loading && <p className="search-status">Searching...</p>}

      {!loading && searched && results.length === 0 && (
        <p className="search-status">No results found.</p>
      )}

      <div className="search-results">
        {results.map((repo) => (
          <div key={repo.full_name} className="search-card">
            <div className="search-card-header">
              <div className="search-card-info">
                <h3 className="search-card-name">{repo.name}</h3>
                <span className="search-card-owner">{repo.owner.login}</span>
              </div>
              <div className="search-card-meta">
                {repo.stargazers_count > 0 && (
                  <span className="search-card-stars">{formatStars(repo.stargazers_count)}</span>
                )}
                {repo.language && (
                  <span className="search-card-lang">{repo.language}</span>
                )}
              </div>
            </div>

            {repo.description && (
              <p className="search-card-desc">{repo.description}</p>
            )}

            {repo.topics.length > 0 && (
              <div className="search-card-topics">
                {repo.topics.slice(0, 6).map((t) => (
                  <span key={t} className="topic-tag">{t}</span>
                ))}
              </div>
            )}

            <div className="search-card-actions">
              <a
                className="btn btn-secondary btn-sm"
                href={repo.html_url}
                target="_blank"
                rel="noreferrer"
              >
                View on GitHub
              </a>
              {installedRepos.has(repo.full_name.toLowerCase()) ? (
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => onInstall(repo.full_name)}
                >
                  Update
                </button>
              ) : (
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => onInstall(repo.full_name)}
                >
                  Install
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
