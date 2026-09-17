'use strict';

const path = require('path');

module.exports = {
  mode: 'production',
  target: ['web', 'es2020'],
  entry: './src/resources/js/native_app.js',
  output: {
    filename: 'native-app.bundle.js',
    path: path.resolve(__dirname, 'build/phase5/native-host'),
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
