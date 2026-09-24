import * as migration_20260918_102911_initial from './20260918_102911_initial';

export const migrations = [
  {
    up: migration_20260918_102911_initial.up,
    down: migration_20260918_102911_initial.down,
    name: '20260918_102911_initial'
  },
];
