module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  name: 'grivet',
  globals: {
    'ts-jest': {
      tsConfig: 'tsconfig.spec.json'
    }
  },
  coverageDirectory: 'coverage',
  collectCoverage: true,
  coverageReporters: ['html', 'cobertura']
};
