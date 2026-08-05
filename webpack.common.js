const fs = require('fs');
const path = require('path');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const WorkboxPlugin = require('workbox-webpack-plugin');

function createCatalanIndexTemplate() {
  return fs
    .readFileSync(path.resolve(__dirname, 'src/en/index.html'), 'utf8')
    .replace('<html lang="en">', '<html lang="ca">')
    .replace(
      'content="Play the game Pikachu Volleyball"',
      'content="Juga a Pikachu Volleyball al web o a Linux"'
    )
    .replace('Loading the game assets...', 'Carregant els recursos del joc...')
    .replace('A new version is available. Update now?', 'Hi ha una versió nova. Vols actualitzar ara?')
    .replace(
      'Update Now (current game state will be lost)',
      'Actualitza ara (es perdrà el partit actual)'
    )
    .replace(
      'Later (automatically at relaunching the browser)',
      'Més tard (automàticament en tornar a obrir el navegador)'
    );
}

const MAIN_CHUNKS = [
  'runtime',
  'main',
  'dark_color_scheme',
  'is_embedded_in_other_website',
];

const HTML_MINIFY = {
  collapseWhitespace: true,
  removeComments: true,
};

module.exports = {
  entry: {
    main: './src/resources/js/main.js',
    ko: './src/ko/ko.js',
    dark_color_scheme: './src/resources/js/utils/dark_color_scheme.js',
    is_embedded_in_other_website:
      './src/resources/js/utils/is_embedded_in_other_website.js',
  },
  output: {
    filename: '[name].bundle.js',
    path: path.resolve(__dirname, 'dist'),
  },
  optimization: {
    runtimeChunk: { name: 'runtime' },
    splitChunks: {
      chunks: 'all',
    },
  },
  plugins: [
    new CleanWebpackPlugin(),
    new CopyPlugin({
      patterns: [
        {
          context: 'src/',
          from: 'resources/assets/**/*.+(json|png|mp3|wav)',
        },
        { from: 'src/en/manifest.json', to: 'en/manifest.json' },
        { from: 'src/es-ar/manifest.json', to: 'es-ar/manifest.json' },
        { from: 'src/ca/manifest.json', to: 'ca/manifest.json' },
        { from: 'src/ko/manifest.json', to: 'ko/manifest.json' },
        { from: 'src/zh/manifest.json', to: 'zh/manifest.json' },
        { from: 'src/resources/style.css', to: 'resources/style.css' },
        {
          from: 'src/resources/integrated-menu.css',
          to: 'resources/integrated-menu.css',
        },
        {
          from: 'src/resources/phase3-menu.css',
          to: 'resources/phase3-menu.css',
        },
        { from: 'src/index.html', to: 'index.html' },
      ],
    }),
    new HtmlWebpackPlugin({
      template: 'src/en/index.html',
      filename: 'en/index.html',
      chunks: MAIN_CHUNKS,
      chunksSortMode: 'manual',
      minify: HTML_MINIFY,
    }),
    new HtmlWebpackPlugin({
      template: 'src/es-ar/index.html',
      filename: 'es-ar/index.html',
      chunks: MAIN_CHUNKS,
      chunksSortMode: 'manual',
      minify: HTML_MINIFY,
    }),
    new HtmlWebpackPlugin({
      templateContent: createCatalanIndexTemplate,
      filename: 'ca/index.html',
      chunks: MAIN_CHUNKS,
      chunksSortMode: 'manual',
      minify: HTML_MINIFY,
    }),
    new HtmlWebpackPlugin({
      template: 'src/ko/index.html',
      filename: 'ko/index.html',
      chunks: ['runtime', 'ko', ...MAIN_CHUNKS.slice(1)],
      chunksSortMode: 'manual',
      minify: HTML_MINIFY,
    }),
    new HtmlWebpackPlugin({
      template: 'src/zh/index.html',
      filename: 'zh/index.html',
      chunks: MAIN_CHUNKS,
      chunksSortMode: 'manual',
      minify: HTML_MINIFY,
    }),
    new HtmlWebpackPlugin({
      template: 'src/en/update-history/index.html',
      filename: 'en/update-history/index.html',
      chunks: ['dark_color_scheme'],
      chunksSortMode: 'manual',
      minify: HTML_MINIFY,
    }),
    new HtmlWebpackPlugin({
      template: 'src/es-ar/update-history/index.html',
      filename: 'es-ar/update-history/index.html',
      chunks: ['dark_color_scheme'],
      chunksSortMode: 'manual',
      minify: HTML_MINIFY,
    }),
    new HtmlWebpackPlugin({
      template: 'src/ca/update-history/index.html',
      filename: 'ca/update-history/index.html',
      chunks: ['dark_color_scheme'],
      chunksSortMode: 'manual',
      minify: HTML_MINIFY,
    }),
    new HtmlWebpackPlugin({
      template: 'src/ko/update-history/index.html',
      filename: 'ko/update-history/index.html',
      chunks: ['dark_color_scheme'],
      chunksSortMode: 'manual',
      minify: HTML_MINIFY,
    }),
    new HtmlWebpackPlugin({
      template: 'src/zh/update-history/index.html',
      filename: 'zh/update-history/index.html',
      chunks: ['dark_color_scheme'],
      chunksSortMode: 'manual',
      minify: HTML_MINIFY,
    }),
    new WorkboxPlugin.GenerateSW({
      swDest: 'sw.js',
      cleanupOutdatedCaches: true,
      skipWaiting: false,
    }),
  ],
};
