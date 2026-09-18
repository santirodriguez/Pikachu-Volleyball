'use strict';

const path = require('path');

const nativeOutputDirectory = process.env.PV_NATIVE_BUNDLE_DIR
  ? path.resolve(process.env.PV_NATIVE_BUNDLE_DIR)
  : path.resolve(__dirname, 'build/phase5/native-host');

module.exports = {
  mode: 'production',
  target: ['web', 'es2020'],
  entry: './src/resources/js/native_app.js',
  output: {
    filename: 'native-app.bundle.js',
    path: nativeOutputDirectory,
    library: {
      name: 'PikachuNativeApp',
      type: 'var',
    },
    clean: false,
  },
  devtool: false,
  optimization: {
    minimize: false,
  },
  performance: {
    hints: false,
  },
};
