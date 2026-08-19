/** dsh-studio-input-history, host half. Pure client plugin: the empty apply
 * exists so the plugin appears in the Loader / aggregates cleanly; the
 * browser logic ships via exports["./client"] (discovered through the
 * package.json `dsh.client` declaration), exactly like the official
 * surface-only UI plugins. */

/** Host plugin body — no host-side behavior for this surface plugin. */
export function apply(): void {}
