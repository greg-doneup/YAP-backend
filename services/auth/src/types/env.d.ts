declare namespace NodeJS {
  interface ProcessEnv {
    APP_JWT_SECRET: string;
    APP_REFRESH_SECRET?: string; // Optional, will default to APP_JWT_SECRET + '_refresh'
    PORT?: string; // Optional, defaults to 8080
    PROFILE_SERVICE_URL?: string; // Optional, defaults to http://profile-service:8080
    OFFCHAIN_PROFILE_SERVICE_URL?: string; // Optional, defaults to http://offchain-profile-service:8080
    SKIP_PROFILE_CREATION?: string; // Optional, set to 'true' to skip profile creation
  }
}
