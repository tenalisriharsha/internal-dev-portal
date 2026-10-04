export interface AppOptions {
  /** Root directories scanned for `<service>/catalog-info.yaml` files, merged into one catalog. */
  catalogDirs: string[];
  /** Golden-path template directory rendered by the self-service create flow. */
  templateDir: string;
  /** Directory the create flow writes newly scaffolded services into. Must be one of catalogDirs. */
  generatedDir: string;
}
