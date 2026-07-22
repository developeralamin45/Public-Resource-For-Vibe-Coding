/**
 * Lets TypeScript import .webp logo files as string URLs
 * (`import logo from "./assets/bkash.webp"`). Most bundlers (Vite, Next, CRA,
 * webpack asset modules) resolve these at build time. If your project already
 * declares image modules globally, you can delete this file.
 */
declare module "*.webp" {
  const src: string;
  export default src;
}
