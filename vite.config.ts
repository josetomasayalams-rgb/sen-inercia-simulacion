import { defineConfig } from "vite";

// GitHub Pages sirve el proyecto bajo /<repositorio>/; en local Vite sigue
// usando la raíz para que npm run dev y npm run preview funcionen igual.
export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? "/sen-inercia-simulacion/" : "/",
});
