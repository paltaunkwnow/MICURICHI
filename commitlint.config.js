/**
 * Conventional Commits en español con scope obligatorio (CLAUDE.md §12.2).
 * Ejemplo: feat(geo-service): resolver UV por point-in-polygon con manejo de borde
 */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'docs', 'chore', 'refactor', 'test', 'ci', 'perf', 'build'],
    ],
    'scope-enum': [
      2,
      'always',
      [
        'web-ciudadano',
        'panel-admin',
        'api-core',
        'geo-service',
        'db',
        'geodata-etl',
        'contracts',
        'infra',
        'e2e',
        'docs',
        'repo',
        'claude',
      ],
    ],
    'scope-empty': [2, 'never'],
    'subject-case': [0],
    'header-max-length': [2, 'always', 100],
    'body-max-line-length': [0],
  },
};
