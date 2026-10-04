export interface AppOptions {
  /** Repo root, used only to display source file paths relative instead of absolute. */
  repoRoot: string;
  /** Root directories scanned for `<service>/catalog-info.yaml` files, merged into one catalog. */
  catalogDirs: string[];
  /** Golden-path template directory rendered by the self-service create flow. */
  templateDir: string;
  /** Directory the create flow writes newly scaffolded services into. Must be one of catalogDirs. */
  generatedDir: string;
}
