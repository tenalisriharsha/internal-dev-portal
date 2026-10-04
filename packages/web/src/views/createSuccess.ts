import { escapeHtml } from "./escape";
import { layout } from "./layout";

export function renderCreateSuccess(name: string, files: string[]): string {
  const fileItems = files.map((file) => `<li><code>${escapeHtml(file)}</code></li>`).join("");

  const body = `
    <div class="page-header">
      <h1>Service created</h1>
      <p class="page-subtitle"><code>${escapeHtml(name)}</code> was scaffolded from the golden-path template and is now live in the catalog.</p>
    </div>
    <div class="panel">
      <h2>Generated files</h2>
      <ul class="file-list">${fileItems}</ul>
    </div>
    <div class="success-actions">
      <a class="btn-primary" href="/services/${encodeURIComponent(name)}">View service</a>
      <a class="btn-secondary" href="/">Back to catalog</a>
    </div>`;

  return layout("Service Created", body);
}
