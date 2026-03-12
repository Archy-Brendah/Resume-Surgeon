// Cloudflare Pages / next-on-pages environment bindings.
// Extend this interface with any KV, R2, D1, etc. you add in wrangler.toml.
interface CloudflareEnv {
  // Example bindings (uncomment and adjust as needed):
  // DB: D1Database;
  // MY_KV: KVNamespace;
  // MY_BUCKET: R2Bucket;
}

declare module "cloudflare:env" {
  const env: CloudflareEnv;
  export { env };
}

