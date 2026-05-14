// Vault data — minimal & realistic. The folder ID is used directly
// as the color key in CSS (--f-{id}, --f-{id}-deep, --f-{id}-ink),
// so adding a folder = adding a token group, no mapping table needed.

window.SR_VAULT = {
  name: "Wilson's knowledge",
  path: "~/Documents/swirl-vault",
  rootCount: 41,
  folderCount: 6,
  fileCount: 41,

  folders: [
    {
      id: "knowledge",
      name: "knowledge",
      summary: "Frontend, backend, algorithms — the working set.",
      childCount: 14,
      childFolders: 3,
      lastOpened: "today",
      files: [
        { id: "k-1", name: "frontend-architecture", ext: "md",   size: "12 KB", words: 1840, updated: "2d ago" },
        { id: "k-2", name: "react-rendering-model", ext: "md",   size: "8 KB",  words: 1290, updated: "today"  },
        { id: "k-3", name: "system-design-cheatsheet", ext: "md", size: "5 KB",  words: 720,  updated: "1w ago" },
        { id: "k-4", name: "algorithms-graph",      ext: "md",   size: "9 KB",  words: 1400, updated: "today"  },
        { id: "k-5", name: "css-grid-recipes",      ext: "html", size: "22 KB", words: 940,  updated: "3w ago" },
      ],
    },
    {
      id: "career",
      name: "career",
      summary: "STAR stories, resume, interview prep.",
      childCount: 11,
      childFolders: 2,
      lastOpened: "yesterday",
      files: [
        { id: "c-1", name: "star-mentoring-incident", ext: "md",   size: "3 KB",  words: 540,  updated: "5d ago"     },
        { id: "c-2", name: "background",              ext: "md",   size: "6 KB",  words: 980,  updated: "2w ago"     },
        { id: "c-3", name: "interview-questions",     ext: "md",   size: "9 KB",  words: 1620, updated: "yesterday"  },
        { id: "c-4", name: "resume-v8",                ext: "html", size: "14 KB", words: 510,  updated: "3d ago"     },
      ],
    },
    {
      id: "reading",
      name: "reading",
      summary: "Essays, notes from books, marginalia.",
      childCount: 7,
      childFolders: 0,
      lastOpened: "today",
      files: [
        { id: "r-1", name: "why-slow-reading-wins", ext: "md", size: "7 KB",  words: 1140, updated: "today"  },
        { id: "r-2", name: "reading-rituals",        ext: "md", size: "4 KB",  words: 720,  updated: "1w ago" },
        { id: "r-3", name: "active-vs-passive",      ext: "md", size: "6 KB",  words: 1050, updated: "3d ago" },
        { id: "r-4", name: "thinking-with-ai",       ext: "md", size: "11 KB", words: 2280, updated: "today"  },
      ],
    },
    {
      id: "ai",
      name: "ai",
      summary: "Context bundles, prompts, model notes.",
      childCount: 9,
      childFolders: 2,
      lastOpened: "today",
      files: [
        { id: "a-1", name: "context-bundle-frontend", ext: "md",   size: "16 KB", words: 2900, updated: "today"  },
        { id: "a-2", name: "prompt-library",          ext: "md",   size: "5 KB",  words: 880,  updated: "4d ago" },
        { id: "a-3", name: "model-comparisons",       ext: "html", size: "31 KB", words: 1840, updated: "2w ago" },
      ],
    },
    {
      id: "tasks",
      name: "tasks",
      summary: "Sprint queues, todos, follow-ups.",
      childCount: 5,
      childFolders: 0,
      lastOpened: "yesterday",
      files: [
        { id: "t-1", name: "week-19-todo", ext: "md", size: "2 KB", words: 320, updated: "today"     },
        { id: "t-2", name: "follow-ups",   ext: "md", size: "3 KB", words: 480, updated: "yesterday" },
      ],
    },
    {
      id: "journal",
      name: "z-journal",
      summary: "Dailies, weeklies, the slow log.",
      childCount: 8,
      childFolders: 0,
      lastOpened: "3d ago",
      files: [
        { id: "j-1", name: "2026-05-18-sun", ext: "md", size: "2 KB", words: 380, updated: "today"   },
        { id: "j-2", name: "week-19-review", ext: "md", size: "4 KB", words: 680, updated: "Sun"     },
        { id: "j-3", name: "week-18-review", ext: "md", size: "3 KB", words: 540, updated: "1w ago"  },
      ],
    },
  ],

  recent: [
    { folder: "reading",   file: "thinking-with-ai",        ext: "md", at: "5 min ago"     },
    { folder: "knowledge", file: "react-rendering-model",   ext: "md", at: "today, 13:02"  },
    { folder: "career",    file: "interview-questions",     ext: "md", at: "yesterday"     },
    { folder: "journal",   file: "week-19-review",          ext: "md", at: "Sun"           },
  ],
};

// Resolve a folder ID into its CSS variable references.
window.CZ_COLOR = function (id) {
  return {
    bg:   `var(--f-${id})`,
    deep: `var(--f-${id}-deep)`,
    ink:  `var(--f-${id}-ink)`,
  };
};
