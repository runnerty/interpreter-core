export default {
  input: 'index.js',
  output: {
    file: 'index.cjs',
    format: 'cjs',
    generatedCode: {
      constBindings: true
    }
  },
  external: ['object-sizeof', 'uuid', 'crypto', 'lodash', 'moment', 'path'],
  onLog(level, log, handler) {
    if (log.code === 'CIRCULAR_DEPENDENCY') {
      return; // Ignore circular dependency warnings
    }
    handler(level, log); // otherwise, just print the log
  }
};
