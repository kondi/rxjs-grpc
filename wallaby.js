module.exports = function(wallaby) {

  return {
    files: [
      'src/**/*.ts',
      '!src/**/*.spec.ts'
    ],

    tests: [
      'src/**/*.spec.ts'
    ],

    env: {
      type: 'node'
    },

    testFramework: 'jasmine'

  };

};
