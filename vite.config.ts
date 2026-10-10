import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        builder: 'documents/html/visualBuilder/HTMLElementVisualBuilder.html',
        textProperties: 'documents/html/visualBuilder/text-properties-builder.html',
        svgText: 'documents/html/visualBuilder/svg-text-builder.html',
        canvasText: 'documents/html/visualBuilder/canvas-text-builder.html',
      },
    },
  },
});
