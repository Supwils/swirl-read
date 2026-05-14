// Shared chrome primitives — Logo, top bar, mode/theme toggles. All
// pure presentational, no state. Loaded BEFORE any artboard so it's
// available as plain globals.

window.prettyTitle = function (name) {
  return name
    .replace(/-/g, " ")
    .replace(/(?:^|\s)\S/g, (s) => s.toUpperCase());
};

// SwirlRead wordmark — the small "bookmark" glyph + Source Serif name.
// Sized to match the rest of the chrome bar.
window.SwirlLogo = function SwirlLogo({ size = 22 }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div
        aria-hidden
        style={{
          width: size * 0.7,
          height: size,
          background: "var(--text)",
          clipPath: "polygon(0 0, 100% 0, 100% 100%, 50% 80%, 0 100%)",
          flex: "0 0 auto",
        }}
      />
      <div
        style={{
          fontFamily: "var(--serif)",
          fontWeight: 600,
          fontSize: size * 0.82,
          letterSpacing: "-0.01em",
          color: "var(--text)",
          lineHeight: 1,
          whiteSpace: "nowrap",
        }}
      >
        SwirlRead
      </div>
    </div>
  );
};

// The standard chrome bar across all artboards. `tabs` and `right` are
// slots so each artboard can populate as needed without redoing layout.
window.SwirlChrome = function SwirlChrome({ path, fileCount, folderCount, tabs, right }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "12px 28px",
        borderBottom: "1px solid var(--border-soft)",
        background: "var(--bg)",
        position: "relative",
        zIndex: 5,
      }}
    >
      <window.SwirlLogo />
      <div
        style={{
          width: 1,
          height: 16,
          background: "var(--border)",
          margin: "0 2px",
        }}
      />
      <div
        className="ui"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 12,
          color: "var(--text-muted)",
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "#65b07e",
            boxShadow: "0 0 0 3px rgba(101,176,126,0.18)",
          }}
        />
        <span className="mono" style={{ fontSize: 11.5, color: "var(--text)" }}>
          {path}
        </span>
        <span style={{ color: "var(--text-faint)" }}>·</span>
        <span style={{ color: "var(--text-faint)", fontSize: 11 }}>
          {folderCount} folders · {fileCount} files
        </span>
      </div>
      {tabs ? (
        <>
          <div
            style={{
              width: 1,
              height: 16,
              background: "var(--border)",
              margin: "0 2px",
            }}
          />
          {tabs}
        </>
      ) : null}
      <div style={{ flex: 1 }} />
      {right}
    </div>
  );
};

// Light/Dark theme segmented toggle. Visual only — host wires real
// theme switching. The current value is just a string.
window.ThemeToggle = function ThemeToggle({ value }) {
  return (
    <div className="seg" aria-label="Theme">
      {[
        { l: "Light", k: "light" },
        { l: "Dark",  k: "dark"  },
      ].map((o) => (
        <span key={o.k} className={value === o.k ? "on" : ""}>
          {o.l}
        </span>
      ))}
    </div>
  );
};

// Single/Dual reading mode segmented toggle. Used by the workspace.
window.ModeToggle = function ModeToggle({ value }) {
  return (
    <div className="seg" aria-label="View">
      {[
        { l: "Single", k: "single" },
        { l: "Dual",   k: "dual"   },
      ].map((o) => (
        <span key={o.k} className={value === o.k ? "on" : ""}>
          {o.l}
        </span>
      ))}
    </div>
  );
};

// Small folder icon — a thin manila-folder mark in the folder's ink.
// Used in the file shelf and tabs.
window.FolderGlyph = function FolderGlyph({ id, size = 12 }) {
  return (
    <span
      style={{
        position: "relative",
        display: "inline-block",
        width: size * 1.2,
        height: size,
        flex: "0 0 auto",
      }}
    >
      <span
        style={{
          position: "absolute",
          inset: 0,
          background: `var(--f-${id})`,
          border: `1px solid var(--f-${id}-ink)`,
          borderRadius: 2,
        }}
      />
      <span
        style={{
          position: "absolute",
          left: 1,
          top: -size * 0.28,
          width: size * 0.5,
          height: size * 0.3,
          background: `var(--f-${id})`,
          border: `1px solid var(--f-${id}-ink)`,
          borderBottom: "none",
          borderRadius: "2px 2px 0 0",
        }}
      />
    </span>
  );
};

// .md / .html chip — same look across artboards.
window.ExtChip = function ExtChip({ ext, folderId }) {
  const isHtml = ext === "html";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "0 6px",
        borderRadius: 3,
        border: `1px solid var(--f-${folderId}-ink)`,
        background: isHtml ? "var(--paper)" : `var(--f-${folderId})`,
        color: `var(--f-${folderId}-ink)`,
        fontFamily: "var(--mono)",
        fontSize: 9.5,
        fontWeight: 500,
        lineHeight: 1.6,
        letterSpacing: "0.02em",
      }}
    >
      .{ext}
    </span>
  );
};
