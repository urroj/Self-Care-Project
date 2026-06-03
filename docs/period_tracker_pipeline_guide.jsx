import { useState, useEffect, useRef } from "react";

const palette = {
  bg: "#0b0f1a",
  surface: "#111827",
  surfaceAlt: "#161d2e",
  border: "#1f2d45",
  borderLight: "#2a3f5e",
  accent: "#7c9ef5",
  accentSoft: "#3b5bdb",
  accentGlow: "rgba(124,158,245,0.15)",
  rose: "#f472b6",
  roseSoft: "rgba(244,114,182,0.12)",
  teal: "#2dd4bf",
  tealSoft: "rgba(45,212,191,0.1)",
  amber: "#fbbf24",
  amberSoft: "rgba(251,191,36,0.1)",
  purple: "#a78bfa",
  purpleSoft: "rgba(167,139,250,0.1)",
  text: "#e2e8f0",
  textMuted: "#94a3b8",
  textDim: "#4b6080",
  green: "#34d399",
  greenSoft: "rgba(52,211,153,0.1)",
};

const SECTIONS = [
  {
    id: "overview",
    icon: "◈",
    label: "Big Picture",
    color: palette.accent,
    colorSoft: palette.accentGlow,
  },
  {
    id: "setup",
    icon: "⚙",
    label: "Setup",
    color: palette.teal,
    colorSoft: palette.tealSoft,
  },
  {
    id: "loaders",
    icon: "📂",
    label: "Data Loading",
    color: palette.amber,
    colorSoft: palette.amberSoft,
  },
  {
    id: "features",
    icon: "⚗",
    label: "Features",
    color: palette.purple,
    colorSoft: palette.purpleSoft,
  },
  {
    id: "phase1",
    icon: "①",
    label: "Pop. Prior",
    color: palette.rose,
    colorSoft: palette.roseSoft,
  },
  {
    id: "phase2",
    icon: "②",
    label: "Bayesian",
    color: palette.teal,
    colorSoft: palette.tealSoft,
  },
  {
    id: "phase3",
    icon: "③",
    label: "LSTM",
    color: palette.accent,
    colorSoft: palette.accentGlow,
  },
  {
    id: "inference",
    icon: "🔮",
    label: "Inference",
    color: palette.purple,
    colorSoft: palette.purpleSoft,
  },
  {
    id: "update",
    icon: "↻",
    label: "Updates",
    color: palette.green,
    colorSoft: palette.greenSoft,
  },
  {
    id: "glossary",
    icon: "⊞",
    label: "ML Glossary",
    color: palette.amber,
    colorSoft: palette.amberSoft,
  },
];

function Tag({ children, color }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: "4px",
        fontSize: "11px",
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        background: color ? `${color}22` : "#1f2d45",
        color: color || palette.textMuted,
        border: `1px solid ${color ? `${color}44` : palette.border}`,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function Code({ children }) {
  return (
    <code
      style={{
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        fontSize: "12px",
        background: "#0d1520",
        color: palette.teal,
        padding: "2px 6px",
        borderRadius: "3px",
        border: `1px solid ${palette.border}`,
      }}
    >
      {children}
    </code>
  );
}

function CodeBlock({ children, lang }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div
      style={{
        position: "relative",
        margin: "12px 0",
        borderRadius: "8px",
        overflow: "hidden",
        border: `1px solid ${palette.border}`,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "#0a0e18",
          padding: "6px 14px",
          borderBottom: `1px solid ${palette.border}`,
        }}
      >
        <span style={{ fontSize: "11px", color: palette.textDim, fontFamily: "monospace" }}>
          {lang || "python"}
        </span>
        <button
          onClick={copy}
          style={{
            background: "none",
            border: "none",
            color: copied ? palette.green : palette.textDim,
            cursor: "pointer",
            fontSize: "11px",
            fontFamily: "monospace",
          }}
        >
          {copied ? "✓ copied" : "copy"}
        </button>
      </div>
      <pre
        style={{
          margin: 0,
          padding: "14px 16px",
          background: "#080c14",
          color: palette.text,
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          fontSize: "12px",
          lineHeight: "1.7",
          overflowX: "auto",
          whiteSpace: "pre",
        }}
      >
        {children}
      </pre>
    </div>
  );
}

function Callout({ type = "info", children }) {
  const styles = {
    info: { border: palette.accent, bg: palette.accentGlow, icon: "ℹ" },
    analogy: { border: palette.teal, bg: palette.tealSoft, icon: "💡" },
    warn: { border: palette.amber, bg: palette.amberSoft, icon: "⚠" },
    key: { border: palette.purple, bg: palette.purpleSoft, icon: "⚡" },
  };
  const s = styles[type];
  return (
    <div
      style={{
        background: s.bg,
        border: `1px solid ${s.border}44`,
        borderLeft: `3px solid ${s.border}`,
        borderRadius: "0 8px 8px 0",
        padding: "12px 16px",
        margin: "14px 0",
        display: "flex",
        gap: "10px",
      }}
    >
      <span style={{ fontSize: "16px", lineHeight: "1.5", flexShrink: 0 }}>{s.icon}</span>
      <div style={{ fontSize: "13.5px", color: palette.text, lineHeight: "1.65" }}>{children}</div>
    </div>
  );
}

