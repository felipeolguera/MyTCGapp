import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.archivebinder.ga",
  appName: "Archive Binder",
  webDir: "dist",
  server: {
    androidScheme: "https",
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    // Native HTTP bypasses WebView CORS (TCGCSV / GATCG refresh & search).
    CapacitorHttp: {
      enabled: true,
    },
  },
};

export default config;
