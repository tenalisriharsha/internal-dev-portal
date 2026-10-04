const NAV_LINKS: Array<{ href: string; label: string }> = [
  { href: "/", label: "Catalog" },
  { href: "/graph", label: "Dependency Graph" },
  { href: "/create", label: "Create New Service" },
];

export function layout(title: string, bodyHtml: string, activePath = ""): string {
  const nav = NAV_LINKS.map(
    (link) =>
      `<a class="nav-link${link.href === activePath ? " nav-link--active" : ""}" href="${link.href}">${link.label}</a>`,
  ).join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} · Internal Developer Portal</title>
  <link rel="stylesheet" href="/public/styles.css" />
</head>
<body>
  <header class="topbar">
    <div class="topbar__brand">Internal Developer Portal</div>
    <nav class="topbar__nav">${nav}</nav>
  </header>
  <main class="page">
    ${bodyHtml}
  </main>
</body>
</html>`;
}