function FeatureTable({ rows }) {
  return (
    <div
      style={{
        margin: "14px 0",
        borderRadius: "8px",
        overflow: "hidden",
        border: `1px solid ${palette.border}`,
      }}
    >
      {rows.map((row, i) => (
        <div
          key={i}
          style={{
            display: "grid",
            gridTemplateColumns: "180px 1fr 1fr",
            background: i % 2 === 0 ? "#0d1520" : "#0a0e18",
            borderBottom: i < rows.length - 1 ? `1px solid ${palette.border}` : "none",
          }}
        >
          {row.map((cell, j) => (
            <div
              key={j}
              style={{
                padding: "9px 14px",
                fontSize: j === 0 ? "12px" : "13px",
                fontFamily: j === 0 ? "'JetBrains Mono', monospace" : "inherit",
                color: j === 0 ? palette.teal : j === 1 ? palette.textMuted : palette.text,
                borderRight: j < row.length - 1 ? `1px solid ${palette.border}` : "none",
                lineHeight: "1.5",
              }}
            >
              {cell}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function PhaseFlow() {
  return (
    <div
      style={{
        margin: "16px 0",
        padding: "20px",
        background: "#080c14",
        borderRadius: "10px",
        border: `1px solid ${palette.border}`,
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: "13px",
      }}
    >
      <div style={{ color: palette.textMuted, marginBottom: "14px" }}>
        Personal cycle count
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
        <div style={{ color: palette.textMuted, paddingLeft: "8px" }}>▼</div>
        <div
          style={{
            padding: "8px 16px",
            background: palette.accentGlow,
            border: `1px solid ${palette.accent}44`,
            borderRadius: "6px",
            color: palette.accent,
            display: "inline-block",
            marginBottom: "8px",
          }}
        >
          resolve_phase(n)
        </div>
        <div style={{ paddingLeft: "8px", color: palette.textMuted }}>│</div>
        {[
          { cond: "n < 3", label: "cold_start", model: "PopulationPrior.predict_distribution()", color: palette.rose },
          { cond: "3 ≤ n < 8", label: "bayesian", model: "BayesianPersonalModel.update() + predict()", color: palette.teal },
          { cond: "n ≥ 8", label: "lstm", model: "LSTMTrainer.predict() with MC Dropout", color: palette.accent },
        ].map((phase, i) => (
          <div key={i} style={{ display: "flex", gap: "10px", marginBottom: "6px" }}>
            <div style={{ color: palette.textMuted }}>
              {i < 2 ? "├──" : "└──"}
            </div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ color: palette.textDim }}>{phase.cond}</span>
              <span style={{ color: palette.textMuted }}>→</span>
              <Tag color={phase.color}>{phase.label}</Tag>
              <span style={{ color: palette.textDim }}>→</span>
              <span style={{ color: phase.color, fontSize: "12px" }}>{phase.model}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BlendVisual({ personalWeight }) {
  const w = Math.round(personalWeight * 100);
  return (
    <div style={{ margin: "14px 0" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: "12px",
          color: palette.textMuted,
          marginBottom: "6px",
          fontFamily: "monospace",
        }}
      >
        <span>personal ({w}%)</span>
        <span>population ({100 - w}%)</span>
      </div>
      <div
        style={{
          height: "24px",
          borderRadius: "6px",
          overflow: "hidden",
          display: "flex",
          border: `1px solid ${palette.border}`,
        }}
      >
        <div
          style={{
            width: `${w}%`,
            background: `linear-gradient(90deg, ${palette.teal}, ${palette.accentSoft})`,
            transition: "width 0.5s ease",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "11px",
            color: "#fff",
            fontFamily: "monospace",
          }}
        >
          {w >= 20 ? `${w}%` : ""}
        </div>
        <div
          style={{
            flex: 1,
            background: `linear-gradient(90deg, ${palette.rose}66, ${palette.rose}33)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "11px",
            color: palette.rose,
            fontFamily: "monospace",
          }}
        >
          {100 - w >= 20 ? `${100 - w}%` : ""}
        </div>
      </div>
    </div>
  );
}

// ─── Section Components ────────────────────────────────────────────────────

function SectionOverview() {
  return (
    <div>
      <h2 style={sH2}>The Big Picture</h2>
      <p style={sP}>
        Before any code: the entire pipeline answers one question — <strong style={{ color: palette.accent }}>how much personal data does this user have?</strong> That answer determines which of three completely different models runs.
      </p>
      <Callout type="key">
        The pattern is called <strong>progressive personalisation</strong>. You start with what you know (population statistics) and gradually shift toward what you learn (personal data).
      </Callout>
      <h3 style={sH3}>The Three Phases</h3>
      <PhaseFlow />
      <FeatureTable
        rows={[
          ["Phase", "Trigger", "Model"],
          ["cold_start", "< 3 personal cycles", "Negative-Binomial population prior + GB blend"],
          ["bayesian", "3–7 personal cycles", "Gamma-Poisson conjugate update"],
          ["lstm", "≥ 8 personal cycles", "Fine-tuned 2-layer LSTM + MC Dropout"],
        ]}
      />
      <Callout type="analogy">
        Think of it like a new doctor getting to know a patient. Day one: they rely on medical textbooks and population averages. After a few appointments: a blend of textbooks + your history. Years later: almost entirely your personal pattern.
      </Callout>
      <h3 style={sH3}>Entry Points</h3>
      <p style={sP}>The pipeline is called in two ways:</p>
      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", margin: "12px 0" }}>
        {[
          { label: "CLI", detail: "python pipeline.py --setup | --predict | --update | --status | --results" },
          { label: "HTTP", detail: "POST /api/cycles/complete  and  POST /api/predict" },
        ].map((e, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              minWidth: "240px",
              background: palette.surfaceAlt,
              border: `1px solid ${palette.border}`,
              borderRadius: "8px",
              padding: "14px 16px",
            }}
          >
            <Tag color={palette.accent}>{e.label}</Tag>
            <div
              style={{
                marginTop: "8px",
                fontSize: "12px",
                fontFamily: "monospace",
                color: palette.textMuted,
                wordBreak: "break-all",
              }}
            >
              {e.detail}
            </div>
          </div>
        ))}
      </div>
      <h3 style={sH3}>File Map</h3>
      <FeatureTable
        rows={[
          ["File", "Role", "Analogy"],
          ["pipeline.py", "Orchestrator / manager", "The project manager"],
          ["models/base_model.py", "Phase 1 + 2 models", "The statistician"],
          ["models/lstm_model.py", "Phase 3 LSTM", "The neural network engineer"],
          ["data/preprocessor.py", "Feature builder", "The data prep chef"],
          ["data/loaders.py", "Data reader", "The librarian"],
          ["api/main.py", "HTTP routes", "The front door receptionist"],
        ]}
      />
    </div>
  );
}

function SectionSetup() {
  return (
    <div>
      <h2 style={sH2}>One-time Setup — <Code>setup_pipeline()</Code></h2>
      <p style={sP}>
        Runs once per install via <Code>python pipeline.py --setup</Code>. It's like a restaurant doing all the prep work before opening for the first time.
      </p>
      <h3 style={sH3}>The 7 Steps</h3>
      {[
        { n: "01", title: "Load public data", desc: "Tries load_all_public() then irregular_subset(). On failure, calls _make_synthetic_population()." },
        { n: "02", title: "Threshold check", desc: "If fewer than 10 rows after filtering → also fall back to synthetic. The prior must never be under-fit." },
        { n: "03", title: "Feature engineering", desc: "build_cycle_features(irr) → drop rows missing next_cycle_length or mean_length." },
        { n: "04", title: "Fit PopulationPrior", desc: ".fit(feats) → .save() writes population_prior.json + xgb_irregular.pkl." },
        { n: "05", title: "Fit feature scaler", desc: "fit_scaler(feats, available_numeric_cols) saves feature_scaler.pkl." },
        { n: "06", title: "LSTM pre-training", desc: "build_sequences(...). If ≥ 50 sequences and PyTorch importable: LSTMTrainer.pretrain(X, y). Otherwise skipped." },
        { n: "07", title: "Save LSTM meta", desc: "save_meta(feature_cols) records input_size and column order for inference." },
      ].map((step, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            gap: "14px",
            padding: "12px 0",
            borderBottom: `1px solid ${palette.border}`,
          }}
        >
          <div
            style={{
              fontFamily: "monospace",
              fontSize: "12px",
              color: palette.teal,
              opacity: 0.6,
              minWidth: "28px",
              paddingTop: "2px",
            }}
          >
            {step.n}
          </div>
          <div>
            <div style={{ color: palette.text, fontWeight: 600, fontSize: "14px", marginBottom: "4px" }}>
              {step.title}
            </div>
            <div style={{ color: palette.textMuted, fontSize: "13px", lineHeight: "1.6" }}>
              {step.desc}
            </div>
          </div>
        </div>
      ))}
      <h3 style={{ ...sH3, marginTop: "28px" }}>The Safety Net — <Code>_make_synthetic_population(n=120)</Code></h3>
      <Callout type="analogy">
        Like a restaurant that, if their supplier cancels, has a recipe for a substitute ingredient. The model won't be perfect, but it won't crash.
      </Callout>
      <p style={sP}>Generates 120 synthetic subjects where each person gets:</p>
      <FeatureTable
        rows={[
          ["Parameter", "How it's generated", "Range"],
          ["personal_mean", "Uniform random draw", "28–45 days"],
          ["personal_std", "Uniform random draw", "5–13 days"],
          ["n_cycles", "Uniform random draw", "6–15 cycles"],
          ["cycle_length", "N(personal_mean, personal_std) clipped", "[21, 60]"],
          ["age, bmi, flow, stress, sleep", "Simulated realistically", "Plausible ranges"],
          ["irregular_flag", "personal_std > 7", "0 or 1"],
        ]}
      />
    </div>
  );
}

function SectionLoaders() {
  return (
    <div>
      <h2 style={sH2}>Data Loading — <Code>data/loaders.py</Code></h2>
      <h3 style={sH3}><Code>load_all_public()</Code></h3>
      <p style={sP}>
        Master loader. Tries each source, collects whatever succeeds, combines them. Raises <Code>RuntimeError</Code> only if <em>everything</em> fails — but <Code>setup_pipeline</Code> catches that and uses synthetic data.
      </p>
      <h3 style={sH3}><Code>load_fehring()</Code> — Research CSV</h3>
      <FeatureTable
        rows={[
          ["Step", "What it does"],
          ["Read CSV", "utf-8-sig encoding to strip the BOM (invisible byte-order mark)"],
          ["Rename cols", "ClientID → subject_id, LengthofCycle → cycle_length, etc."],
          ["Rescale flow", "0–15 composite → 0–5 by dividing by 3.0, then clip"],
          ["Irregular flag", "within-subject std(cycle_length) > 7"],
          ["enforce_schema", "Add missing columns as NaN, drop implausible lengths"],
          ["Cache", "Saves to data/cache/fehring_standardised.parquet"],
        ]}
      />
      <h3 style={sH3}><Code>load_mcphases()</Code> — PhysioNet Daily → Cycle</h3>
      <p style={sP}>
        This dataset is <strong>daily-level</strong> — one row per day. The loader converts it to <strong>cycle-level</strong> data. It also optionally merges:
      </p>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", margin: "12px 0" }}>
        {[
          { src: "resting_heart_rate.csv", out: "rhr_bpm", color: palette.rose },
          { src: "sleep_score.csv", out: "sleep_hours = score × 0.09", color: palette.teal },
          { src: "stress_score.csv", out: "binned 1–3 (cut [0,33,66,100])", color: palette.amber },
          { src: "computed_temperature.csv", out: "nightly_temperature", color: palette.purple },
          { src: "subject-info.csv", out: "age = 2023 − birth_year", color: palette.accent },
        ].map((m, i) => (
          <div
            key={i}
            style={{
              background: palette.surfaceAlt,
              border: `1px solid ${palette.border}`,
              borderRadius: "7px",
              padding: "10px 12px",
              flex: "1 1 200px",
            }}
          >
            <div style={{ fontSize: "11px", fontFamily: "monospace", color: m.color, marginBottom: "4px" }}>
              {m.src}
            </div>
            <div style={{ fontSize: "12px", color: palette.textMuted }}>→ {m.out}</div>
          </div>
        ))}
      </div>
      <h3 style={sH3}><Code>_infer_cycles_from_daily(daily)</Code></h3>
      <Callout type="analogy">
        Imagine you have a diary entry for every day of the year. Someone asks "how many trips did you take?" You'd look for days you noted "left for trip" and "returned home." This function does the same — it detects bleeding start to find cycle boundaries.
      </Callout>
      <p style={sP}>A new cycle is detected when:</p>
      <ul style={sList}>
        <li>It's the first day of data</li>
        <li>Bleeding today but <em>not</em> yesterday (new bleed onset)</li>
        <li>The date jumped (gap in data)</li>
      </ul>
      <p style={sP}>For each detected cycle it computes:</p>
      <FeatureTable
        rows={[
          ["cycle_length", "Days from one cycle start to the next"],
          ["period_duration", "Number of days with flow_volume > 0"],
          ["ovulation_day", "Day of the LH hormone peak within the cycle"],
          ["luteal_length", "cycle_length − ovulation_day"],
        ]}
      />
      <h3 style={sH3}><Code>irregular_subset(df)</Code></h3>
      <p style={sP}>
        Keeps only subjects with <Code>irregular_flag == True</Code> <strong>or</strong> mean cycle length ≥ 30. The pipeline trains exclusively on irregular cycles because that's the target user's profile — training on regular 28-day cycles would make the model overconfident about regularity.
      </p>
    </div>
  );
}

function SectionFeatures() {
  return (
    <div>
      <h2 style={sH2}>Feature Engineering — <Code>data/preprocessor.py</Code></h2>
      <p style={sP}>
        Raw data says: "Cycle 1 was 32 days, Cycle 2 was 29 days…" Feature engineering asks: <em>"What does that history <strong>mean</strong>? What useful signals can we extract?"</em>
      </p>
      <h3 style={sH3}><Code>build_cycle_features(cycles_df)</Code></h3>
      <p style={sP}>
        For each person, for each cycle in their history, it looks at everything <em>before</em> that cycle and builds a feature row to predict the <em>next</em> cycle.
      </p>
      <Callout type="key">
        <strong>No data leakage.</strong> Features for cycle 5 only use cycles 1–4. Never peeks at future cycles. If you train on future data, your model looks great in testing but fails in reality.
      </Callout>
      <h3 style={sH3}><Code>_history_stats(lengths)</Code> — The Feature Factory</h3>
      <Callout type="analogy">
        You're trying to predict today's weather. You don't just look at yesterday — you look at the last week's trend, the average for this month, how much it varied recently. That's exactly what this does for cycle length.
      </Callout>
      <FeatureTable
        rows={[
          ["Feature", "What it means", "Example (history: [32, 29, 35, 28, 33])"],
          ["n_cycles", "How many cycles logged", "5"],
          ["current_length", "Most recent cycle", "33"],
          ["prev_length", "Cycle before that", "28"],
          ["mean_length", "Average cycle length", "31.4"],
          ["std_length", "How much it varies", "2.7"],
          ["min / max", "Shortest / longest", "28 / 35"],
          ["range_length", "Span between extremes", "7"],
          ["trend", "OLS slope — getting longer or shorter?", "+0.3 days/cycle"],
          ["deviation_from_mean", "Is this cycle unusual?", "+1.6 (slightly long)"],
          ["is_irregular", "Flag if std > 7", "0 (regular)"],
          ["mean_last3", "Average of last 3 cycles", "32.0"],
          ["std_last3", "Variability in last 3", "3.6"],
          ["est_luteal", "Assumed luteal phase (constant)", "14"],
        ]}
      />
      <Callout type="info">
        The <Code>trend</Code> feature fits a straight line through cycle lengths over time (OLS). If your last 5 cycles were 28, 29, 31, 32, 34 — trend is +1.5 days/cycle, suggesting lengthening cycles. Clinically meaningful (hormonal shifts, perimenopause, etc.)
      </Callout>
      <h3 style={sH3}><Code>build_sequences(features_df, lookback=6)</Code></h3>
      <Callout type="analogy">
        To predict tomorrow's stock price, you feed the model the last 6 days of stock data. Each day has multiple features (open, close, volume). So input is [6 days × N features] — one sequence. This function builds all such sequences from cycle data.
      </Callout>
      <CodeBlock lang="shapes">
{`X shape:  (N_sequences,  6 timesteps,  N_features)
y shape:  (N_sequences,)   ← next cycle length

Rule: sequences NEVER cross subject boundaries.
Person A's last cycle does not feed into Person B's prediction.`}
      </CodeBlock>
      <h3 style={sH3}>Scaler Utilities</h3>
      <Callout type="info">
        <strong>Why scale?</strong> Neural networks struggle with wildly different input scales. Cycle length = 35, stress = 2, n_cycles = 8. Without scaling the model overweights the largest numbers. Scaling puts everything roughly in [-2, +2], giving each feature equal starting influence.
      </Callout>
      <FeatureTable
        rows={[
          ["Function", "What it does"],
          ["fit_scaler()", "Learns mean + std of each column from training data. Saves feature_scaler.pkl"],
          ["apply_scaler()", "Transforms new data using those learned stats. Imputes NaNs with column median first"],
          ["load_scaler()", "Returns saved scaler, or None if missing (pipeline handles gracefully)"],
        ]}
      />
    </div>
  );
}

function SectionPhase1() {
  return (
    <div>
      <h2 style={sH2}>Phase 1 — Population Prior</h2>
      <Tag color={palette.rose}>cold_start · &lt; 3 cycles</Tag>
      <p style={{ ...sP, marginTop: "14px" }}>
        A new user has logged 0–2 cycles. We have almost nothing personal. But we know a lot about cycles <em>in general</em>.
      </p>
      <p style={sP}><strong>The model:</strong> Negative Binomial distribution + Gradient Boosting blend</p>
      <h3 style={sH3}>What is a Negative Binomial Distribution?</h3>
      <Callout type="analogy">
        You're predicting how many days until an irregular bus arrives. Some days 28, sometimes 45. The Negative Binomial is a probability distribution that naturally handles this "count with overdispersion" — where things are more spread out than a simple average.
      </Callout>
      <p style={sP}>Two parameters:</p>
      <div style={{ display: "flex", gap: "12px", margin: "12px 0", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: "180px", background: palette.surfaceAlt, border: `1px solid ${palette.border}`, borderRadius: "8px", padding: "14px 16px" }}>
          <div style={{ color: palette.rose, fontFamily: "monospace", fontSize: "20px", marginBottom: "6px" }}>μ</div>
          <div style={{ color: palette.text, fontWeight: 600, marginBottom: "4px" }}>mu (mean)</div>
          <div style={{ color: palette.textMuted, fontSize: "13px" }}>Average cycle length in this group</div>
        </div>
        <div style={{ flex: 1, minWidth: "180px", background: palette.surfaceAlt, border: `1px solid ${palette.border}`, borderRadius: "8px", padding: "14px 16px" }}>
          <div style={{ color: palette.rose, fontFamily: "monospace", fontSize: "20px", marginBottom: "6px" }}>r</div>
          <div style={{ color: palette.text, fontWeight: 600, marginBottom: "4px" }}>r (dispersion)</div>
          <div style={{ color: palette.textMuted, fontSize: "13px" }}>Lower r = more spread out. Controls the width of the uncertainty band.</div>
        </div>
      </div>
      <h3 style={sH3}><Code>fit(features_df)</Code></h3>
      {[
        { step: "1", title: "Global NB fit", desc: "Fits one NB to all the data → population-wide μ and r via MLE (Maximum Likelihood Estimation)." },
        { step: "2", title: "Per-decile NB", desc: "Splits people into 5 groups by mean cycle length. Fits a separate NB for each group with ≥ 10 cycles. Short cyclers get different priors than long cyclers." },
        { step: "3", title: "Gradient Boosting Regressor", desc: "300 decision trees (n_estimators=300, max_depth=4, lr=0.05, subsample=0.8). Uses all features to make a point estimate, progressively correcting its own errors." },
      ].map((s, i) => (
        <div key={i} style={{ display: "flex", gap: "14px", padding: "12px 0", borderBottom: `1px solid ${palette.border}` }}>
          <div style={{ fontFamily: "monospace", color: palette.rose, opacity: 0.6, minWidth: "20px" }}>{s.step}</div>
          <div>
            <div style={{ color: palette.text, fontWeight: 600, fontSize: "14px", marginBottom: "4px" }}>{s.title}</div>
            <div style={{ color: palette.textMuted, fontSize: "13px", lineHeight: "1.6" }}>{s.desc}</div>
          </div>
        </div>
      ))}
      <h3 style={sH3}><Code>predict_distribution()</Code></h3>
      <p style={sP}>Returns a <em>distribution</em>, not just a single number:</p>
      <CodeBlock lang="output">{`{
  "point_estimate": 33.2,   // single best guess
  "ci_lower": 27,           // 10th percentile — "unlikely to be shorter"
  "ci_upper": 41,           // 90th percentile — "unlikely to be longer"
  "std": 4.1,               // spread of uncertainty
  "source": "population_prior"
}`}</CodeBlock>
      <p style={sP}><strong>The blend formula:</strong></p>
      <CodeBlock>{`point = 0.6 × mean_length + 0.4 × GB_prediction`}</CodeBlock>
      <p style={sP}>We trust the raw mean slightly more (60%) than the GB model (40%) at this stage — the GB can overfit on sparse data.</p>
      <h3 style={sH3}><Code>_fit_nb(y)</Code> — MLE Explained</h3>
      <Callout type="analogy">
        You have 100 cycle lengths. You want to find μ and r that make the NB distribution <em>most likely to have produced exactly those numbers</em>. You're fitting a bell-curve-like shape to your histogram. Nelder-Mead is the search algorithm that hunts for the best parameters.
      </Callout>
      <p style={sP}>Seeded with method-of-moments starting guess: <Code>r₀ = μ²/(variance − μ)</Code>. Clamps <Code>μ ≥ 21</Code> and <Code>r ≥ 0.1</Code>.</p>
    </div>
  );
}

function SectionPhase2() {
  const [cycles, setCycles] = useState(5);
  const weight = Math.min(cycles / 8, 1.0);
  return (
    <div>
      <h2 style={sH2}>Phase 2 — Bayesian Personal Model</h2>
      <Tag color={palette.teal}>bayesian · 3–7 cycles</Tag>
      <p style={{ ...sP, marginTop: "14px" }}>
        We have 3–7 personal cycles. Enough to start learning, but not enough to trust entirely. We <strong>blend</strong> personal evidence with population knowledge.
      </p>
      <p style={sP}><strong>The model:</strong> Gamma-Poisson conjugate model</p>
      <h3 style={sH3}>What does "conjugate" mean?</h3>
      <Callout type="analogy">
        You start with a belief ("I think the average is 35 days"). You observe data ("my last 4 cycles were 38, 32, 41, 35"). You update your belief. The beautiful thing about conjugate distributions is the math works out <em>cleanly</em> — you just add numbers to existing parameters. No complex optimisation needed.
      </Callout>
      <h3 style={sH3}>Parameters</h3>
      <div style={{ display: "flex", gap: "12px", margin: "12px 0", flexWrap: "wrap" }}>
        {[
          { sym: "α", name: "alpha (shape)", desc: "Starts seeded from population NB's r. Increases with each new cycle length sum." },
          { sym: "β", name: "beta (rate)", desc: "Starts as r/mu from population. Increases by 1 for each new cycle." },
        ].map((p, i) => (
          <div key={i} style={{ flex: 1, minWidth: "200px", background: palette.surfaceAlt, border: `1px solid ${palette.border}`, borderRadius: "8px", padding: "14px 16px" }}>
            <div style={{ color: palette.teal, fontFamily: "monospace", fontSize: "20px", marginBottom: "6px" }}>{p.sym}</div>
            <div style={{ color: palette.text, fontWeight: 600, marginBottom: "4px" }}>{p.name}</div>
            <div style={{ color: palette.textMuted, fontSize: "13px" }}>{p.desc}</div>
          </div>
        ))}
      </div>
      <h3 style={sH3}><Code>update(new_lengths)</Code> — The Beautiful Simplicity</h3>
      <CodeBlock>{`alpha += sum(valid_cycle_lengths)   # e.g. 38 + 32 + 41 + 35 = 146
beta  += len(valid_cycles)          # e.g. += 4

# That's the ENTIRE Bayesian update. The math guarantees correctness.`}</CodeBlock>
      <Callout type="analogy">
        You're estimating the average weight of apples from a farm. You start with a prior belief (apples are usually 150g). Each apple you weigh updates your belief. After 5 apples, you have a more confident estimate. The Bayesian update formula does this automatically — and the confidence grows with every data point.
      </Callout>
      <h3 style={sH3}>The Blending — Interactive</h3>
      <div style={{ margin: "16px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "12px" }}>
          <label style={{ color: palette.textMuted, fontSize: "13px" }}>Cycles logged:</label>
          <input
            type="range"
            min={3}
            max={8}
            value={cycles}
            onChange={e => setCycles(Number(e.target.value))}
            style={{ accentColor: palette.teal, flex: 1, maxWidth: "200px" }}
          />
          <span style={{ fontFamily: "monospace", color: palette.teal, minWidth: "20px" }}>{cycles}</span>
        </div>
        <BlendVisual personalWeight={weight} />
        <div style={{ fontFamily: "monospace", fontSize: "12px", color: palette.textMuted, marginTop: "8px" }}>
          personal_weight = min({cycles} / 8, 1.0) = <span style={{ color: palette.teal }}>{weight.toFixed(3)}</span>
        </div>
        <div style={{ fontFamily: "monospace", fontSize: "12px", color: palette.textMuted, marginTop: "4px" }}>
          blended = <span style={{ color: palette.teal }}>{(weight * 100).toFixed(1)}%</span> × personal + <span style={{ color: palette.rose }}>{((1 - weight) * 100).toFixed(1)}%</span> × population
        </div>
      </div>
      <Callout type="analogy">
        Like a new employee. On day one, mostly follow company policy (population). By month three, trusted to use your own judgment (personal). Weight shifts gradually.
      </Callout>
    </div>
  );
}

function SectionPhase3() {
  return (
    <div>
      <h2 style={sH2}>Phase 3 — LSTM Neural Network</h2>
      <Tag color={palette.accent}>lstm · ≥ 8 cycles</Tag>
      <p style={{ ...sP, marginTop: "14px" }}>
        We have 8+ cycles. Enough to train a neural network that learns <em>sequential patterns</em> — not just averages, but rhythms, trends, and contextual relationships.
      </p>
      <h3 style={sH3}>What is an LSTM?</h3>
      <Callout type="analogy">
        A regular neural network sees each input independently. An LSTM is like a reader who remembers what happened in previous chapters. It can learn "this person's cycles tend to be long after a stressful month" or "her cycles have been shortening by 1 day every cycle for the past year."
      </Callout>
      <h3 style={sH3}>Architecture — <Code>CycleLSTM</Code></h3>
      <div style={{ margin: "16px 0", fontFamily: "monospace", fontSize: "12px" }}>
        {[
          { label: "Input", detail: "(batch_size, 6 timesteps, N_features)", color: palette.textMuted },
          { label: "LSTM Layer 1", detail: "64 hidden units, dropout=0.2", color: palette.accent },
          { label: "LSTM Layer 2", detail: "64 hidden units, dropout=0.2", color: palette.accent },
          { label: "Last timestep", detail: "Take output of final timestep only", color: palette.teal },
          { label: "Dropout", detail: "Active during training (and MC inference!)", color: palette.amber },
          { label: "Linear(64→1)", detail: "Predicted next cycle length", color: palette.green },
        ].map((layer, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: "0" }}>
            <div
              style={{
                padding: "10px 16px",
                background: i % 2 === 0 ? "#0d1520" : "#080c14",
                border: `1px solid ${palette.border}`,
                borderTop: i > 0 ? "none" : undefined,
                borderRadius: i === 0 ? "8px 8px 0 0" : i === 5 ? "0 0 8px 8px" : "0",
                display: "flex",
                justifyContent: "space-between",
                flex: 1,
              }}
            >
              <span style={{ color: layer.color }}>{layer.label}</span>
              <span style={{ color: palette.textDim }}>{layer.detail}</span>
            </div>
          </div>
        ))}
      </div>
      <FeatureTable
        rows={[
          ["Parameter", "Value", "Meaning"],
          ["hidden_size", "64", "64 memory cells per LSTM layer"],
          ["num_layers", "2", "Stacked depth — can learn more complex patterns"],
          ["dropout", "0.2", "20% neurons disabled during training — prevents memorisation"],
          ["batch_first", "True", "Input shape convention: (batch, time, features)"],
        ]}
      />
      <h3 style={sH3}><Code>pretrain()</Code> vs <Code>finetune()</Code></h3>
      <Callout type="analogy">
        A doctor first studies general medicine (pretrain on population), then specialises in your case (finetune on personal). General knowledge provides a strong foundation; specialisation refines it.
      </Callout>
      <FeatureTable
        rows={[
          ["", "pretrain()", "finetune()"],
          ["epochs", "150", "60 (less iterations on personal data)"],
          ["learning rate", "1e-3", "1e-3 × 0.2 (much smaller — why below)"],
          ["val_split", "15% held out", "None (too little personal data)"],
          ["patience", "20 epochs", "15 epochs"],
          ["checkpoint", "LSTM_CHECKPOINT", "LSTM_PERSONAL"],
        ]}
      />
      <Callout type="key">
        <strong>Why smaller learning rate for fine-tuning?</strong> Prevents "catastrophic forgetting" — training too aggressively on personal data makes the model forget everything it learned from the population. Small steps let it specialise while keeping its general knowledge intact.
      </Callout>
      <h3 style={sH3}><Code>_train_loop()</Code> — The Training Engine</h3>
      {[
        { title: "Time-ordered split", desc: "Last 15% held out for validation. Never shuffled — order matters in sequences." },
        { title: "DataLoader (batch_size=32)", desc: "Feeds 32 sequences at a time. Shuffled per epoch during training." },
        { title: "Adam optimiser", desc: "The standard gradient descent variant — smart about adjusting learning rate per parameter." },
        { title: "ReduceLROnPlateau", desc: "If val loss stops improving for 5 epochs, cut learning rate in half. Automatic adaptive learning." },
        { title: "HuberLoss (delta=2.0)", desc: "Blend of MSE and MAE. Errors < 2 days treated like MSE (smooth). Errors > 2 days treated like MAE (less sensitive to outliers). One freak 60-day cycle won't ruin the model." },
        { title: "Gradient clipping (norm=1.0)", desc: "If gradients get too large during backpropagation, scale them down. Prevents 'exploding gradients' — a classic LSTM failure mode." },
        { title: "Early stopping (patience=20)", desc: "If val loss hasn't improved in 20 epochs, stop. Saves time and prevents overfitting." },
        { title: "Save best model", desc: "state_dict (all weights) saved whenever val loss improves." },
      ].map((s, i) => (
        <div key={i} style={{ display: "flex", gap: "14px", padding: "10px 0", borderBottom: `1px solid ${palette.border}` }}>
          <div style={{ color: palette.accent, fontFamily: "monospace", minWidth: "18px", paddingTop: "2px" }}>›</div>
          <div>
            <div style={{ color: palette.text, fontWeight: 600, fontSize: "13.5px", marginBottom: "3px" }}>{s.title}</div>
            <div style={{ color: palette.textMuted, fontSize: "13px", lineHeight: "1.6" }}>{s.desc}</div>
          </div>
        </div>
      ))}
      <h3 style={sH3}><Code>predict(x, n_samples=100)</Code> — Monte Carlo Dropout</h3>
      <Callout type="key">
        <strong>The problem:</strong> How do you know how <em>confident</em> the model is? A standard neural network gives one number with no sense of uncertainty.
        <br /><br />
        <strong>The solution:</strong> Run the model 100 times with random dropout active. The spread tells you how uncertain it is.
      </Callout>
      <CodeBlock>{`# Key insight: use model.train() during inference — keeps dropout ACTIVE
self.model.train()
predictions = [model(x) for _ in range(100)]  # 100 stochastic forward passes

# If all 100 runs agree → small std → HIGH confidence
# If runs vary wildly → large std → model is UNCERTAIN`}</CodeBlock>
      <FeatureTable
        rows={[
          ["Output", "Meaning"],
          ["point_estimate", "Mean of 100 predictions"],
          ["std", "Standard deviation of 100 predictions (= uncertainty)"],
          ["ci_lower_80 / ci_upper_80", "10th and 90th percentiles (80% interval)"],
          ["ci_lower_95 / ci_upper_95", "2.5th and 97.5th percentiles (95% interval)"],
        ]}
      />
    </div>
  );
}

function SectionInference() {
  return (
    <div>
      <h2 style={sH2}>Inference Orchestrator — <Code>predict_next_cycle()</Code></h2>
      <p style={sP}>Called every time the app needs a prediction. The main coordinator.</p>
      <h3 style={sH3}>The Flow</h3>
      {[
        { n: "1", title: "Fetch personal cycles", desc: "From database (count_completed_cycles, get_completed_cycles) or directly as argument." },
        { n: "2", title: "Resolve phase", desc: "resolve_phase(n_personal) → picks the model. personal_mean/std computed (defaults: 35.0 / 7.0)." },
        { n: "3", title: "Run the model", desc: "Dispatches to cold_start / bayesian / lstm path." },
        { n: "4", title: "Compute derived dates", desc: "next_period_start, est_ovulation, fertile_window." },
        { n: "5", title: "Annotate current phase", desc: "If day_of_current_cycle was provided, predict_current_phase() adds current_phase to result." },
        { n: "6", title: "Audit log", desc: "save_model_run() persists to model_runs table. Failures logged but never break the response." },
      ].map((s, i) => (
        <div key={i} style={{ display: "flex", gap: "14px", padding: "12px 0", borderBottom: `1px solid ${palette.border}` }}>
          <div style={{ fontFamily: "monospace", color: palette.purple, opacity: 0.7, minWidth: "20px" }}>{s.n}</div>
          <div>
            <div style={{ color: palette.text, fontWeight: 600, fontSize: "14px", marginBottom: "4px" }}>{s.title}</div>
            <div style={{ color: palette.textMuted, fontSize: "13px", lineHeight: "1.6" }}>{s.desc}</div>
          </div>
        </div>
      ))}
      <h3 style={sH3}>Derived Date Formulas</h3>
      <CodeBlock>{`next_period_start  = last_cycle_start + timedelta(days=int(predicted_length))
est_ovulation      = next_period_start − 14 days   # luteal phase constant
fertile_window     = [est_ovulation − 5, est_ovulation]
                     # sperm can survive up to 5 days`}</CodeBlock>
      <h3 style={sH3}>Current Phase Classifier — <Code>predict_current_phase()</Code></h3>
      <p style={sP}>Not ML — pure domain logic. Given the day of the current cycle and personal average cycle length:</p>
      <FeatureTable
        rows={[
          ["Days", "Phase", "Biology"],
          ["1–5", "menstrual", "Bleeding"],
          ["6 → follicular_end", "follicular", "Eggs developing"],
          ["follicular_end → +2", "ovulatory", "Egg released"],
          ["After that", "luteal", "Progesterone phase"],
        ]}
      />
      <Callout type="key">
        Boundaries shift with personal cycle length. 28-day user → follicular ends day 12. 35-day user → follicular ends day 19. Personalised without any ML.
      </Callout>
      <h3 style={sH3}>Output Schema</h3>
      <CodeBlock lang="json">{`{
  "phase_label":           "cold_start | bayesian | lstm",
  "confidence":            "Moderate — based on 5 cycles (62.5% personal weight)",
  "point_estimate":        33.2,
  "std":                   4.1,
  "ci_lower":              27,        // population / bayesian — 10th–90th NB pctile
  "ci_upper":              40,
  "ci_lower_80":           28.5,      // LSTM only — MC dropout percentiles
  "ci_upper_80":           38.1,
  "posterior_mean":        33.8,      // bayesian only
  "personal_weight":       0.625,     // bayesian only
  "source":                "bayesian_personal",
  "next_cycle_length_est": 33.2,
  "next_period_start_est": "2026-06-28",
  "ovulation_date_est":    "2026-06-14",
  "fertile_window_start":  "2026-06-09",
  "fertile_window_end":    "2026-06-14",
  "n_personal_cycles":     5,
  "personal_mean_length":  33.4,
  "personal_std_length":   5.2,
  "generated_on":          "2026-06-03"
}`}</CodeBlock>
    </div>
  );
}

function SectionUpdate() {
  return (
    <div>
      <h2 style={sH2}>Online Update — <Code>update_with_new_cycle()</Code></h2>
      <p style={sP}>Called every time a user marks a cycle as complete. Two things happen:</p>
      <div style={{ display: "flex", gap: "14px", margin: "16px 0", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: "240px", background: palette.greenSoft, border: `1px solid ${palette.green}33`, borderRadius: "10px", padding: "16px 18px" }}>
          <Tag color={palette.green}>Always · Synchronous · Fast</Tag>
          <div style={{ color: palette.text, fontWeight: 600, margin: "10px 0 6px" }}>Bayesian Update</div>
          <ul style={{ ...sList, color: palette.textMuted, margin: 0 }}>
            <li>Load Bayesian state (alpha, beta)</li>
            <li>Add new cycle length → alpha += length; beta += 1</li>
            <li>Save back to disk</li>
            <li>Milliseconds — fine to run inline before HTTP response</li>
          </ul>
        </div>
        <div style={{ flex: 1, minWidth: "240px", background: palette.accentGlow, border: `1px solid ${palette.accent}33`, borderRadius: "10px", padding: "16px 18px" }}>
          <Tag color={palette.accent}>LSTM phase only · Background thread</Tag>
          <div style={{ color: palette.text, fontWeight: 600, margin: "10px 0 6px" }}>LSTM Fine-tune</div>
          <ul style={{ ...sList, color: palette.textMuted, margin: 0 }}>
            <li>Rebuild personal sequences (needs ≥ 2)</li>
            <li>Load population pretrained checkpoint (not personal — avoids compounding errors)</li>
            <li>Run finetune() with full personal history</li>
            <li>Save to LSTM_PERSONAL path</li>
          </ul>
        </div>
      </div>
      <Callout type="analogy">
        <strong>Why a background thread?</strong> Fine-tuning takes seconds. The HTTP response doesn't need to wait. The app says "your cycle was logged" immediately, and the model updates silently in the background. The user never notices the delay.
      </Callout>
      <h3 style={sH3}>Graceful Degradation — Nothing Ever Crashes</h3>
      <FeatureTable
        rows={[
          ["Component fails", "Fallback"],
          ["Public CSV datasets missing", "_make_synthetic_population() 120-subject fallback"],
          ["LSTM pre-training impossible", "Phase 3 silently falls back to Bayesian at inference"],
          ["LSTM personal checkpoint missing", "_predict_lstm catches error → returns Bayesian prediction"],
          ["Feature scaler missing", "Use raw unscaled values (less ideal, still functional)"],
          ["DB unreachable at logging", "Error logged; prediction still returned to caller"],
          ["No previous period start date", "next_period_est = today + predicted_length"],
          ["PopulationPrior JSON missing", "Returns defaults: mu=35, r=5"],
        ]}
      />
      <Callout type="key">
        The only hard prerequisites are that <Code>numpy</Code>, <Code>scipy</Code>, and <Code>scikit-learn</Code> are importable. Everything else has a fallback.
      </Callout>
    </div>
  );
}

function SectionGlossary() {
  const terms = [
    { term: "Negative Binomial", category: "Distribution", color: palette.rose, def: "A probability distribution for count data that allows for 'overdispersion' — more spread than a Poisson. Natural fit for irregular cycle lengths.", analogy: "Like a flexible bell curve that can stretch wider or narrower depending on how variable the data is." },
    { term: "MLE", category: "Estimation", color: palette.amber, def: "Maximum Likelihood Estimation — finding parameters that make observed data most probable.", analogy: "You have 100 cycle lengths. Find the μ and r that make the NB distribution 'most likely' to have generated exactly those numbers." },
    { term: "Gradient Boosting", category: "Ensemble ML", color: palette.teal, def: "An ensemble model that trains trees sequentially, each correcting the errors of the previous.", analogy: "Like a committee where each new member specifically addresses what the previous members got wrong." },
    { term: "Conjugate Prior", category: "Bayesian Statistics", color: palette.purple, def: "A prior distribution that, when combined with its likelihood, produces a posterior of the same family. Enables closed-form Bayesian updates.", analogy: "Your prior belief (Gamma) + observed data (Poisson) = updated belief (Gamma). The math works out cleanly — just add numbers." },
    { term: "Gamma-Poisson", category: "Conjugate Pair", color: palette.accent, def: "Gamma is the prior belief about a Poisson rate. Observing Poisson data updates the Gamma parameters analytically.", analogy: "Estimating apple weights. Start with a Gamma belief, weigh apples (Poisson counts), get a sharper Gamma posterior." },
    { term: "LSTM", category: "Neural Network", color: palette.accent, def: "Long Short-Term Memory — a recurrent neural network with memory gates that can learn long-range dependencies in sequences.", analogy: "A reader who remembers previous chapters. Can learn 'cycles tend to be long after stressful months.'" },
    { term: "Transfer Learning", category: "Training Strategy", color: palette.teal, def: "Pre-train a model on large data, then fine-tune it on small personal data. The population knowledge is a starting point.", analogy: "A doctor who first studies general medicine (pretrain), then specialises in your case (finetune)." },
    { term: "MC Dropout", category: "Uncertainty", color: palette.rose, def: "Monte Carlo Dropout — run the model N times with dropout active. The spread of predictions = uncertainty.", analogy: "Instead of one expert's opinion, ask 100 slightly different experts. Wide spread = model is uncertain." },
    { term: "Huber Loss", category: "Loss Function", color: palette.amber, def: "A loss function that behaves like MSE for small errors and MAE for large errors (delta=2.0 here). Robust to outliers.", analogy: "One freak 60-day cycle shouldn't wreck the whole model. Huber Loss dampens the impact of extreme outliers." },
    { term: "StandardScaler", category: "Preprocessing", color: palette.purple, def: "Rescales features to mean=0, std=1. Prevents large-valued features from dominating.", analogy: "Comparing salary (€50,000) to age (35). Without scaling the model overweights salary. Scaling puts them on equal footing." },
    { term: "Early Stopping", category: "Regularisation", color: palette.green, def: "Stop training when validation loss stops improving (after patience epochs). Prevents overfitting.", analogy: "Stop studying when you stop learning. More practice on the same examples just makes you memorise, not understand." },
    { term: "Gradient Clipping", category: "Stability", color: palette.accent, def: "Cap gradient magnitude during backprop. Prevents 'exploding gradients' — a classic LSTM failure mode.", analogy: "A speed limiter on a car. Without it, gradients can blow up and the model diverges." },
    { term: "Data Leakage", category: "ML Hygiene", color: palette.rose, def: "When future information contaminates training features. Makes model look great in testing but fail in production.", analogy: "Predicting tomorrow's weather using tomorrow's temperature. Looks 100% accurate in tests, useless in reality." },
    { term: "OLS Slope", category: "Statistics", color: palette.teal, def: "Ordinary Least Squares regression slope — the best-fit line through data points. Used here as the 'trend' feature.", analogy: "Draw a line through your cycle history that minimises total squared distance. The slope tells you if cycles are getting longer or shorter." },
  ];

  const [search, setSearch] = useState("");
  const filtered = terms.filter(t =>
    t.term.toLowerCase().includes(search.toLowerCase()) ||
    t.category.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <h2 style={sH2}>ML Concepts Glossary</h2>
      <input
        placeholder="Search terms…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{
          width: "100%",
          padding: "10px 14px",
          background: palette.surfaceAlt,
          border: `1px solid ${palette.border}`,
          borderRadius: "8px",
          color: palette.text,
          fontSize: "13px",
          marginBottom: "20px",
          outline: "none",
          boxSizing: "border-box",
        }}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {filtered.map((t, i) => (
          <div
            key={i}
            style={{
              background: palette.surfaceAlt,
              border: `1px solid ${palette.border}`,
              borderLeft: `3px solid ${t.color}`,
              borderRadius: "0 8px 8px 0",
              padding: "14px 16px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px", flexWrap: "wrap" }}>
              <span style={{ color: palette.text, fontWeight: 700, fontSize: "14px" }}>{t.term}</span>
              <Tag color={t.color}>{t.category}</Tag>
            </div>
            <p style={{ margin: "0 0 6px", color: palette.textMuted, fontSize: "13px", lineHeight: "1.6" }}>
              {t.def}
            </p>
            <p style={{ margin: 0, color: palette.textDim, fontSize: "12.5px", lineHeight: "1.6", fontStyle: "italic" }}>
              💡 {t.analogy}
            </p>
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{ color: palette.textDim, fontSize: "13px", textAlign: "center", padding: "24px" }}>
            No terms match "{search}"
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Style constants ───────────────────────────────────────────────────────

const sH2 = {
  fontFamily: "'Crimson Pro', 'Playfair Display', Georgia, serif",
  fontSize: "22px",
  fontWeight: 600,
  color: palette.text,
  margin: "0 0 16px",
  letterSpacing: "-0.3px",
};
const sH3 = {
  fontFamily: "'Crimson Pro', 'Playfair Display', Georgia, serif",
  fontSize: "16px",
  fontWeight: 600,
  color: palette.textMuted,
  margin: "24px 0 10px",
  letterSpacing: "0.2px",
};
const sP = {
  color: palette.textMuted,
  fontSize: "13.5px",
  lineHeight: "1.7",
  margin: "0 0 12px",
};
const sList = {
  color: palette.textMuted,
  fontSize: "13.5px",
  lineHeight: "1.8",
  paddingLeft: "20px",
  margin: "8px 0 12px",
};

const SECTION_COMPONENTS = {
  overview: SectionOverview,
  setup: SectionSetup,
  loaders: SectionLoaders,
  features: SectionFeatures,
  phase1: SectionPhase1,
  phase2: SectionPhase2,
  phase3: SectionPhase3,
  inference: SectionInference,
  update: SectionUpdate,
  glossary: SectionGlossary,
};

// ─── Main App ──────────────────────────────────────────────────────────────

export default function PipelineExplainer() {
  const [active, setActive] = useState("overview");
  const [menuOpen, setMenuOpen] = useState(false);
  const contentRef = useRef(null);
  const activeSection = SECTIONS.find(s => s.id === active);
  const ActiveComponent = SECTION_COMPONENTS[active];

  useEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }, [active]);

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        background: palette.bg,
        fontFamily: "'Inter', 'DM Sans', system-ui, sans-serif",
        color: palette.text,
        overflow: "hidden",
      }}
    >
      {/* Sidebar */}
      <div
        style={{
          width: "220px",
          minWidth: "220px",
          background: palette.surface,
          borderRight: `1px solid ${palette.border}`,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "20px 18px 16px",
            borderBottom: `1px solid ${palette.border}`,
          }}
        >
          <div
            style={{
              fontSize: "10px",
              fontFamily: "monospace",
              color: palette.textDim,
              letterSpacing: "2px",
              textTransform: "uppercase",
              marginBottom: "6px",
            }}
          >
            pipeline docs
          </div>
          <div
            style={{
              fontSize: "14px",
              fontWeight: 700,
              color: palette.text,
              letterSpacing: "-0.3px",
            }}
          >
            Period Tracker ML
          </div>
          <div style={{ fontSize: "11px", color: palette.textDim, marginTop: "2px" }}>
            End-to-End Walkthrough
          </div>
        </div>
        {/* Nav */}
        <nav style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
          {SECTIONS.map(s => (
            <button
              key={s.id}
              onClick={() => setActive(s.id)}
              style={{
                width: "100%",
                background: active === s.id ? `${s.color}18` : "none",
                border: "none",
                borderLeft: active === s.id ? `2px solid ${s.color}` : "2px solid transparent",
                padding: "9px 18px",
                display: "flex",
                alignItems: "center",
                gap: "10px",
                cursor: "pointer",
                textAlign: "left",
                transition: "all 0.15s",
              }}
            >
              <span
                style={{
                  fontSize: "14px",
                  width: "20px",
                  textAlign: "center",
                  color: active === s.id ? s.color : palette.textDim,
                }}
              >
                {s.icon}
              </span>
              <span
                style={{
                  fontSize: "13px",
                  color: active === s.id ? palette.text : palette.textMuted,
                  fontWeight: active === s.id ? 600 : 400,
                }}
              >
                {s.label}
              </span>
            </button>
          ))}
        </nav>
        {/* Footer */}
        <div
          style={{
            padding: "12px 18px",
            borderTop: `1px solid ${palette.border}`,
            fontSize: "11px",
            color: palette.textDim,
          }}
        >
          {SECTIONS.length} sections · Self Care Journal
        </div>
      </div>

      {/* Main content */}
      <div
        ref={contentRef}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "32px 40px 60px",
          maxWidth: "860px",
        }}
      >
        {/* Breadcrumb */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            marginBottom: "24px",
            fontSize: "12px",
            color: palette.textDim,
            fontFamily: "monospace",
          }}
        >
          <span>pipeline</span>
          <span>›</span>
          <span style={{ color: activeSection?.color }}>{activeSection?.label}</span>
        </div>
        <ActiveComponent />
      </div>
    </div>
  );
}
