import { promises as fs } from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

export interface TemplateVariables {
  name: string;
  description: string;
  owner: string;
  lifecycle: string;
  [key: string]: string;
}

/**
 * Variables whose value is itself pre-formatted YAML syntax (e.g. a flow
 * sequence like `[a, b]`) rather than a plain scalar, and so must be
 * inserted verbatim instead of being quoted as a string.
 */
const RAW_YAML_SUFFIX = "Yaml";

function yamlScalar(value: string): string {
  return yaml.dump(value, { forceQuotes: true, quotingType: '"' }).trim();
}

function jsonScalar(value: string): string {
  return JSON.stringify(value).slice(1, -1);
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function htmlScalar(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

/**
 * A `//` line comment ends at the first line terminator, so anything after
 * one would land as live, uncommented source rather than as escaped text.
 */
function tsScalar(value: string): string {
  return value.split(/\r\n|\r|\n/)[0];
}

type EscapeMode = "yaml" | "json" | "html" | "ts" | "none";

function renderString(
  content: string,
  variables: TemplateVariables,
  escapeMode: EscapeMode,
): string {
  return content.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => {
    if (!(key in variables)) {
      throw new Error(`template references unknown variable "${key}"`);
    }
    const value = variables[key];
    if (escapeMode === "yaml" && !key.endsWith(RAW_YAML_SUFFIX)) {
      return yamlScalar(value);
    }
    if (escapeMode === "json") {
      return jsonScalar(value);
    }
    if (escapeMode === "html") {
      return htmlScalar(value);
    }
    if (escapeMode === "ts") {
      return tsScalar(value);
    }
    return value;
  });
}

async function walk(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(fullPath)));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

/**
 * Renders every `*.tmpl` file under templateDir into outputDir, substituting
 * `{{variable}}` placeholders and stripping the `.tmpl` suffix. Refuses to
 * write into a directory that already exists, so a service can never be
 * silently overwritten by a second scaffold request.
 */
export async function renderTemplate(
  templateDir: string,
  outputDir: string,
  variables: TemplateVariables,
): Promise<string[]> {
  try {
    await fs.access(outputDir);
    throw new Error(`output directory already exists: ${outputDir}`);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("output directory already exists")) {
      throw err;
    }
    // ENOENT is expected: the directory must not exist yet.
  }

  const sourceFiles = await walk(templateDir);
  const written: string[] = [];

  for (const sourceFile of sourceFiles) {
    const relative = path.relative(templateDir, sourceFile);
    const targetRelative = relative.endsWith(".tmpl")
      ? relative.slice(0, -".tmpl".length)
      : relative;
    const targetPath = path.join(outputDir, renderString(targetRelative, variables, "none"));

    const raw = await fs.readFile(sourceFile, "utf8");
    const escapeMode: EscapeMode = /\.ya?ml$/.test(targetRelative)
      ? "yaml"
      : /\.json$/.test(targetRelative)
        ? "json"
        : /\.html?$/.test(targetRelative)
          ? "html"
          : /\.tsx?$/.test(targetRelative)
            ? "ts"
            : "none";
    const rendered = renderString(raw, variables, escapeMode);

    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, rendered, "utf8");
    written.push(targetPath);
  }

  return written;
}
