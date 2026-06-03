import { useState } from "react";

const theme = {
  bg: "#0d0f14",
  surface: "#161921",
  card: "#1c2030",
  border: "#252d3d",
  accent: "#4f9cf9",
  accentGlow: "rgba(79,156,249,0.15)",
  gold: "#f0b429",
  goldGlow: "rgba(240,180,41,0.15)",
  green: "#34d399",
  purple: "#a78bfa",
  red: "#f87171",
  textPrimary: "#e8ecf4",
  textSecondary: "#8b95a8",
  textMuted: "#4a5568",
};

const sections = [
  {
    id: "overview",
    icon: "🗺️",
    title: "The Big Picture",
    color: theme.accent,
    content: Overview,
  },
  {
    id: "entry",
    icon: "🚪",
    title: "Entry Points",
    color: theme.gold,
    content: EntryPoints,
  },
  {
    id: "data",
    icon: "📥",
    title: "Data Fetching",
    color: theme.green,
    content: DataFetching,
  },
  {
    id: "features",
    icon: "🧮",
    title: "Feature Engineering",
    color: theme.purple,
    content: FeatureEngineering,
  },
  {
    id: "ml",
    icon: "🤖",
    title: "ML Models",
    color: theme.accent,
    content: MLModels,
  },
  {
    id: "validation",
    icon: "✅",
    title: "Validation",
    color: theme.gold,
    content: Validation,
  },
  {
    id: "output",
    icon: "📤",
    title: "Output & Storage",
    color: theme.green,
    content: OutputStorage,
  },
  {
    id: "degradation",
    icon: "🛡️",
    title: "Graceful Degradation",
    color: theme.purple,
    content: Degradation,
  },
];

function Tag({ children, color }) {
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 10px",
      borderRadius: "999px",
      fontSize: "11px",
      fontFamily: "'JetBrains Mono', monospace",
      fontWeight: 600,
      background: color + "20",
      color: color,
      border: `1px solid ${color}40`,
      letterSpacing: "0.04em",
    }}>{children}</span>
  );
}

function CodeBlock({ children, lang = "python" }) {
  return (
    <pre style={{
      background: "#0a0c10",
      border: `1px solid ${theme.border}`,
      borderLeft: `3px solid ${theme.accent}`,
      borderRadius: "8px",
      padding: "16px 20px",
      fontSize: "12.5px",
      fontFamily: "'JetBrains Mono', monospace",
      overflowX: "auto",
      color: "#c9d6e8",
      margin: "12px 0",
      lineHeight: 1.7,
    }}>
      <code>{children}</code>
    </pre>
  );
}

function AnalogBox({ emoji, title, children, color = theme.accent }) {
  return (
    <div style={{
      background: color + "0d",
      border: `1px solid ${color}30`,
      borderRadius: "12px",
      padding: "16px 20px",
      margin: "12px 0",
    }}>
      <div style={{ fontSize: "13px", fontWeight: 700, color, marginBottom: "6px" }}>
        {emoji} Analogy
        <span style={{ marginLeft: "8px", color: theme.textSecondary, fontWeight: 400 }}>{title}</span>
      </div>
      <div style={{ fontSize: "14px", color: theme.textSecondary, lineHeight: 1.7 }}>{children}</div>
    </div>
  );
}

