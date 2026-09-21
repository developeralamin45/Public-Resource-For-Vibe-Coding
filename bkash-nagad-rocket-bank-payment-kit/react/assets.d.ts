// Lets TypeScript import the wallet logos. Delete if the project already
// declares image modules (Vite's `vite/client`, CRA's `react-app-env.d.ts`).
declare module '*.webp' {
    const src: string;
    export default src;
}
