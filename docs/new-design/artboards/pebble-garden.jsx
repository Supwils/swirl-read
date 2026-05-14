// Pebble Garden — v2.
//
// The same organic-tile metaphor, but rebuilt against the brand fonts
// (Source Serif / Inter / JetBrains Mono) and the original SwirlRead
// palette (Sepia + Dark themes). The handwritten flourishes are gone;
// what remains is the structural idea: folders as soft pastel pebbles,
// files inside as quiet mono pills, with a right-click menu that lists
// the actions the user described — Open here / Open in split pane /
// Open beside / Reveal in folder / Copy path.

// Organic-feeling rounded-rect radii. Pixel-based so titles at corners
// don't get clipped by an elliptical curve.
const PEBBLE_SHAPES = [
  "48px 62px 52px 56px / 60px 48px 56px 52px",
  "58px 48px 52px 62px / 52px 60px 48px 56px",
  "52px 56px 62px 48px / 56px 52px 48px 60px",
  "62px 52px 48px 58px / 48px 56px 62px 52px",
  "52px 62px 56px 48px / 62px 52px 48px 56px",
  "48px 58px 52px 60px / 56px 48px 60px 52px",
];

function FilePill({ file, folderId, hovered, selected }) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        padding: "4px 9px 4px 8px",
        background:
          selected ? `var(--f-${folderId}-deep)` :
          hovered ? "var(--paper)" :
                    "rgba(255,255,255,0.35)",
        border: selected
          ? `1px solid var(--f-${folderId}-ink)`
          : `1px solid transparent`,
        borderRadius: 999,
        boxShadow:
          selected
            ? "0 2px 6px rgba(0,0,0,0.12)"
            : hovered
              ? "0 1px 2px rgba(0,0,0,0.06)"
              : "inset 0 -1px 0 rgba(0,0,0,0.04)",
        color: `var(--f-${folderId}-ink)`,
        maxWidth: "100%",
        cursor: "pointer",
      }}
    >
      <span
        style={{
          fontFamily: "var(--mono)",
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: "0.01em",
          color: `var(--f-${folderId}-ink)`,
          opacity: selected ? 1 : 0.92,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          maxWidth: 200,
        }}
      >
        {file.name}
      </span>
      <window.ExtChip ext={file.ext} folderId={folderId} />
    </div>
  );
}

function Pebble({ folder, size = "md", shapeIdx = 0, focused, selectedFile }) {
  const isLg = size === "lg";
  const isSm = size === "sm";
  const titleSize = isLg ? 36 : isSm ? 24 : 30;
  const filesToShow = isLg ? 5 : isSm ? 3 : 4;
  const pad = isLg ? "26px 32px 22px" : isSm ? "20px 22px 18px" : "22px 26px 20px";

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        borderRadius: PEBBLE_SHAPES[shapeIdx % PEBBLE_SHAPES.length],
        background: `var(--f-${folder.id})`,
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -1px 0 rgba(0,0,0,0.06), 0 8px 20px var(--shadow), 0 1px 2px var(--shadow)",
        padding: pad,
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Header: title + count */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 10,
          marginBottom: isLg ? 8 : 6,
        }}
      >
        <h2
          style={{
            fontFamily: "var(--serif)",
            fontWeight: 600,
            fontSize: titleSize,
            color: `var(--f-${folder.id}-ink)`,
            lineHeight: 1.05,
            letterSpacing: "-0.01em",
          }}
        >
          {folder.name}
        </h2>
        <span
          className="ui"
          style={{
            fontSize: 10.5,
            fontWeight: 600,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: `var(--f-${folder.id}-ink)`,
            opacity: 0.55,
          }}
        >
          {folder.childCount} files
          {folder.childFolders > 0 ? " · " + folder.childFolders + " sub" : ""}
        </span>
        <div style={{ flex: 1 }} />
        {focused && (
          <span
            style={{
              fontFamily: "var(--sans)",
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: `var(--f-${folder.id}-ink)`,
              borderBottom: `1.5px solid var(--f-${folder.id}-ink)`,
              paddingBottom: 1,
              alignSelf: "flex-end",
            }}
          >
            open
          </span>
        )}
      </div>

      {/* Summary */}
      {!isSm && (
        <div
          style={{
            fontFamily: "var(--serif)",
            fontStyle: "italic",
            fontSize: 13.5,
            lineHeight: 1.45,
            color: `var(--f-${folder.id}-ink)`,
            opacity: 0.75,
            marginBottom: 14,
            maxWidth: "92%",
          }}
        >
          {folder.summary}
        </div>
      )}

      {/* File pills */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          alignContent: "flex-start",
          flex: 1,
        }}
      >
        {folder.files.slice(0, filesToShow).map((f) => (
          <FilePill
            key={f.id}
            file={f}
            folderId={folder.id}
            selected={selectedFile === f.id}
          />
        ))}
        {folder.childCount > filesToShow && (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "4px 11px",
              borderRadius: 999,
              border: `1px dashed var(--f-${folder.id}-ink)`,
              color: `var(--f-${folder.id}-ink)`,
              opacity: 0.5,
              fontFamily: "var(--sans)",
              fontWeight: 500,
              fontSize: 11,
            }}
          >
            +{folder.childCount - filesToShow} more
          </div>
        )}
      </div>

      {/* Footer hint */}
      {!isSm && (
        <div
          style={{
            marginTop: 14,
            paddingTop: 10,
            borderTop: `1px solid var(--f-${folder.id}-ink)`,
            opacity: 0.85,
            display: "flex",
            alignItems: "center",
            fontFamily: "var(--sans)",
            fontSize: 10.5,
            fontWeight: 500,
            color: `var(--f-${folder.id}-ink)`,
            letterSpacing: "0.04em",
          }}
        >
          <span style={{ opacity: 0.7 }}>opened {folder.lastOpened}</span>
          <span style={{ flex: 1 }} />
          <span style={{ opacity: 0.7 }}>click · right-click for options</span>
        </div>
      )}
    </div>
  );
}