function InfoCard({ label, value, sub, color = theme.accent }) {
  return (
    <div style={{
      background: theme.card,
      border: `1px solid ${theme.border}`,
      borderRadius: "10px",
      padding: "14px 16px",
      flex: 1,
      minWidth: "140px",
    }}>
      <div style={{ fontSize: "11px", color: theme.textMuted, marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
      <div style={{ fontSize: "16px", fontWeight: 700, color, fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
      {sub && <div style={{ fontSize: "11.5px", color: theme.textSecondary, marginTop: "4px" }}>{sub}</div>}
    </div>
  );
}

function SectionTitle({ children, color }) {
  return (
    <h3 style={{
      fontSize: "13px",
      fontWeight: 700,
      color,
      textTransform: "uppercase",
      letterSpacing: "0.12em",
      margin: "24px 0 10px",
      paddingBottom: "6px",
      borderBottom: `1px solid ${color}30`,
    }}>{children}</h3>
  );
}

function Param({ name, type, desc }) {
  return (
    <div style={{
      display: "flex",
      gap: "12px",
      padding: "10px 0",
      borderBottom: `1px solid ${theme.border}`,
      alignItems: "flex-start",
    }}>
      <code style={{ color: theme.accent, fontFamily: "'JetBrains Mono', monospace", fontSize: "13px", minWidth: "160px", flexShrink: 0 }}>{name}</code>
      <span style={{ color: theme.purple, fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", marginTop: "2px", minWidth: "70px", flexShrink: 0 }}>{type}</span>
      <span style={{ color: theme.textSecondary, fontSize: "13.5px", lineHeight: 1.6 }}>{desc}</span>
    </div>
  );
}

function MetricRow({ key: _k, name, meaning, range }) {
  return (
    <div style={{ padding: "10px 0", borderBottom: `1px solid ${theme.border}` }}>
      <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
        <code style={{ color: theme.gold, fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", minWidth: "180px" }}>{name}</code>
        <span style={{ color: theme.textSecondary, fontSize: "13px", lineHeight: 1.6 }}>{meaning}</span>
      </div>
      {range && <div style={{ marginTop: "4px", marginLeft: "0", fontSize: "12px", color: theme.textMuted }}>{range}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// SECTION CONTENT COMPONENTS
// ─────────────────────────────────────────────────────────

function Overview() {
  return (
    <div>
      <p style={{ color: theme.textSecondary, lineHeight: 1.8, fontSize: "14.5px", marginBottom: "20px" }}>
        Think of this pipeline like a very smart stock analyst who, every time you ask "what will this ETF be worth in 1, 5, or 10 years?",
        goes through a structured checklist: <strong style={{ color: theme.textPrimary }}>gather data → understand the environment → model the trend → quantify uncertainty → validate honestly → return results.</strong>
      </p>

      <AnalogBox emoji="🍳" title="The Kitchen Analogy" color={theme.accent}>
        The <strong>orchestrator</strong> (<code style={{color: theme.accent}}>run_forecast</code>) is the head chef. She doesn't cook everything herself — she calls her specialist sous-chefs:
        the data fetcher, the volatility specialist (GARCH), the regime detector (HMM), the trend modeller (ETS/OLS), and the validator.
        Each one does their job, hands the result back, and the head chef assembles the final dish.
      </AnalogBox>

      <SectionTitle color={theme.accent}>The Flow — Step by Step</SectionTitle>

      {[
        ["1", theme.accent, "HTTP Request", "Frontend sends POST /api/etf/ISWD.SW/forecast?horizon=5y"],
        ["2", theme.gold, "Fetch History", "_fetch_history() → pulls ETF price history from Yahoo Finance"],
        ["3", theme.gold, "Fetch Context", "_fetch_exogenous() → pulls VIX (fear index), SPY, XLK, XLF"],
        ["4", theme.purple, "Shariah Features", "_rebalance_flags(), _xlk_xlf_ratio(), _rolling_correlations()"],
        ["5", theme.green, "GARCH Volatility", "_run_garch() → forecasts per-step market volatility"],
        ["6", theme.green, "HMM Regime", "_detect_regime() → are we in a calm or turbulent market?"],
        ["7", theme.accent, "Point Forecast", "_run_ets() or _run_loglinear() → the actual price prediction"],
        ["8", theme.gold, "Validation", "_wf_metrics() → honest walk-forward accuracy testing"],
        ["9", theme.purple, "Factor Analysis", "_factor_regression() → Jensen alpha, market beta"],
        ["10", theme.green, "Save + Return", "Persist to PostgreSQL, send JSON back to frontend"],
      ].map(([step, color, title, desc]) => (
        <div key={step} style={{ display: "flex", gap: "16px", marginBottom: "10px", alignItems: "flex-start" }}>
          <div style={{
            width: "28px", height: "28px", borderRadius: "50%", background: color + "20",
            border: `1.5px solid ${color}`, display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "12px", fontWeight: 700, color, flexShrink: 0,
          }}>{step}</div>
          <div>
            <span style={{ fontWeight: 600, color: theme.textPrimary, fontSize: "14px" }}>{title}</span>
            <span style={{ color: theme.textSecondary, fontSize: "13px", marginLeft: "8px" }}>{desc}</span>
          </div>
        </div>
      ))}

      <SectionTitle color={theme.accent}>Horizon Configuration</SectionTitle>
      <p style={{ color: theme.textSecondary, fontSize: "13.5px", marginBottom: "12px" }}>
        The pipeline behaves differently depending on how far ahead you're forecasting. Longer horizons need different data granularity and different models.
      </p>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${theme.border}` }}>
              {["Horizon", "Data bars", "Steps", "Model", "Damped?", "WF steps"].map(h => (
                <th key={h} style={{ padding: "8px 12px", color: theme.textMuted, textAlign: "left", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              ["1y", "weekly", "52 weeks", "ETS (Holt-Winters)", "No", "1 week ahead"],
              ["5y", "weekly", "260 weeks", "ETS (Holt-Winters)", "Yes ⬇️", "4 weeks ahead"],
              ["10y", "monthly", "120 months", "Log-linear OLS", "—", "3 months ahead"],
            ].map(([h, ...cols], i) => (
              <tr key={h} style={{ borderBottom: `1px solid ${theme.border}`, background: i % 2 === 0 ? "transparent" : theme.surface + "80" }}>
                <td style={{ padding: "10px 12px" }}>
                  <Tag color={theme.accent}>{h}</Tag>
                </td>
                {cols.map((c, j) => (
                  <td key={j} style={{ padding: "10px 12px", color: theme.textSecondary }}>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AnalogBox emoji="📅" title="Why different bar sizes?" color={theme.gold}>
        For a 1-year forecast you want to see weekly wiggles — they matter. But for a 10-year view, weekly noise is just noise. Monthly bars smooth it out so you can see the long-term slope. Same reason you'd use a city-level map for a day trip but a country-level map for a road trip.
      </AnalogBox>
    </div>
  );
}

function EntryPoints() {
  return (
    <div>
      <SectionTitle color={theme.gold}>The HTTP Route</SectionTitle>
      <CodeBlock>{`@app.post("/api/etf/{symbol}/forecast")
def run_etf_forecast(symbol: str, horizon: str = Query("1y")):
    # 1. uppercase the symbol (safety)
    # 2. call run_forecast(symbol, horizon)
    # 3. on ValueError → HTTP 422 (bad input)
    # 4. on other error → HTTP 502 (server problem)
    # 5. on success → save to DB + return JSON`}</CodeBlock>

      <p style={{ color: theme.textSecondary, fontSize: "14px", lineHeight: 1.8 }}>
        This is the front door. When the React frontend clicks "Forecast", it hits this URL.
        Think of it as a receptionist: it takes your request, validates it, passes it to the expert team (<code style={{ color: theme.accent }}>run_forecast</code>),
        and handles any errors gracefully before returning the result.
      </p>

      <SectionTitle color={theme.gold}>Parameters</SectionTitle>
      <Param name="symbol" type="str" desc="The ETF ticker — e.g. ISWD.SW, IGDA.L, ISDE.L. Gets uppercased automatically." />
      <Param name="horizon" type="str" desc={`One of "1y", "5y", "10y". Anything else raises HTTP 422.`} />

      <SectionTitle color={theme.gold}>HTTP Status Codes</SectionTitle>
      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", margin: "12px 0" }}>
        <InfoCard label="200 OK" value="✅ Success" sub="Forecast computed & saved" color={theme.green} />
        <InfoCard label="422" value="⚠️ Bad Input" sub="Invalid horizon or ticker" color={theme.gold} />
        <InfoCard label="502" value="❌ Server Error" sub="Something failed internally" color={theme.red} />
        <InfoCard label="404" value="🔍 Not Found" sub="GET with no saved forecast" color={theme.purple} />
      </div>

      <SectionTitle color={theme.gold}>GET vs POST</SectionTitle>
      <p style={{ color: theme.textSecondary, fontSize: "14px", lineHeight: 1.8 }}>
        There are two sibling routes. <Tag color={theme.accent}>POST</Tag> <strong style={{ color: theme.textPrimary }}>runs</strong> a fresh forecast and saves it.
        <Tag color={theme.green} style={{ marginLeft: "8px" }}>GET</Tag> <strong style={{ color: theme.textPrimary }}>retrieves</strong> the last saved forecast without re-computing.
        This is important for performance — you don't re-run ML models on every page load.
      </p>
    </div>
  );
}

function DataFetching() {
  return (
    <div>
      <SectionTitle color={theme.green}>_fetch_history() — Getting ETF Prices</SectionTitle>
      <CodeBlock>{`_fetch_history(symbol="ISWD.SW", interval="1wk", timeout=20)
# Returns: (dates, closes, currency)
# Example:  (["2020-01-06", ...], [65.3, 66.1, ...], "USD")`}</CodeBlock>

      <p style={{ color: theme.textSecondary, fontSize: "14px", lineHeight: 1.8 }}>
        This function calls the <strong style={{ color: theme.textPrimary }}>Yahoo Finance API</strong> — a free, unofficial endpoint. It asks for the maximum available history at the requested interval.
      </p>

      <AnalogBox emoji="📚" title="Like a library book request" color={theme.green}>
        You ask: "Give me every weekly closing price for ISWD.SW since the beginning." Yahoo Finance hands back a big JSON. The function digs through it, pulls out the timestamps and closing prices, removes any gaps (missing weeks), and sorts them oldest-to-newest.
      </AnalogBox>

      <SectionTitle color={theme.green}>What the API returns (raw JSON shape)</SectionTitle>
      <CodeBlock>{`{
  "chart": {
    "result": [{
      "timestamp": [1578268800, 1578873600, ...],  // Unix timestamps
      "indicators": {
        "quote": [{
          "close": [65.3, 66.1, null, 67.2, ...]   // null = missing week
        }]
      },
      "meta": { "currency": "USD" }
    }]
  }
}`}</CodeBlock>

      <SectionTitle color={theme.green}>Minimum data requirements</SectionTitle>
      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
        <InfoCard label="ETS (1y/5y)" value="≥ 20 bars" sub="Weekly data points needed" color={theme.accent} />
        <InfoCard label="OLS (10y)" value="≥ 12 bars" sub="Monthly data points needed" color={theme.gold} />
      </div>
      <p style={{ color: theme.textSecondary, fontSize: "13.5px", marginTop: "12px", lineHeight: 1.7 }}>
        If the ETF is too new (e.g. launched 6 months ago), the function raises a <code style={{ color: theme.red }}>ValueError</code> and the pipeline stops — you can't reliably forecast something with almost no history.
      </p>

      <SectionTitle color={theme.green}>_fetch_exogenous() — Getting Context Data</SectionTitle>
      <CodeBlock>{`_fetch_exogenous(interval="1wk", n_points=260)
# Returns: dict with keys "vix", "xlk", "xlf", "spy"
# Each key → array of closing prices aligned to ETF tail`}</CodeBlock>

      <p style={{ color: theme.textSecondary, fontSize: "14px", lineHeight: 1.8 }}>
        "Exogenous" just means <em>external</em> — data from outside the ETF itself that might explain or predict its behaviour.
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", margin: "12px 0" }}>
        {[
          ["^VIX", theme.red, "Fear Index", "High VIX = market is nervous. Low VIX = calm. Think of it as the market's anxiety meter."],
          ["XLK", theme.accent, "Tech Sector", "S&P 500 Technology ETF. Shariah ETFs often overweight tech, so this is a key driver."],
          ["XLF", theme.gold, "Financials Sector", "S&P 500 Financials ETF. Shariah ETFs exclude financials, so it's used for comparison."],
          ["SPY", theme.green, "Broad Market", "Tracks the entire S&P 500. Used as the 'market baseline' in factor regression."],
        ].map(([ticker, color, name, desc]) => (
          <div key={ticker} style={{
            background: theme.card, border: `1px solid ${theme.border}`, borderRadius: "10px",
            padding: "14px 16px", flex: "1", minWidth: "200px",
          }}>
            <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "6px" }}>
              <Tag color={color}>{ticker}</Tag>
              <span style={{ color: theme.textPrimary, fontWeight: 600, fontSize: "13px" }}>{name}</span>
            </div>
            <p style={{ color: theme.textSecondary, fontSize: "13px", margin: 0, lineHeight: 1.6 }}>{desc}</p>
          </div>
        ))}
      </div>

      <p style={{ color: theme.textSecondary, fontSize: "13.5px", lineHeight: 1.7 }}>
        <strong style={{ color: theme.textPrimary }}>n_points alignment:</strong> The function keeps only the <em>last n_points</em> from each series —
        same length as the ETF history. This ensures all series are perfectly synchronized in time.
        If any series fails to fetch (network error, delisted), it's silently skipped. The pipeline degrades gracefully.
      </p>
    </div>
  );
}

function FeatureEngineering() {
  return (
    <div>
      <p style={{ color: theme.textSecondary, fontSize: "14.5px", lineHeight: 1.8, marginBottom: "20px" }}>
        These functions create new information from raw data — like a financial analyst who doesn't just look at raw prices but computes ratios, trends, and relationships.
      </p>

      <SectionTitle color={theme.purple}>_rebalance_flags() — Shariah Calendar Effect</SectionTitle>
      <CodeBlock>{`_rebalance_flags(dates)  # dates = list of ISO date strings
# Returns: np.ndarray of 1.0 (flag week) or 0.0 (normal week)`}</CodeBlock>

      <AnalogBox emoji="🗓️" title="Index Review Periods" color={theme.purple}>
        Think of Shariah indices (MSCI Islamic, DJIM) like a club with a strict membership committee that meets 4 times a year.
        During review weeks, they decide which companies get added or removed. Fund managers who track these indices
        must buy/sell accordingly — this creates predictable bumps in trading volume and price pressure.
        The flags mark those weeks as "watch out, something predictable is happening."
      </AnalogBox>

      <p style={{ color: theme.textSecondary, fontSize: "13.5px", lineHeight: 1.7 }}>
        <strong style={{ color: theme.purple }}>MSCI Islamic</strong> reviews: Feb, May, Aug, Nov (weeks 2–3 of month).
        <br /><strong style={{ color: theme.purple }}>DJIM</strong> reviews: Mar, Jun, Sep, Dec (weeks 2–3 of month).
        <br />The pipeline collapses the last 52 weeks into <code style={{ color: theme.gold }}>rebalance_pressure_pct</code> = (mean of flags × 100). Higher = more recent review activity.
      </p>

      <SectionTitle color={theme.purple}>_xlk_xlf_ratio() — Tech vs Financials</SectionTitle>
      <CodeBlock>{`_xlk_xlf_ratio(exog)
# Returns: float, e.g. 2.47
# = XLK[-1] / XLF[-1]`}</CodeBlock>

      <AnalogBox emoji="⚖️" title="Sector Tug-of-War" color={theme.gold}>
        Shariah ETFs overweight tech (halal) and exclude financials (riba = prohibited interest). So when tech is outperforming financials, Shariah ETFs tend to do well relative to the market.
        A ratio above 2 means tech is strongly leading. A ratio near 1 means they're roughly equal. This single number captures that regime.
      </AnalogBox>

      <SectionTitle color={theme.purple}>_rolling_correlations() — Relationship Strength</SectionTitle>
      <CodeBlock>{`_rolling_correlations(closes, exog, window=26)
# Returns: { "corr_vs_spy": 0.82, "corr_vs_vix": -0.31 }`}</CodeBlock>

      <p style={{ color: theme.textSecondary, fontSize: "14px", lineHeight: 1.8 }}>
        Pearson correlation over the last 26 weeks of <strong style={{ color: theme.textPrimary }}>log returns</strong> (not raw prices).
      </p>

      <AnalogBox emoji="🔗" title="What is log return?" color={theme.purple}>
        Instead of raw price change (£65 → £70 = +£5), log return is ln(70/65) ≈ 7.4%. Why?
        Because you can add log returns over time but not raw percentage changes.
        "The ETF went up 3% then down 3%" is NOT zero in raw %, but it IS zero in log returns. Log returns are the honest mathematics of compounding.
      </AnalogBox>

      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "12px" }}>
        <InfoCard label="corr_vs_spy" value="+0.82" sub="Moves closely with the market" color={theme.green} />
        <InfoCard label="corr_vs_vix" value="-0.31" sub="Weakly inversely related to fear" color={theme.red} />
      </div>
      <p style={{ color: theme.textMuted, fontSize: "12.5px", marginTop: "8px" }}>
        Correlation of 1.0 = moves perfectly together. -1.0 = opposite. 0 = no relationship. A 26-week window means "recent" not "all-time" — the relationship can change.
      </p>
    </div>
  );
}

function MLModels() {
  return (
    <div>

      {/* GARCH */}
      <SectionTitle color={theme.accent}>GARCH(1,1) — Volatility Forecasting</SectionTitle>
      <CodeBlock>{`_run_garch(closes, n_steps)
# Returns: (garch_std_array, diagnostics_dict)
# garch_std[k] = expected daily-return std at step k into the future`}</CodeBlock>

      <AnalogBox emoji="🌊" title="Volatility Clusters Like Weather" color={theme.accent}>
        Stock markets are stormy in clusters. When it was volatile last week, it's probably volatile this week too. GARCH captures this: it says "today's variance = some base level + fraction of yesterday's surprise² + fraction of yesterday's variance." It learns HOW volatile the market is right now and projects that forward.
      </AnalogBox>

      <p style={{ color: theme.textSecondary, fontSize: "14px", lineHeight: 1.8, marginTop: "12px" }}>
        <strong style={{ color: theme.textPrimary }}>GARCH(1,1)</strong> has three learned parameters:
      </p>
      <Param name="omega (ω)" type="float" desc="Long-run baseline variance. The 'calm weather' floor." />
      <Param name="alpha (α)" type="float" desc="Sensitivity to recent shocks. High α = volatile when there's been recent drama." />
      <Param name="beta (β)" type="float" desc="How much yesterday's volatility persists into today. High β = volatile conditions linger." />
      <Param name="persistence = α+β" type="float" desc="If close to 1.0, volatility takes a long time to settle. >1.0 would be explosive (unstable)." />
      <Param name="long_run_annual_vol" type="%" desc="Annualised unconditional volatility from ω/(1−persistence). The 'average' storm intensity." />

      <AnalogBox emoji="📐" title="How CI Uses GARCH" color={theme.accent}>
        For a forecast h steps ahead, the uncertainty doesn't just scale linearly — it uses the sum of variances: <strong>√Σ garch_std[k]²</strong>. Like how weather uncertainty compounds: tomorrow is uncertain, next week is even more uncertain, and the compounding is non-linear.
      </AnalogBox>

      {/* HMM */}
      <SectionTitle color={theme.green}>HMM — Market Regime Detection</SectionTitle>
      <CodeBlock>{`_detect_regime(closes, exog)
# Returns:
{
  "current_state": 1,
  "is_high_vol": True,
  "regime_label": "High-Volatility",
  "regime_prob": 0.87,
  "ci_multiplier": 1.35   # ← wider bands in turbulent markets
}`}</CodeBlock>

      <AnalogBox emoji="🌦️" title="Two Weather Modes" color={theme.green}>
        Imagine the market has only two secret modes: "sunny season" (low volatility, steady growth) and "storm season" (high volatility, choppy). You can't observe the mode directly — you can only see what the prices do. HMM is an algorithm that looks at price movements and VIX changes and says "right now we're most likely in storm season (87% confident)."
      </AnalogBox>

      <p style={{ color: theme.textSecondary, fontSize: "14px", lineHeight: 1.8 }}>
        It's called "Hidden" Markov Model because the <em>state</em> (calm/turbulent) is hidden — you infer it from observations.
        The "Markov" part means: tomorrow's state only depends on today's state, not all of history.
      </p>

      <Param name="n_states" type="int=2" desc="How many regimes to fit. 2 is standard: calm and turbulent." />
      <Param name="n_iter" type="int=150" desc="EM algorithm iterations for fitting. More = more precise but slower." />
      <Param name="random_state" type="int=42" desc="Seeds randomness so results are reproducible." />
      <Param name="ci_multiplier" type="float" desc="1.0 in calm regime, 1.35 in high-vol regime. Widens confidence bands by 35% when markets are stormy." />

      {/* ETS */}
      <SectionTitle color={theme.gold}>ETS — Exponential Smoothing (Point Forecast)</SectionTitle>
      <CodeBlock>{`_run_ets(closes, n_steps, damped, garch_std, ci_mult)
# Returns:
{
  "forecast_values": [...],  # point forecast
  "conf_lower": [...],       # lower 95% CI
  "conf_upper": [...],       # upper 95% CI
  "metrics": { "aic": ..., "bic": ..., "alpha": ..., "beta": ..., "sigma": ... }
}`}</CodeBlock>

      <AnalogBox emoji="🧠" title="Weighted Recent Memory" color={theme.gold}>
        ETS says: "I care more about what happened recently than 3 years ago." It's like a person who remembers last week vividly but treats events from 2022 as foggy background noise.
        The α (level) and β (trend) parameters control exactly how quickly old information fades.
        A high α means "I almost forget everything older than a month." Low α means "I have a long memory."
      </AnalogBox>

      <Param name="trend='add'" type="str" desc="Additive trend: assumes the level grows by a constant amount per period. Good for ETFs that trend steadily." />
      <Param name="damped (1y=False, 5y=True)" type="bool" desc="For 5y, the trend slows down as you project further — the forecast 'levels off' rather than extrapolating indefinitely in a straight line. Prevents overconfident long-range extrapolation." />
      <Param name="alpha" type="float (0–1)" desc="Level smoothing weight. High α = reacts fast to price changes." />
      <Param name="beta" type="float (0–1)" desc="Trend smoothing weight. How responsive the trend estimate is." />
      <Param name="phi" type="float (0–1)" desc="Damping factor (only when damped=True). How quickly the trend fades toward zero." />
      <Param name="sigma" type="float" desc="Standard deviation of residuals — baseline forecast error." />
      <Param name="AIC / BIC" type="float" desc="Model quality scores. Lower = better fit. BIC penalises complexity more than AIC." />

      <AnalogBox emoji="🎯" title="Confidence Band Construction" color={theme.gold}>
        The band blends two uncertainty sources: (1) ETS residual floor (σ × √h — grows like a random walk) and (2) GARCH cumulative variance (market-derived). The pipeline takes the <strong>max</strong> of both and multiplies by the HMM regime multiplier. This is conservative by design — the band is never too narrow.
      </AnalogBox>

      {/* Log-linear OLS */}
      <SectionTitle color={theme.purple}>Log-Linear OLS — 10-Year Trend</SectionTitle>
      <CodeBlock>{`_run_loglinear(closes, n_steps, ci_mult)
# Returns:
{
  "forecast_values": [...],
  "metrics": { "cagr_pct": 7.4, "r_squared": 0.91, "sigma_annual": 0.14, "n_train": 84 }
}`}</CodeBlock>

      <AnalogBox emoji="📈" title="Why Log Space?" color={theme.purple}>
        Stocks grow exponentially, not linearly. £100 → £200 is the same percentage growth as £500 → £1000. But a straight line on raw prices would say the £500→£1000 jump is 5× "bigger." Taking the logarithm converts exponential growth into a straight line, so a simple linear regression (OLS) can fit the trend honestly.
      </AnalogBox>

      <p style={{ color: theme.textSecondary, fontSize: "14px", lineHeight: 1.8 }}>
        The model: <code style={{ color: theme.accent }}>log(price) = a + b × time</code> — where <code style={{ color: theme.gold }}>b</code> is the monthly growth rate in log space.
        Exponentiate back to get prices. CAGR = (e^(b×12) − 1) × 100%.
      </p>

      <Param name="cagr_pct" type="float (%)" desc="Compound Annual Growth Rate implied by the trend. E.g. 7.4 means 7.4% per year on average." />
      <Param name="r_squared" type="float (0–1)" desc="How well a straight line fits the log-price history. 0.91 = very good fit. <0.5 = poor fit." />
      <Param name="sigma_annual" type="float" desc="Annualised residual volatility = noise around the trend line × √12." />

      {/* Factor Regression */}
      <SectionTitle color={theme.red}>_factor_regression() — Jensen Alpha & Beta</SectionTitle>
      <CodeBlock>{`_factor_regression(closes, exog, interval)
# Returns:
{
  "alpha_annualised_pct": 1.2,  # Jensen alpha
  "beta_market": 0.87,           # sensitivity to SPY
  "beta_tech": 0.34,             # sensitivity to XLK
  "r_squared": 0.78,
  "tracking_error_pct": 4.2,
  "n_obs": 210
}`}</CodeBlock>

      <AnalogBox emoji="🏆" title="Alpha vs Beta" color={theme.red}>
        <strong>Beta</strong> is "how much does this ETF move when the market moves?" Beta of 0.87 means: when SPY goes up 1%, this ETF typically goes up 0.87%. You're getting slightly less market exposure — which could be intentional (Shariah exclusions change the mix).
        <br /><br />
        <strong>Alpha</strong> is the excess return the ETF earns BEYOND what its beta to the market would explain. Alpha of 1.2% per year = the ETF is generating value on its own, not just riding the market. This is what fund managers try to maximize.
        <br /><br />
        <strong>Tracking error</strong> measures how much the ETF's returns deviate from SPY week to week — lower is more market-like, higher means it's more independent.
      </AnalogBox>
    </div>
  );
}

function Validation() {
  return (
    <div>
      <p style={{ color: theme.textSecondary, fontSize: "14.5px", lineHeight: 1.8, marginBottom: "20px" }}>
        This is the <strong style={{ color: theme.textPrimary }}>honesty layer</strong>. Anyone can build a model that looks good in hindsight. Walk-forward validation tests how it would have actually performed if deployed in the past.
      </p>

      <AnalogBox emoji="⏪" title="The Honest Test" color={theme.gold}>
        Imagine it's 2022. You hide everything after that date, train the model on 2015–2022, predict 4 weeks ahead, then reveal the answer. Did you get it right? Now slide forward one week and repeat. Do this 20 times. The average error across all these "historical deployments" is your honest accuracy estimate — because the model never saw the future data when it trained.
      </AnalogBox>

      <SectionTitle color={theme.gold}>_wf_metrics() — Walk-Forward Evaluation</SectionTitle>
      <CodeBlock>{`_wf_metrics(closes, model, damped, target_h, interval)
# target_h: the full horizon steps (52 for 1y, 260 for 5y, 120 for 10y)
# But actual h is reduced if history is too short to support full-horizon folds`}</CodeBlock>

      <SectionTitle color={theme.gold}>The Fold Loop</SectionTitle>
      <p style={{ color: theme.textSecondary, fontSize: "14px", lineHeight: 1.7, marginBottom: "12px" }}>
        For each cutoff point in time:
      </p>
      {[
        ["Train", "All data up to the cutoff. Never touch future data."],
        ["Forecast", "Generate a prediction h steps ahead."],
        ["Actual", "closes[cutoff + h − 1] — the real price at that future point."],
        ["Score", "Compare prediction vs actual using multiple metrics."],
        ["Slide", "Move cutoff forward by 1 bar. Repeat. Max 20 folds."],
      ].map(([step, desc]) => (
        <div key={step} style={{ display: "flex", gap: "12px", padding: "8px 0", borderBottom: `1px solid ${theme.border}` }}>
          <span style={{ color: theme.gold, fontWeight: 700, minWidth: "80px", fontSize: "13px" }}>{step}</span>
          <span style={{ color: theme.textSecondary, fontSize: "13.5px" }}>{desc}</span>
        </div>
      ))}

      <SectionTitle color={theme.gold}>All Validation Metrics Explained</SectionTitle>

      <MetricRow name="wf_rmse" meaning="Root Mean Squared Error — average prediction error in price units (e.g. £4.20 off). Penalises big mistakes more harshly than small ones." range="📌 Lower is better. Compare to the ETF's average price to judge magnitude." />
      <MetricRow name="wf_mae" meaning="Mean Absolute Error — average absolute difference between predicted and actual price. More intuitive than RMSE." range="📌 Lower is better. E.g. MAE of £2 means 'on average, off by £2'." />
      <MetricRow name="wf_mape" meaning="Mean Absolute Percentage Error — same as MAE but in % of actual price. Comparable across ETFs with different price levels." range="📌 <5% excellent, 5–10% good, >15% poor." />
      <MetricRow name="wf_da" meaning="Directional Accuracy — what % of the time did the model correctly predict 'will it go up or down?' from the last known price. Pure random guessing = 50%." range="📌 >55% meaningful, >65% strong. Even professional funds rarely exceed 60%." />
      <MetricRow name="wf_coverage" meaning="95% CI Coverage — of all the 'actual' values, what % fell inside the predicted confidence band? A well-calibrated model should hit ~95%." range="📌 Too low (<85%) = overconfident bands. Too high (>99%) = overly wide, not useful." />
      <MetricRow name="wf_crps" meaning="Continuous Ranked Probability Score — rewards both accuracy AND calibrated uncertainty. A model that says 'I'm very confident about X' but is wrong gets penalised more than one that said 'somewhere around X'." range="📌 Lower is better. Uniquely penalises overconfident wrong predictions." />
      <MetricRow name="wf_sharpe" meaning="Walk-forward Sharpe Ratio — simulates a strategy: 'go long if my forecast is above current price, otherwise short.' Annualised Sharpe of this strategy. Positive means the forecast has genuine predictive value." range="📌 >0 means the model has edge. >0.5 is meaningful. >1.0 is strong." />
      <MetricRow name="wf_capped" meaning="True if the actual validation horizon was shortened due to insufficient history. E.g. for a new ETF, can't validate 260-week forecasts." range="📌 If True, treat validation metrics with caution — they test a shorter horizon." />

      <SectionTitle color={theme.gold}>_crps_gaussian() — Scoring Calibration</SectionTitle>
      <AnalogBox emoji="🎯" title="The Weather Forecaster Test" color={theme.gold}>
        Imagine a weather app says "100% chance of sun" but it rains. That's worse than an app that said "70% sun, 30% rain." CRPS is a single number that captures this: it rewards being confidently right and harshly punishes being confidently wrong. Regular metrics like RMSE only check if the point estimate was close — CRPS checks if the entire probability distribution was honest.
      </AnalogBox>
    </div>
  );
}

function OutputStorage() {
  return (
    <div>
      <SectionTitle color={theme.green}>The Output JSON — Every Key Explained</SectionTitle>
      <p style={{ color: theme.textSecondary, fontSize: "14px", lineHeight: 1.8, marginBottom: "16px" }}>
        The final response dict is assembled by <code style={{ color: theme.accent }}>run_forecast()</code> and both saved to PostgreSQL and returned to the frontend.
      </p>

      {[
        ["Identity & Axis", theme.accent, [
          ["symbol", "str", "E.g. 'ISWD.SW'. The ETF ticker."],
          ["horizon", "str", "'1y' | '5y' | '10y'"],
          ["currency", "str", "E.g. 'USD'. From Yahoo Finance metadata."],
          ["forecast_from", "YYYY-MM-DD", "The last date of known history — where the forecast starts."],
          ["run_at", "UTC ISO", "When this forecast was computed."],
        ]],
        ["Model Identity", theme.gold, [
          ["model_name", "str", "Human-readable name: 'ETS (Holt-Winters)' or 'Log-Linear Trend'."],
          ["model_rationale", "str", "Plain-English explanation of why this model was chosen for this horizon."],
          ["feature_importance", "dict", "Which inputs matter most — shown in the UI's explainer panel."],
        ]],
        ["History (for chart prefix)", theme.purple, [
          ["history_last", "float", "The most recent actual price."],
          ["history_dates", "array", "Last N date strings for context (N = HISTORY_CONTEXT[horizon])."],
          ["history_values", "array", "Closing prices matching history_dates."],
        ]],
        ["Forecast + Confidence Band", theme.green, [
          ["forecast_dates", "array", "Future dates: N weekly or monthly strings from forecast_from."],
          ["forecast_values", "array", "Point forecast prices. The 'best guess' line."],
          ["conf_lower", "array", "Lower bound of 95% CI. Blended GARCH + ETS, HMM-scaled."],
          ["conf_upper", "array", "Upper bound of 95% CI."],
        ]],
        ["Regime Enrichment", theme.red, [
          ["regime.current_state", "int", "0 or 1. The state the HMM assigned to right now."],
          ["regime.is_high_vol", "bool", "True if we're in the turbulent market state."],
          ["regime.regime_label", "str", "'High-Volatility' or 'Low-Volatility'."],
          ["regime.regime_prob", "float", "Posterior probability of the current state. 0.87 = 87% confident."],
          ["regime.ci_multiplier", "float", "1.0 (calm) or 1.35 (stormy). Applied to confidence band width."],
          ["regime.hmm_available", "bool", "False if hmmlearn was not installed."],
        ]],
        ["Factors Enrichment", theme.accent, [
          ["factors.alpha_annualised_pct", "%", "Jensen alpha — excess annual return vs market."],
          ["factors.beta_market", "float", "Sensitivity to SPY (broad market)."],
          ["factors.beta_tech", "float", "Sensitivity to XLK (tech sector)."],
          ["factors.r_squared", "float", "How much variance the factors explain (0–1)."],
          ["factors.tracking_error_pct", "%", "Annualised std of residuals = deviation from factor model."],
          ["factors.n_obs", "int", "Number of observations used."],
        ]],
        ["Shariah Features", theme.purple, [
          ["shariah_features.rebalance_pressure_pct", "%", "% of last 52 weeks that were Islamic index review weeks."],
          ["shariah_features.xlk_xlf_ratio", "float", "Tech/financials relative strength. Higher = better for Shariah ETFs."],
          ["shariah_features.corr_vs_spy", "float (−1 to 1)", "26-week rolling correlation of ETF vs market."],
          ["shariah_features.corr_vs_vix", "float (−1 to 1)", "26-week rolling correlation of ETF vs fear index. Typically negative."],
        ]],
      ].map(([group, color, fields]) => (
        <div key={group} style={{ marginBottom: "20px" }}>
          <SectionTitle color={color}>{group}</SectionTitle>
          {fields.map(([name, type, desc]) => (
            <Param key={name} name={name} type={type} desc={desc} />
          ))}
        </div>
      ))}

      <SectionTitle color={theme.green}>PostgreSQL Persistence</SectionTitle>
      <CodeBlock>{`-- Table: etf_forecasts
symbol          TEXT        -- 'ISWD.SW'
horizon         TEXT        -- '5y'
model_name      TEXT
currency        TEXT
forecast_from   DATE
forecast_dates  JSONB       -- array of date strings
forecast_values JSONB       -- array of floats
conf_lower      JSONB
conf_upper      JSONB
history_dates   JSONB
history_values  JSONB
metrics         JSONB       -- all diagnostics + walk-forward
feature_importance JSONB
regime          JSONB       -- HMM state fields
factors         JSONB       -- alpha, beta, tracking error
shariah_features JSONB
created_at      TIMESTAMPTZ DEFAULT NOW()

-- Index for fast latest-row lookup:
CREATE INDEX idx_etf_forecasts_lookup ON etf_forecasts (symbol, horizon, created_at DESC);`}</CodeBlock>

      <p style={{ color: theme.textSecondary, fontSize: "13.5px", lineHeight: 1.7 }}>
        The index matters: when the frontend GETs the latest forecast, it queries <code style={{ color: theme.accent }}>WHERE symbol='ISWD.SW' AND horizon='5y' ORDER BY created_at DESC LIMIT 1</code>. The descending index makes this O(1) instead of a full table scan.
      </p>
    </div>
  );
}

function Degradation() {
  return (
    <div>
      <p style={{ color: theme.textSecondary, fontSize: "14.5px", lineHeight: 1.8, marginBottom: "20px" }}>
        The pipeline is designed to <strong style={{ color: theme.textPrimary }}>never crash</strong> because of missing optional components. Each advanced feature has a fallback. This is called <em>graceful degradation</em>.
      </p>

      <AnalogBox emoji="✈️" title="The Airplane Principle" color={theme.purple}>
        Commercial aircraft have multiple redundant systems. If one navigation system fails, another takes over. The plane doesn't fall out of the sky — it continues with reduced precision but still lands safely. This pipeline works the same way: if GARCH fails, confidence bands fall back to simpler math. If Yahoo Finance is down for VIX, shariah features are just omitted. The forecast still runs.
      </AnalogBox>

      <SectionTitle color={theme.purple}>Degradation Table</SectionTitle>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${theme.border}` }}>
              {["Component", "Requires", "If Missing → Fallback"].map(h => (
                <th key={h} style={{ padding: "8px 12px", color: theme.textMuted, textAlign: "left", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              ["GARCH volatility", "arch Python lib", "Use ETS residual σ×√h floor only. CI is simpler but still valid."],
              ["HMM regime detection", "hmmlearn Python lib", "ci_multiplier = 1.0 (neutral). No regime scaling."],
              ["Exact CRPS formula", "scipy", "Approximate: |y−μ|×0.9. Walk-forward still works."],
              ["VIX data", "Yahoo Finance network", "HMM uses univariate (ETF returns only). corr_vs_vix omitted."],
              ["SPY/XLK/XLF data", "Yahoo Finance network", "Factor regression skipped entirely. shariah_features partially omitted."],
              ["Full-horizon walk-forward", "Enough history", "h reduced iteratively. wf_capped=True flagged in response."],
              ["ETF history", "Valid symbol + Yahoo", "Raises ValueError → HTTP 422. Nothing returned."],
            ].map(([component, req, fallback], i) => (
              <tr key={component} style={{ borderBottom: `1px solid ${theme.border}`, background: i % 2 === 0 ? "transparent" : theme.surface + "60" }}>
                <td style={{ padding: "10px 12px", color: theme.textPrimary, fontWeight: 600, fontSize: "13px" }}>{component}</td>
                <td style={{ padding: "10px 12px" }}><Tag color={theme.gold}>{req}</Tag></td>
                <td style={{ padding: "10px 12px", color: theme.textSecondary, fontSize: "13px" }}>{fallback}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SectionTitle color={theme.purple}>Hard Prerequisites (No Fallback)</SectionTitle>
      <p style={{ color: theme.textSecondary, fontSize: "14px", lineHeight: 1.8 }}>
        These three things MUST work or the pipeline raises an error:
      </p>
      {[
        ["Valid ticker symbol", "A non-existent or delisted ETF returns empty history → ValueError → HTTP 422."],
        ["Minimum history bars", "≥20 weekly bars for ETS, ≥12 monthly for OLS. New ETFs will fail."],
        ["Core Python libs", "statsmodels, numpy, requests must be importable. These are always in the environment."],
      ].map(([req, desc]) => (
        <div key={req} style={{ display: "flex", gap: "12px", padding: "10px 0", borderBottom: `1px solid ${theme.border}` }}>
          <span style={{ color: theme.red, fontSize: "18px", flexShrink: 0 }}>⛔</span>
          <div>
            <div style={{ fontWeight: 600, color: theme.textPrimary, fontSize: "13.5px" }}>{req}</div>
            <div style={{ color: theme.textSecondary, fontSize: "13px", marginTop: "2px" }}>{desc}</div>
          </div>
        </div>
      ))}

      <SectionTitle color={theme.purple}>Reading Diagnostic Flags in the Response</SectionTitle>
      <p style={{ color: theme.textSecondary, fontSize: "14px", lineHeight: 1.8 }}>
        The response embeds flags so the frontend can show appropriate warnings:
      </p>
      <Param name="metrics.garch_available" type="bool" desc="False = GARCH library wasn't installed. CI is ETS-only." />
      <Param name="metrics.garch_fit" type="bool" desc="False = GARCH installed but fitting failed (e.g. convergence issue)." />
      <Param name="regime.hmm_available" type="bool" desc="False = hmmlearn not installed. ci_multiplier fixed at 1.0." />
      <Param name="metrics.wf_capped" type="bool" desc="True = walk-forward horizon was shortened. Interpret wf_* metrics carefully." />
      <Param name="metrics.wf_horizon_window" type="str" desc="Human label like '52 weeks' or '66 of 120 months' showing actual validation scope." />
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────────────────

export default function App() {
  const [active, setActive] = useState("overview");

  const ActiveContent = sections.find(s => s.id === active)?.content || (() => null);
  const activeSection = sections.find(s => s.id === active);

  return (
    <div style={{
      minHeight: "100vh",
      background: theme.bg,
      fontFamily: "'IBM Plex Sans', 'Segoe UI', sans-serif",
      color: theme.textPrimary,
    }}>
      {/* Header */}
      <div style={{
        background: theme.surface,
        borderBottom: `1px solid ${theme.border}`,
        padding: "20px 32px",
        display: "flex",
        alignItems: "center",
        gap: "16px",
      }}>
        <div style={{
          width: "40px", height: "40px", borderRadius: "10px",
          background: `linear-gradient(135deg, ${theme.accent}, ${theme.purple})`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "20px",
        }}>📊</div>
        <div>
          <div style={{ fontSize: "18px", fontWeight: 700, color: theme.textPrimary, letterSpacing: "-0.02em" }}>
            ETF Forecast Pipeline
          </div>
          <div style={{ fontSize: "12px", color: theme.textMuted }}>
            Junior Team Member Onboarding Guide · <span style={{ color: theme.accent }}>etf_forecast_pipeline.md</span>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", height: "calc(100vh - 81px)" }}>
        {/* Sidebar */}
        <div style={{
          width: "220px",
          flexShrink: 0,
          background: theme.surface,
          borderRight: `1px solid ${theme.border}`,
          padding: "16px 0",
          overflowY: "auto",
        }}>
          {sections.map(s => (
            <button
              key={s.id}
              onClick={() => setActive(s.id)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "10px 20px",
                border: "none",
                background: active === s.id ? s.color + "15" : "transparent",
                borderLeft: active === s.id ? `3px solid ${s.color}` : "3px solid transparent",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <span style={{ fontSize: "16px" }}>{s.icon}</span>
              <span style={{
                fontSize: "13px",
                fontWeight: active === s.id ? 600 : 400,
                color: active === s.id ? s.color : theme.textSecondary,
              }}>{s.title}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "32px 40px" }}>
          <div style={{ maxWidth: "820px" }}>
            <div style={{ marginBottom: "24px" }}>
              <h2 style={{
                fontSize: "24px",
                fontWeight: 700,
                color: activeSection?.color || theme.accent,
                margin: 0,
                display: "flex",
                alignItems: "center",
                gap: "10px",
              }}>
                <span>{activeSection?.icon}</span> {activeSection?.title}
              </h2>
            </div>
            <ActiveContent />
          </div>
        </div>
      </div>
    </div>
  );
}
