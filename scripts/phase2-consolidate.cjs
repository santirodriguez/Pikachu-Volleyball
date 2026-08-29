'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const write = (file, content) => fs.writeFileSync(path.join(root, file), content);

function replaceExact(content, before, after, label) {
  if (!content.includes(before)) {
    throw new Error(`Missing expected pattern: ${label}`);
  }
  return content.replace(before, after);
}

function replaceRegex(content, pattern, replacement, label) {
  if (!pattern.test(content)) {
    throw new Error(`Missing expected pattern: ${label}`);
  }
  pattern.lastIndex = 0;
  return content.replace(pattern, replacement);
}

const stringsPath = 'src/resources/js/integrated_menu_strings.js';
const phase3StringsPath = 'src/resources/js/integrated_menu_phase3_strings.js';
const themePath = 'src/resources/js/integrated_menu_theme.js';

let baseStrings = read(stringsPath);
const phase3Strings = read(phase3StringsPath);
const themeStrings = read(themePath);

baseStrings = replaceRegex(
  baseStrings,
  /\nconst STRINGS = Object\.freeze\(\{ en: EN, 'es-ar': ES, ko: KO, zh: ZH \}\);\n\nexport function getIntegratedMenuStrings\(locale\) \{[\s\S]*?\n\}\s*$/,
  '',
  'legacy integrated menu getter'
);

const phase3Data = replaceRegex(
  phase3Strings.replace(/^'use strict';\n\n/, ''),
  /\nexport function getPhase3MenuStrings\(locale, baseStrings\) \{[\s\S]*?\n\}\s*$/,
  '',
  'Phase 3 menu getter'
);

let themeData = themeStrings.replace(/^'use strict';\n\n/, '');
themeData = replaceExact(themeData, 'const COPY = Object.freeze(', 'const THEME_COPY = Object.freeze(', 'theme copy owner');
themeData = replaceRegex(
  themeData,
  /\nexport function getIntegratedMenuThemeCopy\(locale\) \{[\s\S]*?\n\}\s*$/,
  '',
  'theme getter'
);

const unifiedGetter = `

const BASE_STRINGS = Object.freeze({ en: EN, 'es-ar': ES, ko: KO, zh: ZH });

function composeMenuStrings(locale, baseStrings) {
  const editor = CONTROL_EDITOR[locale] || CONTROL_EDITOR.en;
  const about = ABOUT_COPY[locale] || ABOUT_COPY.en;
  if (locale === 'ca') {
    return {
      ...baseStrings,
      ...CATALAN,
      about,
      controls: { ...CATALAN.controls, ...editor },
    };
  }
  return {
    ...baseStrings,
    about,
    controls: { ...baseStrings.controls, ...editor },
  };
}

export function getIntegratedMenuStrings(locale) {
  const baseStrings = BASE_STRINGS[locale] || EN;
  return {
    ...composeMenuStrings(locale, baseStrings),
    theme: THEME_COPY[locale] || THEME_COPY.en,
  };
}
`;

write(stringsPath, `${baseStrings.trimEnd()}\n\n${phase3Data.trim()}\n\n${themeData.trim()}${unifiedGetter}`);

let menu = read('src/resources/js/integrated_menu.js');
menu = replaceExact(
  menu,
  "import { getIntegratedMenuStrings } from './integrated_menu_strings.js';\nimport { getPhase3MenuStrings } from './integrated_menu_phase3_strings.js';\nimport { getIntegratedMenuThemeCopy } from './integrated_menu_theme.js';",
  "import { getIntegratedMenuStrings } from './integrated_menu_strings.js';",
  'menu string imports'
);
menu = replaceExact(
  menu,
  `  const strings = getPhase3MenuStrings(\n    locale,\n    getIntegratedMenuStrings(locale)\n  );`,
  '  const strings = getIntegratedMenuStrings(locale);',
  'menu string composition'
);
menu = replaceExact(
  menu,
  '        ${themeSettingMarkup(settings.colorScheme, settings.locale)}',
  '        ${themeSettingMarkup(settings.colorScheme, strings.theme)}',
  'theme setting call'
);
menu = replaceExact(
  menu,
  `function themeSettingMarkup(currentValue, locale) {\n  const copy = getIntegratedMenuThemeCopy(locale);`,
  'function themeSettingMarkup(currentValue, copy) {',
  'theme setting helper'
);
write('src/resources/js/integrated_menu.js', menu);

const integratedCssPath = 'src/resources/integrated-menu.css';
const phase3CssPath = 'src/resources/phase3-menu.css';
const integratedCss = read(integratedCssPath).trimEnd();
const phase3Css = read(phase3CssPath).trim();
write(integratedCssPath, `${integratedCss}\n\n/* Control editor */\n${phase3Css}\n`);

