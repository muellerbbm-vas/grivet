module.exports = {
  testEnvironment: 'node',
  displayName: 'grivet',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.spec.json' }]
  },
  coverageDirectory: 'coverage',
  collectCoverage: true,
  coverageReporters: ['html', 'cobertura']
};