function ContextMenu({ folderId }) {
  const items = [
    { k: "Open here",         h: "↵"      },
    { k: "Open in split pane", h: "⌘↵",   hover: true },
    { k: "Open beside",        h: "⇧⌘↵" },
    { k: "Open in new tab",    h: "⌥⌘↵" },
    { kind: "divider" },
    { k: "Peek preview",       h: "Space" },
    { k: "Reveal in folder",   h: "⌘R"   },
    { k: "Copy path",          h: "⌘C"   },
    { k: "Copy contents",      h: "⇧⌘C"  },
  ];
  return (
    <div
      style={{
        background: "var(--paper)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        boxShadow: "0 18px 40px var(--shadow-deep), 0 2px 4px var(--shadow)",
        padding: "6px",
        minWidth: 260,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 10px 8px",
          borderBottom: "1px solid var(--border-soft)",
          marginBottom: 4,
        }}
      >
        <span
          className="mono"
          style={{ fontSize: 11, color: "var(--text)", fontWeight: 500 }}
        >
          react-rendering-model.md
        </span>
        <div style={{ flex: 1 }} />
        <window.ExtChip ext="md" folderId={folderId} />
      </div>
      {items.map((it, i) =>
        it.kind === "divider" ? (
          <div
            key={i}
            style={{
              height: 1,
              background: "var(--border-soft)",
              margin: "4px 6px",
            }}
          />
        ) : (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "6px 10px",
              borderRadius: 6,
              background: it.hover ? "var(--accent)" : "transparent",
              color: it.hover ? "var(--bg)" : "var(--text)",
              fontFamily: "var(--sans)",
              fontSize: 12.5,
              fontWeight: 500,
            }}
          >
            <span style={{ flex: 1 }}>{it.k}</span>
            <span
              className="mono"
              style={{
                fontSize: 10.5,
                opacity: it.hover ? 0.95 : 0.5,
              }}
            >
              {it.h}
            </span>
          </div>
        )
      )}
    </div>
  );
}

