export const BETA_MODE = typeof window !== 'undefined'
  && localStorage.getItem('skyguard-beta-mode') === 'true';
