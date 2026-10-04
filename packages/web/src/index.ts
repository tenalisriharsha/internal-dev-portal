import path from "node:path";
import { createApp } from "./app";

const repoRoot = path.resolve(__dirname, "../../..");
const PORT = Number(process.env.PORT ?? 3000);

const app = createApp({
  repoRoot,
  catalogDirs: [path.join(repoRoot, "catalog", "examples"), path.join(repoRoot, "generated")],
  templateDir: path.join(repoRoot, "templates", "golden-path-service"),
  generatedDir: path.join(repoRoot, "generated"),
});

app.listen(PORT, () => {
  console.log(`Internal Developer Portal listening on http://localhost:${PORT}`);
});
