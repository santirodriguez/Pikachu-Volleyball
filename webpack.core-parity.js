const path = require('path');

module.exports = {
  mode: 'production',
  target: ['web', 'es2020'],
  entry: './src/resources/js/core_parity_runner.js',
  devtool: false,
  optimization: {
    minimize: false,
  },
  output: {
    filename: 'core-parity.bundle.js',
    path: path.resolve(__dirname, 'build/phase4'),
  },
};