let webpack = read('webpack.common.js');
webpack = replaceRegex(
  webpack,
  /function createCatalanIndexTemplate\(\) \{[\s\S]*?\n\}\n\n(?=const MAIN_CHUNKS)/,
  '',
  'Catalan generated template helper'
);
webpack = replaceExact(
  webpack,
  "const MAIN_CHUNKS = ['runtime', 'main', 'is_embedded_in_other_website'];",
  `const MAIN_CHUNKS = ['runtime', 'main', 'is_embedded_in_other_website'];\n\nconst GAME_LOCALES = Object.freeze([\n  { locale: 'en', chunks: MAIN_CHUNKS },\n  { locale: 'es-ar', chunks: MAIN_CHUNKS },\n  { locale: 'ca', chunks: MAIN_CHUNKS },\n  { locale: 'ko', chunks: ['runtime', 'ko', ...MAIN_CHUNKS.slice(1)] },\n  { locale: 'zh', chunks: MAIN_CHUNKS },\n]);`,
  'locale build configuration'
);
webpack = replaceRegex(
  webpack,
  /\n        \{\n          from: 'src\/resources\/phase3-menu\.css',\n          to: 'resources\/phase3-menu\.css',\n        \},/,
  '',
  'Phase 3 stylesheet copy'
);

const htmlPluginsStart = webpack.indexOf("    new HtmlWebpackPlugin({\n      template: 'src/en/index.html'");
const htmlPluginsEnd = webpack.indexOf('    new WorkboxPlugin.GenerateSW({');
if (htmlPluginsStart < 0 || htmlPluginsEnd < 0 || htmlPluginsEnd <= htmlPluginsStart) {
  throw new Error('Unable to locate HtmlWebpackPlugin block');
}
const declarativeHtmlPlugins = `    ...GAME_LOCALES.map(\n      ({ locale, chunks }) =>\n        new HtmlWebpackPlugin({\n          template: \`src/\${locale}/index.html\`,\n          filename: \`\${locale}/index.html\`,\n          chunks,\n          chunksSortMode: 'manual',\n          minify: HTML_MINIFY,\n        })\n    ),\n    ...GAME_LOCALES.map(\n      ({ locale }) =>\n        new HtmlWebpackPlugin({\n          template: \`src/\${locale}/update-history/index.html\`,\n          filename: \`\${locale}/update-history/index.html\`,\n          chunks: ['dark_color_scheme'],\n          chunksSortMode: 'manual',\n          minify: HTML_MINIFY,\n        })\n    ),\n`;
webpack = `${webpack.slice(0, htmlPluginsStart)}${declarativeHtmlPlugins}${webpack.slice(htmlPluginsEnd)}`;
write('webpack.common.js', webpack);

let catalanIndex = read('src/en/index.html');
const catalanReplacements = [
  ['<html lang="en">', '<html lang="ca">'],
  ['content="Play the game Pikachu Volleyball"', 'content="Juga a Pikachu Volleyball al web o a Linux"'],
  ['Loading the game assets...', 'Carregant els recursos del joc...'],
  ['A new version is available. Update now?', 'Hi ha una versió nova. Vols actualitzar ara?'],
  ['Update Now (current game state will be lost)', 'Actualitza ara (es perdrà el partit actual)'],
  ['Later (automatically at relaunching the browser)', 'Més tard (automàticament en tornar a obrir el navegador)'],
];
for (const [before, after] of catalanReplacements) {
  catalanIndex = replaceExact(catalanIndex, before, after, `Catalan index: ${before}`);
}
write('src/ca/index.html', catalanIndex);

let quality = read('.github/workflows/pull-request-quality.yml');
quality = replaceExact(
  quality,
  '            dist/resources/phase3-menu.css',
  '            dist/resources/integrated-menu.css',
  'quality stylesheet gate'
);
write('.github/workflows/pull-request-quality.yml', quality);

for (const file of [phase3StringsPath, themePath, phase3CssPath]) {
  fs.unlinkSync(path.join(root, file));
}

const productionFiles = [
  'src/resources/js/integrated_menu.js',
  stringsPath,
  integratedCssPath,
  'webpack.common.js',
  '.github/workflows/pull-request-quality.yml',
];
for (const file of productionFiles) {
  const content = read(file);
  if (content.includes('integrated_menu_phase3_strings') || content.includes('phase3-menu.css')) {
    throw new Error(`Residual Phase 3 production reference in ${file}`);
  }
}

console.log('Phase 2 build/localization/UI consolidation applied successfully.');
