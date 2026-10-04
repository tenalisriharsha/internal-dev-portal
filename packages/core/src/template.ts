import { promises as fs } from "node:fs";
import path from "node:path";

export interface TemplateVariables {
  name: string;
  description: string;
  owner: string;
  lifecycle: string;
  [key: string]: string;
}

function renderString(content: string, variables: TemplateVariables): string {
  return content.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => {
    if (!(key in variables)) {
      throw new Error(`template references unknown variable "${key}"`);
    }
    return variables[key];
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
    const targetPath = path.join(outputDir, renderString(targetRelative, variables));

    const raw = await fs.readFile(sourceFile, "utf8");
    const rendered = renderString(raw, variables);

    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, rendered, "utf8");
    written.push(targetPath);
  }

  return written;
}