function PebbleGardenView({ theme = "light", showMenu = true }) {
  const V = window.SR_VAULT;
  const knowledge = V.folders.find((f) => f.id === "knowledge");
  const career = V.folders.find((f) => f.id === "career");
  const reading = V.folders.find((f) => f.id === "reading");
  const ai = V.folders.find((f) => f.id === "ai");
  const tasks = V.folders.find((f) => f.id === "tasks");
  const journal = V.folders.find((f) => f.id === "journal");

  return (
    <div
      className={"cz theme-" + theme}
      style={{
        width: "100%",
        height: "100%",
        background: "var(--bg)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <window.SwirlChrome
        path={V.path}
        fileCount={V.fileCount}
        folderCount={V.folderCount}
        right={
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="chip">
              <span className="mono" style={{ fontSize: 10 }}>⌘K</span>
              jump to anything
            </span>
            <div className="seg">
              <span className="on">Pebbles</span>
              <span>List</span>
            </div>
            <window.ThemeToggle value={theme} />
          </div>
        }
      />

      {/* Vault title bar */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 18,
          padding: "22px 52px 14px",
        }}
      >
        <div>
          <div
            className="label-tiny"
            style={{ color: "var(--accent)", marginBottom: 4 }}
          >
            Vault · 41 documents
          </div>
          <h1
            style={{
              fontFamily: "var(--serif)",
              fontWeight: 500,
              fontSize: 30,
              lineHeight: 1.05,
              letterSpacing: "-0.01em",
              color: "var(--text)",
            }}
          >
            {V.name}
          </h1>
        </div>
        <div style={{ flex: 1 }} />
        {/* Filter chips */}
        <div style={{ display: "flex", gap: 6 }}>
          {[
            { l: "All",          on: true  },
            { l: "Recently opened" },
            { l: "Unread"       },
            { l: ".md"          },
            { l: ".html"        },
          ].map((c, i) => (
            <span
              key={i}
              className={c.on ? "chip chip-strong" : "chip"}
            >
              {c.l}
            </span>
          ))}
        </div>
      </div>

      {/* Pebble grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.1fr 0.9fr 0.9fr 1.1fr",
          gridTemplateRows: "230px 218px 198px",
          gridTemplateAreas:
            `"knowledge knowledge reading   reading"
             "knowledge knowledge career    career"
             "tasks     journal   ai        ai"`,
          gap: 22,
          padding: "0 48px 28px",
          height: "calc(100% - 168px)",
          position: "relative",
        }}
      >
        <div style={{ gridArea: "knowledge" }}>
          <Pebble
            folder={knowledge}
            size="lg"
            shapeIdx={0}
            focused
            selectedFile={showMenu ? "k-2" : null}
          />
        </div>
        <div style={{ gridArea: "reading" }}>
          <Pebble folder={reading} size="md" shapeIdx={2} />
        </div>
        <div style={{ gridArea: "career" }}>
          <Pebble folder={career} size="md" shapeIdx={3} />
        </div>
        <div style={{ gridArea: "ai" }}>
          <Pebble folder={ai} size="lg" shapeIdx={4} />
        </div>
        <div style={{ gridArea: "tasks" }}>
          <Pebble folder={tasks} size="sm" shapeIdx={1} />
        </div>
        <div style={{ gridArea: "journal" }}>
          <Pebble folder={journal} size="sm" shapeIdx={5} />
        </div>

        {/* Context menu — anchored to the selected file in the knowledge pebble. */}
        {showMenu && (
          <div
            style={{
              position: "absolute",
              left: 360,
              top: 138,
              zIndex: 20,
            }}
          >
            {/* tiny connector dot */}
            <div
              style={{
                position: "absolute",
                left: -4,
                top: -4,
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "var(--accent)",
                boxShadow: "0 0 0 4px rgba(139,111,71,0.18)",
              }}
            />
            <ContextMenu folderId="knowledge" />
          </div>
        )}
      </div>

      {/* Bottom footer rail — keyboard hints + status. Quiet, mono. */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          padding: "10px 28px",
          borderTop: "1px solid var(--border-soft)",
          background: "var(--bg)",
          display: "flex",
          alignItems: "center",
          gap: 16,
          fontFamily: "var(--mono)",
          fontSize: 10.5,
          color: "var(--text-faint)",
          letterSpacing: "0.02em",
        }}
      >
        <span>↵ open</span>
        <span>⌘↵ split</span>
        <span>⌥↵ new tab</span>
        <span>space peek</span>
        <span style={{ flex: 1 }} />
        <span>vault is local-only · {V.fileCount} files · 41 indexed</span>
      </div>
    </div>
  );
}

function PebbleGardenLight() {
  return <PebbleGardenView theme="light" />;
}
function PebbleGardenDark() {
  return <PebbleGardenView theme="dark" />;
}

window.PebbleGardenLight = PebbleGardenLight;
window.PebbleGardenDark = PebbleGardenDark;
