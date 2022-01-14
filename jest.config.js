module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  name: 'grivet',
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.spec.json'
    }
  },
  coverageDirectory: 'coverage',
  collectCoverage: true,
  coverageReporters: ['html', 'cobertura']
};
