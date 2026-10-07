import type { CatalogEntry } from "@idp/core";
import { escapeHtml } from "./escape";
import { layout } from "./layout";

export interface CreateFormValues {
  name: string;
  description: string;
  owner: string;
  kind: string;
  lifecycle: string;
  dependsOn: string[];
}

const LIFECYCLES = ["experimental", "staging", "production", "deprecated"];
const KINDS = ["Service", "Website", "Library"];

export function renderCreateForm(
  existingServices: CatalogEntry[],
  values: CreateFormValues,
  errors: string[] = [],
): string {
  const lifecycleOptions = LIFECYCLES.map(
    (lifecycle) =>
      `<option value="${lifecycle}" ${values.lifecycle === lifecycle ? "selected" : ""}>${lifecycle}</option>`,
  ).join("");

  const kindOptions = KINDS.map(
    (kind) => `<option value="${kind}" ${values.kind === kind ? "selected" : ""}>${kind}</option>`,
  ).join("");

  const dependencyCheckboxes = existingServices
    .map(
      (service) => `
      <label class="checkbox-option">
        <input type="checkbox" name="dependsOn" value="${escapeHtml(service.metadata.name)}" ${values.dependsOn.includes(service.metadata.name) ? "checked" : ""} />
        ${escapeHtml(service.metadata.name)}
      </label>`,
    )
    .join("");

  const errorBanner =
    errors.length > 0
      ? `<div class="error-banner"><strong>Could not create service:</strong><ul>${errors
          .map((error) => `<li>${escapeHtml(error)}</li>`)
          .join("")}</ul></div>`
      : "";

  const body = `
    <div class="page-header">
      <h1>Create New Service</h1>
      <p class="page-subtitle">Scaffolds a new service from the golden-path template and registers it in the catalog.</p>
    </div>
    ${errorBanner}
    <form class="panel create-form" method="post" action="/create">
      <label class="form-field">
        <span>Service name</span>
        <input type="text" name="name" placeholder="billing-service" value="${escapeHtml(values.name)}" required pattern="[a-z0-9]+(-[a-z0-9]+)*" title="lowercase letters, numbers, and hyphens only" />
        <small>Lowercase, hyphenated (e.g. <code>billing-service</code>). Used as the catalog key and directory name.</small>
      </label>

      <label class="form-field">
        <span>Description</span>
        <textarea name="description" rows="2" required>${escapeHtml(values.description)}</textarea>
      </label>

      <label class="form-field">
        <span>Owning team</span>
        <input type="text" name="owner" placeholder="team-billing" value="${escapeHtml(values.owner)}" required />
      </label>

      <label class="form-field">
        <span>Kind</span>
        <select name="kind">${kindOptions}</select>
        <small>Which golden-path template to scaffold from.</small>
      </label>

      <label class="form-field">
        <span>Lifecycle</span>
        <select name="lifecycle">${lifecycleOptions}</select>
      </label>

      <fieldset class="form-field">
        <legend>Depends on</legend>
        ${
          existingServices.length > 0
            ? `<div class="checkbox-grid">${dependencyCheckboxes}</div>`
            : '<p class="empty-state">No existing services to depend on yet.</p>'
        }
      </fieldset>

      <button type="submit" class="btn-primary">Create Service</button>
    </form>`;

  return layout("Create New Service", body, "/create");
}
