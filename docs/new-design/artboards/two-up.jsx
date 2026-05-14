// Workspace — single & dual pane.
//
// One component that takes a `mode` prop. The chrome, the file shelf,
// and the prose styles are identical across both modes — only the
// reading area swaps between one 720-wide column and two side-by-side
// columns. The single↔dual segmented toggle in the chrome makes the
// switch explicit. Both modes work in light + dark via the .theme-*
// class on the root.

// ── File shelf ───────────────────────────────────────────────────────
function FolderRow({ folder, expanded, activeFileId, onClick }) {
  return (
    <div style={{ marginBottom: expanded ? 4 : 1 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 10px",
          borderRadius: 6,
          background: expanded ? `var(--f-${folder.id})` : "transparent",
          cursor: "pointer",
        }}
      >
        <window.FolderGlyph id={folder.id} size={11} />
        <span
          style={{
            fontFamily: "var(--serif)",
            fontWeight: 600,
            fontSize: 13,
            color: expanded ? `var(--f-${folder.id}-ink)` : "var(--text)",
            flex: 1,
          }}
        >
          {folder.name}
        </span>
        <span
          className="mono"
          style={{
            fontSize: 10,
            color: expanded ? `var(--f-${folder.id}-ink)` : "var(--text-faint)",
            opacity: 0.7,
          }}
        >
          {folder.childCount}
        </span>
        <span
          className="ui"
          style={{
            fontSize: 10,
            color: expanded ? `var(--f-${folder.id}-ink)` : "var(--text-faint)",
            opacity: 0.6,
          }}
        >
          {expanded ? "▾" : "▸"}
        </span>
      </div>
      {expanded && (
        <div
          style={{
            paddingLeft: 14,
            marginLeft: 14,
            borderLeft: `1px solid var(--f-${folder.id}-deep)`,
            display: "flex",
            flexDirection: "column",
            gap: 1,
            marginTop: 4,
          }}
        >
          {folder.files.map((f) => {
            const active = f.id === activeFileId;
            return (
              <div
                key={f.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "3px 8px",
                  borderRadius: 5,
                  background: active ? `var(--f-${folder.id}-deep)` : "transparent",
                  color: active ? "var(--paper)" : `var(--f-${folder.id}-ink)`,
                }}
              >
                <span
                  className="mono"
                  style={{
                    fontSize: 10.5,
                    fontWeight: active ? 600 : 400,
                    flex: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {f.name}
                </span>
                <span
                  className="mono"
                  style={{
                    fontSize: 9,
                    opacity: 0.7,
                  }}
                >
                  .{f.ext}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FileShelf({ activeFileId, expandedFolderId }) {
  const V = window.SR_VAULT;
  return (
    <aside
      style={{
        width: "100%",
        height: "100%",
        background: "var(--bg-deep)",
        borderRight: "1px solid var(--border)",
        padding: "16px 12px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      {/* Vault summary */}
      <div>
        <div
          className="label-tiny"
          style={{ marginBottom: 6, color: "var(--text-faint)" }}
        >
          Vault
        </div>
        <div
          style={{
            fontFamily: "var(--serif)",
            fontWeight: 500,
            fontSize: 15,
            color: "var(--text)",
            lineHeight: 1.15,
            marginBottom: 2,
          }}
        >
          {V.name}
        </div>
        <div
          className="mono"
          style={{ fontSize: 10, color: "var(--text-faint)" }}
        >
          {V.path}
        </div>
      </div>

      {/* Recents */}
      <div>
        <div
          className="label-tiny"
          style={{ marginBottom: 6, color: "var(--text-faint)" }}
        >
          Recently opened
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {V.recent.slice(0, 4).map((r, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                padding: "4px 8px",
                borderRadius: 5,
                background: i === 0 ? "var(--surface)" : "transparent",
              }}
            >
              <window.FolderGlyph id={r.folder} size={10} />
              <span
                className="mono"
                style={{
                  fontSize: 10.5,
                  color: i === 0 ? "var(--text)" : "var(--text-muted)",
                  fontWeight: i === 0 ? 600 : 400,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  flex: 1,
                }}
              >
                {r.file}
              </span>
              <span
                style={{
                  fontFamily: "var(--sans)",
                  fontSize: 9.5,
                  color: "var(--text-faint)",
                }}
              >
                {r.at}
              </span>
            </div>
          ))}
        </div>
      </div>

      <hr className="rule-soft" />

      {/* Folders */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        <div
          className="label-tiny"
          style={{ marginBottom: 8, color: "var(--text-faint)" }}
        >
          Folders
        </div>
        {V.folders.map((f) => (
          <FolderRow
            key={f.id}
            folder={f}
            expanded={f.id === expandedFolderId}
            activeFileId={activeFileId}
          />
        ))}
      </div>

      {/* Quick-switch row — six tiny pebble bumps, echoes Pebble Garden */}
      <div>
        <div
          className="label-tiny"
          style={{ marginBottom: 6, color: "var(--text-faint)" }}
        >
          Jump
        </div>
        <div style={{ display: "flex", gap: 5 }}>
          {V.folders.map((f) => (
            <span
              key={f.id}
              title={f.name}
              style={{
                flex: 1,
                height: 18,
                borderRadius: "8px 10px 9px 8px / 9px 8px 10px 8px",
                background: `var(--f-${f.id})`,
                border: f.id === "reading" ? `1.5px solid var(--f-${f.id}-ink)` : "1px solid transparent",
                cursor: "pointer",
              }}
            />
          ))}
        </div>
      </div>
    </aside>
  );
}

// ── Doc content — pulled from sample-vault style content. ──────────
function DocBody({ kind, theme }) {
  if (kind === "thinking-with-ai") {
    return (
      <>
        <p style={{ margin: "0 0 1.2em" }}>
          In the AI era, knowledge is becoming{" "}
          <mark
            style={{
              background: "var(--highlight)",
              color: "inherit",
              padding: "0 3px",
              borderRadius: 2,
            }}
          >
            disposable
          </mark>
          . Why memorize, why deeply read, why reflect — when a model can
          answer anything in seconds? But there is a quiet cost. People
          stop knowing things. Critical thinking atrophies. The mind
          becomes a search interface for someone else's index.
        </p>
        <p style={{ margin: "0 0 1.2em" }}>
          The phrase that captures this: <em>being dragged by AI</em>{" "}
          instead of <em>walking with it</em>. The first costs nothing
          today and everything tomorrow. The second is slower, less
          impressive at a glance, and reliably yours. See{" "}
          <a
            style={{
              color: "var(--link)",
              textDecorationColor: "var(--accent-soft)",
              textDecorationStyle: "dotted",
              textUnderlineOffset: 3,
              cursor: "pointer",
            }}
          >
            [[building-your-substrate]]
          </a>{" "}
          for the longer version of the argument.
        </p>

        <Callout kind="tip">
          AI working <em>for</em> the reader augments recall and surfaces
          connections. AI working <em>on</em> the reader generates answers
          that bypass the thinking you came here to do.
        </Callout>

        <h2
          style={{
            fontFamily: "var(--serif)",
            fontWeight: 600,
            fontSize: 26,
            margin: "1.4em 0 0.5em",
            letterSpacing: "-0.01em",
          }}
        >
          On whose terms?
        </h2>
        <p style={{ margin: "0 0 1.2em" }}>
          AI is a feature in SwirlRead, eventually. The question is on
          whose terms. The people who think clearly in the age of AI are
          the ones who still read deeply — slowly, attentively, through
          real engagement with ideas.
        </p>

        <blockquote
          style={{
            margin: "1.4em 0 1.2em",
            padding: "0 0 0 22px",
            borderLeft: "2px solid var(--accent)",
            fontFamily: "var(--serif)",
            fontStyle: "italic",
            fontSize: 20,
            lineHeight: 1.45,
            color: "var(--text)",
            textWrap: "balance",
          }}
        >
          The substrate is what doesn't move when the conversation does.
        </blockquote>
      </>
    );
  }

  // react-rendering-model
  return (
    <>
      <p style={{ margin: "0 0 1.2em" }}>
        Rendering in React happens in three loops. The first is the{" "}
        <em>render phase</em>: pure, restartable, and where every hook
        is called. The second is the <em>commit phase</em>: synchronous
        and where DOM mutations actually happen. The third is{" "}
        <em>browser paint</em>, which React does not own.
      </p>
      <pre
        style={{
          margin: "1em 0",
          padding: "14px 16px",
          background: "var(--surface)",
          border: "1px solid var(--border-soft)",
          borderRadius: 6,
          fontFamily: "var(--mono)",
          fontSize: 12.5,
          color: "var(--text)",
          lineHeight: 1.65,
          overflow: "hidden",
        }}
      >
        <div>
          <span style={{ color: "var(--accent)" }}>function</span>{" "}
          render(fiber) {"{"}
        </div>
        <div>{"  "}if (fiber.dirty) reconcile(fiber);</div>
        <div>{"  "}scheduleCommit(fiber.root);</div>
        <div>{"}"}</div>
      </pre>
      <p style={{ margin: "0 0 1.2em" }}>
        The render phase can be paused, restarted, or thrown away —
        which is why side-effecting work belongs in commit. See also{" "}
        <a
          style={{
            color: "var(--link)",
            textDecorationColor: "var(--accent-soft)",
            textDecorationStyle: "dotted",
            textUnderlineOffset: 3,
          }}
        >
          [[thinking-with-ai]]
        </a>{" "}
        for the meta-argument about how to <em>use</em> this in practice.
      </p>
      <h2
        style={{
          fontFamily: "var(--serif)",
          fontWeight: 600,
          fontSize: 26,
          margin: "1.4em 0 0.5em",
          letterSpacing: "-0.01em",
        }}
      >
        The commit phase
      </h2>
      <p style={{ margin: "0 0 1.2em" }}>
        Commit is synchronous and atomic per root. Layout effects fire
        here, before paint; passive effects fire after. Knowing which is
        which is the single most useful piece of mental model …
      </p>
    </>
  );
}

function Callout({ kind, children }) {
  return (
    <div
      style={{
        margin: "1.4em 0",
        padding: "14px 18px",
        background: "var(--surface)",
        borderLeft: "3px solid var(--accent)",
        borderRadius: "0 6px 6px 0",
      }}
    >
      <div
        className="label-tiny"
        style={{ color: "var(--accent)", marginBottom: 4 }}
      >
        {kind}
      </div>
      <div
        style={{
          fontFamily: "var(--serif)",
          fontSize: 15,
          lineHeight: 1.6,
          color: "var(--text)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function DocPane({ folder, file, kind, active, theme, single }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "var(--bg)",
        minWidth: 0,
        minHeight: 0,
        position: "relative",
      }}
    >
      {/* progress sliver */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 2,
          background: "var(--border-soft)",
          zIndex: 1,
        }}
      >
        <div
          style={{
            width: kind === "thinking-with-ai" ? "32%" : "12%",
            height: "100%",
            background: "var(--accent)",
          }}
        />
      </div>

      {/* Pane head */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 22px",
          borderBottom: "1px solid var(--border-soft)",
        }}
      >
        <window.FolderGlyph id={folder.id} size={12} />
        <span
          className="mono"
          style={{ fontSize: 11.5, color: "var(--text-muted)" }}
        >
          {folder.name}/
        </span>
        <span
          className="mono"
          style={{ fontSize: 12, color: "var(--text)", fontWeight: 500 }}
        >
          {file.name}.{file.ext}
        </span>
        {active && (
          <span
            className="chip chip-accent"
            style={{ padding: "1px 8px", fontSize: 10 }}
          >
            active
          </span>
        )}
        <div style={{ flex: 1 }} />
        <span
          className="ui"
          style={{ fontSize: 11, color: "var(--text-faint)" }}
        >
          {file.words} words · {Math.ceil(file.words / 230)} min
        </span>
        {!single && (
          <div style={{ display: "flex", gap: 4 }}>
            {["⤢", "×"].map((g, i) => (
              <span
                key={i}
                style={{
                  width: 22,
                  height: 22,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "1px solid var(--border)",
                  borderRadius: 5,
                  background: "var(--bg)",
                  fontSize: 12,
                  color: "var(--text-muted)",
                  cursor: "pointer",
                }}
              >
                {g}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Body */}
      <div
        style={{
          flex: 1,
          overflow: "hidden",
          padding: single ? "44px 24px" : "30px 28px",
          display: "flex",
          justifyContent: "center",
        }}
      >
        <article
          style={{
            width: "100%",
            maxWidth: single ? 720 : "100%",
            fontFamily: "var(--serif)",
            fontSize: single ? 17 : 15.5,
            lineHeight: single ? 1.75 : 1.7,
            color: "var(--text)",
          }}
        >
          <div
            className="label-tiny"
            style={{ color: "var(--accent)", marginBottom: 10 }}
          >
            {folder.name} · {Math.ceil(file.words / 230)} min · {file.updated}
          </div>
          <h1
            style={{
              fontFamily: "var(--serif)",
              fontWeight: 500,
              fontSize: single ? 38 : 30,
              lineHeight: 1.1,
              letterSpacing: "-0.015em",
              color: "var(--text)",
              margin: "0 0 24px",
              textWrap: "balance",
            }}
          >
            {window.prettyTitle(file.name).replace(/Ai/g, "AI")}
          </h1>
          <DocBody kind={kind} theme={theme} />
        </article>
      </div>
    </div>
  );
}

// ── The artboard itself ──────────────────────────────────────────────
function WorkspaceView({ theme = "light", mode = "dual" }) {
  const V = window.SR_VAULT;
  const reading = V.folders.find((f) => f.id === "reading");
  const knowledge = V.folders.find((f) => f.id === "knowledge");
  const leftFile = reading.files.find((f) => f.name === "thinking-with-ai");
  const rightFile = knowledge.files.find((f) => f.name === "react-rendering-model");

  return (
    <div
      className={"cz theme-" + theme}
      style={{
        width: "100%",
        height: "100%",
        background: "var(--bg)",
        position: "relative",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Top chrome — wordmark, path, tabs, toggles. */}
      <window.SwirlChrome
        path={V.path}
        fileCount={V.fileCount}
        folderCount={V.folderCount}
        tabs={
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <DocTab folder={reading} file={leftFile} active />
            {mode === "dual" && <DocTab folder={knowledge} file={rightFile} />}
            <span
              className="ui"
              style={{
                fontSize: 11,
                color: "var(--text-faint)",
                paddingLeft: 6,
              }}
            >
              +
            </span>
          </div>
        }
        right={
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span className="chip">
              <span className="mono" style={{ fontSize: 10 }}>⌘K</span>
              jump
            </span>
            <window.ModeToggle value={mode} />
            <window.ThemeToggle value={theme} />
          </div>
        }
      />

      {/* Main: shelf + panes */}
      <div
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns:
            mode === "dual" ? "230px 1fr 1fr" : "230px 1fr",
          minHeight: 0,
        }}
      >
        <FileShelf
          activeFileId={leftFile.id}
          expandedFolderId={reading.id}
        />
        <DocPane
          folder={reading}
          file={leftFile}
          kind="thinking-with-ai"
          active
          theme={theme}
          single={mode === "single"}
        />
        {mode === "dual" && (
          <div
            style={{
              borderLeft: "1px solid var(--border)",
              minWidth: 0,
              position: "relative",
            }}
          >
            {/* draggable splitter */}
            <div
              style={{
                position: "absolute",
                left: -7,
                top: "50%",
                transform: "translateY(-50%)",
                width: 12,
                height: 44,
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 3,
                zIndex: 2,
                cursor: "ew-resize",
                boxShadow: "0 2px 4px var(--shadow)",
              }}
            >
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  style={{
                    width: 3,
                    height: 3,
                    background: "var(--text-faint)",
                    borderRadius: "50%",
                  }}
                />
              ))}
            </div>
            <DocPane
              folder={knowledge}
              file={rightFile}
              kind="react-rendering-model"
              theme={theme}
              single={false}
            />
          </div>
        )}
      </div>

      {/* Status strip */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "8px 22px",
          borderTop: "1px solid var(--border-soft)",
          background: "var(--bg-deep)",
          fontFamily: "var(--mono)",
          fontSize: 10.5,
          color: "var(--text-faint)",
        }}
      >
        <span>{mode === "dual" ? "2 panes · same window" : "1 pane · single column"}</span>
        <span>·</span>
        <span>linked scrolling: off</span>
        <span>·</span>
        <span>vault is local-only</span>
        <div style={{ flex: 1 }} />
        <span>⌘\ split &nbsp; ⌘W close pane &nbsp; ⌘1/2 focus &nbsp; F zen</span>
      </div>
    </div>
  );
}

function DocTab({ folder, file, active }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 7,
        padding: "4px 9px",
        background: active ? `var(--f-${folder.id})` : "transparent",
        border: "1px solid " + (active ? `var(--f-${folder.id}-deep)` : "var(--border)"),
        borderRadius: 6,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: `var(--f-${folder.id}-deep)`,
        }}
      />
      <span
        className="mono"
        style={{
          fontSize: 11,
          color: active ? `var(--f-${folder.id}-ink)` : "var(--text-muted)",
          fontWeight: 500,
        }}
      >
        {folder.name}/{file.name}.{file.ext}
      </span>
      <span
        className="ui"
        style={{
          color: active ? `var(--f-${folder.id}-ink)` : "var(--text-faint)",
          fontSize: 12,
          marginLeft: 2,
          opacity: 0.6,
        }}
      >
        ×
      </span>
    </div>
  );
}

function WorkspaceDualLight() { return <WorkspaceView theme="light" mode="dual" />; }
function WorkspaceSingleLight() { return <WorkspaceView theme="light" mode="single" />; }
function WorkspaceDualDark() { return <WorkspaceView theme="dark" mode="dual" />; }

window.WorkspaceDualLight = WorkspaceDualLight;
window.WorkspaceSingleLight = WorkspaceSingleLight;
window.WorkspaceDualDark = WorkspaceDualDark;
