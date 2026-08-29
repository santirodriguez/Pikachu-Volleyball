const path = require('path');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const WorkboxPlugin = require('workbox-webpack-plugin');

const MAIN_CHUNKS = ['runtime', 'main', 'is_embedded_in_other_website'];

const GAME_LOCALES = Object.freeze([
  { locale: 'en', chunks: MAIN_CHUNKS },
  { locale: 'es-ar', chunks: MAIN_CHUNKS },
  { locale: 'ca', chunks: MAIN_CHUNKS },
  { locale: 'ko', chunks: ['runtime', 'ko', ...MAIN_CHUNKS.slice(1)] },
  { locale: 'zh', chunks: MAIN_CHUNKS },
]);

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
        { from: 'src/index.html', to: 'index.html' },
      ],
    }),
    ...GAME_LOCALES.map(
      ({ locale, chunks }) =>
        new HtmlWebpackPlugin({
          template: `src/${locale}/index.html`,
          filename: `${locale}/index.html`,
          chunks,
          chunksSortMode: 'manual',
          minify: HTML_MINIFY,
        })
    ),
    ...GAME_LOCALES.map(
      ({ locale }) =>
        new HtmlWebpackPlugin({
          template: `src/${locale}/update-history/index.html`,
          filename: `${locale}/update-history/index.html`,
          chunks: ['dark_color_scheme'],
          chunksSortMode: 'manual',
          minify: HTML_MINIFY,
        })
    ),
    new WorkboxPlugin.GenerateSW({
      swDest: 'sw.js',
      cleanupOutdatedCaches: true,
      skipWaiting: false,
    }),
  ],
};
